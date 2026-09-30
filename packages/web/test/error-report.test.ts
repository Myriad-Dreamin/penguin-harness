/**
 * Browser error reports (src/lib/error-report.ts): only what the server cannot see, only while
 * the browser-side switch is on, deduplicated and capped on this side before the server does
 * the same on its own.
 *
 * The reporter runs on injected time and transport; the API client runs for real against a
 * counted `fetch`, with the socket replaced at the module seam so every call goes over HTTP.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as SocketModule from "../src/api/socket";

vi.mock("../src/api/socket", async (importActual) => {
  const actual = await importActual<typeof SocketModule>();
  return {
    ...actual,
    apiSocket: {
      ready: async () => false,
      identityIs: () => undefined,
      identityChanged: () => undefined,
      call: () => Promise.reject(new Error("the socket is not open")),
    },
  };
});

import type { BrowserErrorReport } from "@prismshadow/penguin-server/api";
import { ApiError, apiFetch } from "../src/api/client";
import {
  BATCH_DELAY_MS,
  DEDUP_WINDOW_MS,
  ErrorReporter,
  PER_MINUTE,
  REPORT_SWITCH_KEY,
  installErrorListeners,
} from "../src/lib/error-report";
import type { ReporterDeps } from "../src/lib/error-report";

function harness(enabled = true) {
  let now = 1_000_000;
  const sent: BrowserErrorReport[][] = [];
  const timers: (() => void)[] = [];
  const deps: ReporterDeps = {
    enabled: () => enabled,
    now: () => now,
    send: async (reports) => void sent.push(reports),
    schedule: (run) => void timers.push(run),
    context: () => ({ projectId: "p1", sessionId: "s1" }),
  };
  return {
    reporter: new ErrorReporter(deps),
    sent,
    advance: (ms: number) => (now += ms),
    fire: () => timers.splice(0).forEach((run) => run()),
  };
}

describe("ErrorReporter", () => {
  it("sends nothing while the browser-side switch is off", () => {
    const h = harness(false);
    expect(h.reporter.report({ kind: "render", code: "render_error", message: "x" })).toBe(false);
    h.fire();
    expect(h.sent).toEqual([]);
  });

  it("batches, attributes and deduplicates within the window", () => {
    const h = harness();
    expect(h.reporter.report({ kind: "network", code: "network_error", message: "GET /a" })).toBe(
      true,
    );
    expect(h.reporter.report({ kind: "network", code: "network_error", message: "GET /a" })).toBe(
      false,
    );
    expect(h.reporter.report({ kind: "network", code: "network_error", message: "GET /b" })).toBe(
      true,
    );
    h.fire();
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toEqual([
      {
        kind: "network",
        code: "network_error",
        message: "GET /a",
        projectId: "p1",
        sessionId: "s1",
      },
      {
        kind: "network",
        code: "network_error",
        message: "GET /b",
        projectId: "p1",
        sessionId: "s1",
      },
    ]);
    h.advance(DEDUP_WINDOW_MS);
    expect(h.reporter.report({ kind: "network", code: "network_error", message: "GET /a" })).toBe(
      true,
    );
  });

  it("caps what one page sends in a minute", () => {
    const h = harness();
    let taken = 0;
    for (let i = 0; i < PER_MINUTE + 5; i += 1) {
      if (h.reporter.report({ kind: "socket", code: "socket_silent", message: `m${i}` }))
        taken += 1;
    }
    expect(taken).toBe(PER_MINUTE);
    h.advance(60_000);
    expect(h.reporter.report({ kind: "socket", code: "socket_silent", message: "later" })).toBe(
      true,
    );
  });
});

describe("page-wide listeners", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    vi.useFakeTimers();
    store = new Map([[REPORT_SWITCH_KEY, "1"]]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal("location", { pathname: "/chat/session-x", protocol: "http:", host: "h" });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** The reports POSTed to the intake, flattened. */
  function reportsSent(fetchMock: ReturnType<typeof vi.fn>): BrowserErrorReport[] {
    return fetchMock.mock.calls
      .filter(([url]) => url === "/api/errors/browser")
      .flatMap(
        ([, init]) =>
          (
            JSON.parse((init as RequestInit).body as string) as {
              reports: BrowserErrorReport[];
            }
          ).reports,
      );
  }

  it("reports an unhandled rejection but never an ApiError", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const target = new EventTarget();
    installErrorListeners(target as unknown as Window);
    const rejection = (reason: unknown) =>
      Object.assign(new Event("unhandledrejection"), { reason });
    target.dispatchEvent(rejection(new ApiError(500, "internal", "Internal server error.")));
    target.dispatchEvent(rejection(new TypeError("cannot read x of undefined")));
    await vi.advanceTimersByTimeAsync(BATCH_DELAY_MS);
    const sent = reportsSent(fetchMock);
    expect(sent.map((r) => r.code)).toEqual(["unhandled_rejection"]);
    expect(sent[0]!.message).toContain("TypeError: cannot read x of undefined");
    expect(sent[0]!.sessionId).toBe("session-x");
  });

  it("reports a request that reached no one (status 0), not one the server answered", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/errors/browser") return new Response(null, { status: 200 });
      if (url.startsWith("/api/down")) throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify({ error: { code: "internal", message: "no" } }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiFetch("/api/down?x=1")).rejects.toMatchObject({ status: 0 });
    await expect(apiFetch("/api/broken")).rejects.toMatchObject({ status: 500 });
    await vi.advanceTimersByTimeAsync(BATCH_DELAY_MS);
    const sent = reportsSent(fetchMock);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: "network", code: "network_error" });
    expect(sent[0]!.message).toBe("GET /api/down: Failed to fetch");
  });

  it("sends nothing with the switch off", async () => {
    store.delete(REPORT_SWITCH_KEY);
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiFetch("/api/down")).rejects.toMatchObject({ status: 0 });
    await vi.advanceTimersByTimeAsync(BATCH_DELAY_MS);
    expect(reportsSent(fetchMock)).toEqual([]);
  });
});
