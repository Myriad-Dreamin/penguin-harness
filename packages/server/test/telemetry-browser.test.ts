/**
 * The browser's half of telemetry (PRFC-0008): the switch `/api/me` hands a page, and the
 * intake it posts to — refused while off, open to any signed-in user, read back by an admin
 * only, and nothing but a `web.*` shape gets into the buffer.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  MeResponse,
  TelemetryBrowserSamplesResponse,
  TelemetryResponse,
} from "../src/api/types.js";
import { browserSample, BROWSER_BATCH_MAX } from "../src/telemetry/browser.js";
import { apiClient, createTestApp, loginAdmin, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

describe("browserSample", () => {
  it("keeps a web.* shape; drops server names, non-shapes and attributes past the cap", () => {
    expect(
      browserSample({
        probe: "web.turn",
        durMs: 12.34,
        n: 3.6,
        session: "session-2026-09-30-08-00-00-7e1e0001",
        attrs: { commits: 2, cached: true, kind: "tail", "bad key": 1, nan: Number.NaN },
      }),
    ).toEqual({
      probe: "web.turn",
      durMs: 12.34,
      n: 4,
      keys: { session: "session-2026-09-30-08-00-00-7e1e0001" },
      attrs: { commits: 2, cached: true, kind: "tail" },
    });
    for (const bad of [{ probe: "http.request", durMs: 1 }, { probe: "web.Bad" }, "web.turn"]) {
      expect(browserSample(bad)).toBeNull();
    }
    const junk = {
      durMs: -1,
      bytes: Number.POSITIVE_INFINITY,
      status: "x".repeat(65),
      session: "../etc/passwd",
    };
    expect(browserSample({ probe: "web.boot", ...junk, attrs: { text: "y".repeat(65) } })).toEqual({
      probe: "web.boot",
    });
    const attrs = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`a${i}`, i]));
    expect(Object.keys(browserSample({ probe: "web.boot", attrs })?.attrs ?? {})).toHaveLength(16);
  });
});

describe("POST /api/telemetry/samples", () => {
  let t: TestApp;
  let admin: ReturnType<typeof apiClient>;
  let member: ReturnType<typeof apiClient>;

  beforeEach(async () => {
    t = await createTestApp();
    admin = apiClient(t.app, (await loginAdmin(t.app)).cookie);
    member = apiClient(t.app, (await provisionUser(t.app, "member")).cookie);
  });
  afterEach(async () => {
    await t.cleanup();
  });

  const turn = async (on: boolean) => {
    expect((await admin.put("/api/admin/settings", { telemetry: on })).status).toBe(200);
  };
  const me = async (client: ReturnType<typeof apiClient>) =>
    ((await (await client.get("/api/me")).json()) as MeResponse).telemetry;
  const read = async (query: string) =>
    (await (await admin.get(`/api/telemetry${query}`)).json()) as TelemetryResponse;
  const post = (samples: unknown) => member.post("/api/telemetry/samples", { samples });

  it("off: /api/me says so to every page, and the intake answers 409 telemetry_off and stores nothing", async () => {
    expect([await me(admin), await me(member)]).toEqual([false, false]);
    const res = await post([{ probe: "web.turn", durMs: 5 }]);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("telemetry_off");
    await turn(true);
    expect([await me(admin), await me(member)]).toEqual([true, true]);
    expect((await read("?view=samples&probe=web.turn")).samples).toEqual([]);
  });

  it("on: takes a member's web.* samples into the buffer only an admin reads; refuses an unbounded body", async () => {
    await turn(true);
    const res = await post([
      { probe: "web.turn", durMs: 40, n: 12, session: "s-1", attrs: { commits: 3 } },
      { probe: "web.turn", durMs: 80, n: 20, session: "s-1" },
      { probe: "http.request", durMs: 1 },
      { probe: "web.socket.connect", durMs: 15, attrs: { openMs: 9 } },
    ]);
    expect((await res.json()) as TelemetryBrowserSamplesResponse).toEqual({ accepted: 3 });
    expect((await read("?view=probes")).probes?.find((p) => p.probe === "web.turn")).toMatchObject({
      count: 2,
      maxMs: 80,
    });
    expect((await read("?view=probes&session=s-1")).probes?.map((p) => p.probe)).toEqual([
      "web.turn",
    ]);
    expect((await member.get("/api/telemetry")).status).toBe(403);
    expect((await post("web.turn")).status).toBe(400);
    expect(
      (await post(Array.from({ length: BROWSER_BATCH_MAX + 1 }, () => ({ probe: "web.turn" }))))
        .status,
    ).toBe(400);
  });
});
