/**
 * The browser's half of telemetry (PRFC-0008): the sample intake a page posts to, and the
 * switch `/api/me` hands the page. What must hold: the intake refuses while telemetry is off
 * (so a page stops sending), any signed-in user may write but only an admin reads back, and
 * nothing that is not a `web.*` shape gets into the buffer.
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
  it("keeps a web.* shape and drops what is not one", () => {
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
  });

  it("refuses a server probe name, and fields that are not shapes", () => {
    expect(browserSample({ probe: "http.request", durMs: 1 })).toBeNull();
    expect(browserSample({ probe: "web.Bad" })).toBeNull();
    expect(browserSample("web.turn")).toBeNull();
    expect(
      browserSample({
        probe: "web.boot",
        durMs: -1,
        bytes: Number.POSITIVE_INFINITY,
        status: "x".repeat(65),
        session: "../etc/passwd",
        attrs: { text: "y".repeat(65) },
      }),
    ).toEqual({ probe: "web.boot" });
  });

  it("caps the attributes of one sample", () => {
    const attrs = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`a${i}`, i]));
    expect(Object.keys(browserSample({ probe: "web.boot", attrs })?.attrs ?? {})).toHaveLength(
      16,
    );
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
    (await (await client.get("/api/me")).json()) as MeResponse;

  it("hands the switch to every page through /api/me", async () => {
    expect((await me(admin)).telemetry).toBe(false);
    expect((await me(member)).telemetry).toBe(false);
    await turn(true);
    expect((await me(admin)).telemetry).toBe(true);
    expect((await me(member)).telemetry).toBe(true);
  });

  it("refuses with 409 telemetry_off while the switch is off, and stores nothing", async () => {
    const res = await member.post("/api/telemetry/samples", {
      samples: [{ probe: "web.turn", durMs: 5 }],
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("telemetry_off");
    await turn(true);
    const body = (await (
      await admin.get("/api/telemetry?view=samples&probe=web.turn")
    ).json()) as TelemetryResponse;
    expect(body.samples).toEqual([]);
  });

  it("takes a member's samples into the buffer an admin reads, and only an admin", async () => {
    await turn(true);
    const res = await member.post("/api/telemetry/samples", {
      samples: [
        { probe: "web.turn", durMs: 40, n: 12, session: "s-1", attrs: { commits: 3 } },
        { probe: "web.turn", durMs: 80, n: 20, session: "s-1" },
        { probe: "http.request", durMs: 1 },
        { probe: "web.socket.connect", durMs: 15, attrs: { openMs: 9 } },
      ],
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as TelemetryBrowserSamplesResponse).toEqual({ accepted: 3 });

    const probes = (await (
      await admin.get("/api/telemetry?view=probes")
    ).json()) as TelemetryResponse;
    const turnRow = probes.probes?.find((p) => p.probe === "web.turn");
    expect(turnRow).toMatchObject({ count: 2, maxMs: 80 });
    expect(probes.probes?.some((p) => p.probe === "web.socket.connect")).toBe(true);
    // The posted http.request was dropped; the only http.request samples are the server's own.
    const posted = (await (
      await admin.get("/api/telemetry?view=samples&probe=http.request")
    ).json()) as TelemetryResponse;
    expect(posted.samples?.every((s) => s.durMs !== 1 || s.attrs !== undefined)).toBe(true);

    const bySession = (await (
      await admin.get("/api/telemetry?view=probes&session=s-1")
    ).json()) as TelemetryResponse;
    expect(bySession.probes?.map((p) => p.probe)).toEqual(["web.turn"]);

    expect((await member.get("/api/telemetry")).status).toBe(403);
  });

  it("rejects a body that is not a bounded list", async () => {
    await turn(true);
    expect((await member.post("/api/telemetry/samples", { samples: "web.turn" })).status).toBe(
      400,
    );
    const tooMany = Array.from({ length: BROWSER_BATCH_MAX + 1 }, () => ({ probe: "web.turn" }));
    expect((await member.post("/api/telemetry/samples", { samples: tooMany })).status).toBe(400);
  });
});
