/**
 * The browser's error intake (POST /api/errors/browser) and the read that serves an Agent its
 * own errors (GET /api/projects/:p/usage/errors with sessionId / requestId), end to end on a
 * test App: JSON only, accepted with telemetry off, attribution only as far as the caller
 * reaches, bounded per request and per user a minute, deduplicated by the recorder with what
 * it dropped answered as `suppressed`; and an error recorded while telemetry is on carries the
 * request id its response was stamped with.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BrowserErrorsResponse,
  ProjectCreateResponse,
  UsageErrorsPage,
} from "../src/api/types.js";
import { BROWSER_ERRORS_MAX_BATCH } from "../src/api/types.js";
import { BROWSER_ERRORS_PER_MINUTE } from "../src/http/routes/browser-errors.js";
import { apiClient, createTestApp, loginAdmin, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

describe("browser error intake", () => {
  let t: TestApp;
  let api: ReturnType<typeof apiClient>;
  let projectId: string;

  beforeEach(async () => {
    t = await createTestApp();
    const u = await provisionUser(t.app, "web_user");
    api = apiClient(t.app, u.cookie);
    const created = (await (
      await api.post("/api/projects", { projectId: "web_user-proj", name: "Web project" })
    ).json()) as ProjectCreateResponse;
    projectId = created.project.projectId;
  });
  afterEach(async () => {
    await t.cleanup();
  });

  const rows = () =>
    t.deps.db
      .prepare("SELECT * FROM error_records WHERE source = 'browser' ORDER BY id")
      .all() as Array<Record<string, unknown>>;

  const report = (reports: unknown[]) => api.post("/api/errors/browser", { reports });

  it("takes JSON only", async () => {
    const res = await t.app.request("/api/errors/browser", {
      method: "POST",
      headers: {
        cookie: (await provisionUser(t.app, "web_user_2")).cookie,
        "content-type": "text/plain",
      },
      body: "boom",
    });
    expect(res.status).toBe(415);
    expect(rows()).toHaveLength(0);
  });

  it("records with telemetry off, keeping only the attribution the caller reaches", async () => {
    const res = await report([
      {
        kind: "render",
        code: "render_error",
        message: "TypeError: x is undefined",
        stack: "TypeError: x is undefined\n    at Row (row.tsx:3:1)",
        projectId,
        sessionId: "session-a",
      },
      {
        kind: "network",
        code: "network_error",
        message: "GET /api/x: Failed to fetch",
        projectId: "someone-elses",
        sessionId: "session-b",
      },
    ]);
    expect(res.status).toBe(200);
    expect((await res.json()) as BrowserErrorsResponse).toEqual({ accepted: 2, dropped: 0 });
    const got = rows();
    expect(got).toHaveLength(2);
    expect(got[0]).toMatchObject({
      project_id: projectId,
      session_id: "session-a",
      kind: "unexpected",
      code: "render_error",
    });
    expect(got[0]!.stack).toContain("at Row (row.tsx:3:1)");
    // A Project the caller cannot enter is not the caller's to write into: the row is unattributed.
    expect(got[1]).toMatchObject({ project_id: null, session_id: null, code: "network_error" });
  });

  it("refuses a malformed report and an oversized batch", async () => {
    expect((await report([{ kind: "render", code: "Not A Code", message: "x" }])).status).toBe(400);
    const many = Array.from({ length: BROWSER_ERRORS_MAX_BATCH + 1 }, (_, i) => ({
      kind: "socket",
      code: "socket_silent",
      message: `m${i}`,
    }));
    expect((await report(many)).status).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it("caps one user's reports a minute and says how many it dropped", async () => {
    let accepted = 0;
    let dropped = 0;
    for (let batch = 0; batch < 4; batch++) {
      const res = await report(
        Array.from({ length: BROWSER_ERRORS_MAX_BATCH }, (_, i) => ({
          kind: "socket",
          code: `socket_c${batch}_${i}`,
          message: "x",
        })),
      );
      const body = (await res.json()) as BrowserErrorsResponse;
      accepted += body.accepted;
      dropped += body.dropped;
    }
    expect(accepted).toBe(BROWSER_ERRORS_PER_MINUTE);
    expect(dropped).toBe(4 * BROWSER_ERRORS_MAX_BATCH - BROWSER_ERRORS_PER_MINUTE);
    expect(rows()).toHaveLength(BROWSER_ERRORS_PER_MINUTE);
  });

  it("a Session's read: its rows, and the repeats the dedup dropped", async () => {
    const one = { kind: "socket", code: "socket_call_no_answer", message: "GET /x", projectId };
    await report([
      { ...one, sessionId: "session-a" },
      { ...one, sessionId: "session-a" },
      { ...one, sessionId: "session-a" },
      { ...one, sessionId: "session-b" },
    ]);
    expect(rows()).toHaveLength(2);
    const page = (await (
      await api.get(`/api/projects/${projectId}/usage/errors?sessionId=session-a`)
    ).json()) as UsageErrorsPage;
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ sessionId: "session-a", code: "socket_call_no_answer" });
    expect(page.suppressed).toEqual([
      { source: "browser", code: "socket_call_no_answer", sessionId: "session-a", count: 2 },
    ]);
  });
});

describe("request key", () => {
  let t: TestApp;
  let admin: ReturnType<typeof apiClient>;

  beforeEach(async () => {
    t = await createTestApp();
    admin = apiClient(t.app, (await loginAdmin(t.app)).cookie);
  });
  afterEach(async () => {
    await t.cleanup();
    vi.restoreAllMocks();
  });

  it("an error recorded while telemetry is on carries its request's id; with it off, none", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    t.deps.usageService.query = () => {
      throw new Error("query blew up");
    };
    expect((await admin.put("/api/admin/settings", { telemetry: true })).status).toBe(200);
    const failed = await admin.get("/api/projects/default_project/usage?groupBy=date");
    expect(failed.status).toBe(500);
    const request = failed.headers.get("x-penguin-request-id");
    expect(request).toMatch(/^[0-9a-f-]{36}$/);

    const page = (await (
      await admin.get(`/api/projects/default_project/usage/errors?requestId=${request}`)
    ).json()) as UsageErrorsPage;
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ code: "internal", requestId: request });
    expect(page.items[0]!.stack).toContain("query blew up");

    expect((await admin.put("/api/admin/settings", { telemetry: false })).status).toBe(200);
    // Past the dedup window so the second 500 is persisted, not counted.
    const later = new Date(Date.now() + 5_000);
    vi.useFakeTimers({ now: later, toFake: ["Date"] });
    try {
      expect((await admin.get("/api/projects/default_project/usage?groupBy=date")).status).toBe(
        500,
      );
    } finally {
      vi.useRealTimers();
    }
    const all = t.deps.db
      .prepare("SELECT request_id FROM error_records WHERE code = 'internal' ORDER BY id")
      .all() as { request_id: string | null }[];
    expect(all.map((r) => r.request_id)).toEqual([request, null]);
  });
});
