/**
 * Reads shared while in flight (api/client.ts `sharedRead`): the prefs and a Project's models
 * are each read by several surfaces as the page mounts, and each used to send its own copy —
 * five or six `GET /api/me/prefs` and two `GET …/models` per load.
 *
 * What is pinned: callers asking while a read is out share it, each with its own copy of the
 * answer; nothing is kept once it settles; and a read sent before a write is never handed to a
 * caller who asked after that write. The client runs against a counted `fetch` with no
 * WebSocket, so every call is an HTTP request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let fetched: string[] = [];
/** Opens the gate every held GET waits behind. */
let release: () => void = () => undefined;
let gate: Promise<void> = Promise.resolve();

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.resetModules();
  fetched = [];
  gate = new Promise<void>((resolve) => (release = resolve));
  vi.stubGlobal("WebSocket", undefined);
  vi.stubGlobal("location", { protocol: "http:", host: "test" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      const method = init?.method ?? "GET";
      fetched.push(`${method} ${url}`);
      if (method === "GET") await gate;
      return json(
        url.endsWith("/models") ? { models: [], url } : { prefs: { seen: fetched.length } },
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const load = () => import("../src/api/endpoints");
const count = (line: string) => fetched.filter((f) => f === line).length;

describe("a shared read", () => {
  it("is one request for every caller asking while it is out, each with its own copy", async () => {
    const api = await load();
    const asks = [api.getPrefs(), api.getPrefs(), api.getPrefs()];
    release();
    const [a, b, c] = (await Promise.all(asks)) as [
      Awaited<(typeof asks)[0]>,
      Awaited<(typeof asks)[0]>,
      Awaited<(typeof asks)[0]>,
    ];
    expect(count("GET /api/me/prefs")).toBe(1);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    (a.prefs as Record<string, unknown>).seen = "edited";
    expect(b.prefs.seen).not.toBe("edited");
  });

  it("keeps nothing once it settles: the next caller asks the server again", async () => {
    const api = await load();
    release();
    await api.getPrefs();
    await api.getPrefs();
    expect(count("GET /api/me/prefs")).toBe(2);
  });

  it("is never handed to a caller who asked after a write", async () => {
    const api = await load();
    const before = api.getPrefs();
    await api.putPrefs({ credentialGuideSeen: true });
    const after = api.getPrefs();
    release();
    await Promise.all([before, after]);
    expect(fetched).toEqual(["GET /api/me/prefs", "PUT /api/me/prefs", "GET /api/me/prefs"]);
  });

  it("is per Project and per machine for the models", async () => {
    const api = await load();
    const asks = [
      api.getModels("p"),
      api.getModels("p"),
      api.getModels("q"),
      api.getModels("p", "M1"),
    ];
    release();
    await Promise.all(asks);
    expect(count("GET /api/projects/p/models")).toBe(1);
    expect(count("GET /api/projects/q/models")).toBe(1);
    expect(count("GET /server/M1/api/projects/p/models")).toBe(1);
  });
});
