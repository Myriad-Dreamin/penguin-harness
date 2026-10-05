/**
 * The session dialog's kept terminals and what the roadmap page learns ahead of a click
 * (features/company/claude-session-{resident,prefetch}.ts, chat/surface-warm.ts): as many
 * terminals stay as the queue has slots, 4 until a run list says, the least recently shown
 * leaving first; a session whose run ended leaves at once; a target reopens on its kept Session;
 * the page's lookup only reads — never the open link, which would queue a resume — and the
 * terminal's lookup is taken once, while fresh.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionInfo } from "@prismshadow/penguin-server/api";
import { json, stubFetch } from "./helpers/fetch";

vi.mock("../src/features/chat/session-surface-view", () => ({
  SessionSurfaceView: () => null,
}));

const resident = await import("../src/features/company/claude-session-resident");
const { prefetchClaudeSession } = await import("../src/features/company/claude-session-prefetch");
const warm = await import("../src/features/chat/surface-warm");

const session = (sessionId: string) =>
  ({ sessionId, surface: "claude-code" }) as unknown as SessionInfo;
const ref = (runId: number, orgId = "acme") => ({ projectId: "p", orgId, runId, machine: null });

afterEach(() => {
  for (const id of resident.residentSessionIds()) resident.dropResident(id);
  resident.setResidentCapacity(resident.DEFAULT_RESIDENTS);
  vi.useRealTimers();
});

describe("kept terminals", () => {
  it("keeps four until the queue's capacity is known, the least recently shown leaving first", () => {
    for (let i = 1; i <= 5; i++) resident.retainResident(session(`s${i}`), ref(i), `k${i}`);
    expect(resident.residentSessionIds()).toEqual(["s5", "s4", "s3", "s2"]);
    // Showing one again makes it the most recent.
    resident.retainResident(session("s2"), ref(2), "k2");
    expect(resident.residentSessionIds()).toEqual(["s2", "s5", "s4", "s3"]);
    resident.setResidentCapacity(2);
    expect(resident.residentSessionIds()).toEqual(["s2", "s5"]);
    resident.setResidentCapacity(6);
    resident.retainResident(session("s7"), ref(7), "k7");
    expect(resident.residentSessionIds()).toEqual(["s7", "s2", "s5"]);
  });

  it("reopens a target on its kept Session, and forgets it once the run ended", () => {
    resident.retainResident(session("s1"), ref(1), "link:/a");
    resident.retainResident(session("s2"), ref(2, "other"), "run:x");
    expect(resident.knownSession("link:/a")?.session.sessionId).toBe("s1");
    resident.dropEndedResidents("p", "acme", [9]);
    expect(resident.knownSession("link:/a")).toBeNull();
    // Another organization's terminal is not judged by this organization's list.
    expect(resident.residentSessionIds()).toEqual(["s2"]);
    resident.dropResident("s2");
    expect(resident.residentSessionIds()).toEqual([]);
  });

  it("moves a target to the Session it leads to now", () => {
    resident.retainResident(session("s1"), ref(1), "link:/a");
    resident.retainResident(session("s2"), ref(2), "link:/a");
    expect(resident.knownSession("link:/a")?.session.sessionId).toBe("s2");
  });

  it("trusts a Session learned ahead for a while only", () => {
    vi.useFakeTimers();
    resident.warmTarget("link:/b", session("s3"), ref(3));
    expect(resident.knownSession("link:/b")?.run.runId).toBe(3);
    vi.advanceTimersByTime(resident.WARM_TARGET_MS + 1);
    expect(resident.knownSession("link:/b")).toBeNull();
  });
});

describe("the terminal's lookup started ahead", () => {
  it("is taken once, and not when stale", async () => {
    stubFetch((r) =>
      r.path === "/api/sessions/s1/surface"
        ? json({ opened: true, view: { terminalId: "t1" } })
        : r.path === "/api/terminals/t1"
          ? json({ id: "t1", cols: 80, rows: 24 })
          : json({ error: { code: "not_found", message: "no" } }, 404),
    );
    warm.warmSurface("s1");
    const taken = warm.takeWarmSurface("s1");
    expect(await taken).toMatchObject({ id: "t1" });
    expect(warm.takeWarmSurface("s1")).toBeNull();
    vi.useFakeTimers();
    warm.warmSurface("s1");
    vi.advanceTimersByTime(warm.WARM_MS + 1);
    expect(warm.takeWarmSurface("s1")).toBeNull();
  });
});

describe("looking ahead from the roadmap page", () => {
  const HREF = "/api/claude-code/open?org=acme&project=p&roadmap=3";
  const runs = (status: "running" | "queued") => ({
    runs: [
      {
        id: 8,
        status,
        agentId: "dev",
        by: "user:a",
        prompt: "",
        claudeSessionId: "cs-3",
        ...(status === "running" ? { sessionId: "s8" } : {}),
      },
    ],
    capacity: 3,
    idleMinutes: 30,
    running: 1,
    queued: 0,
  });

  it("learns the running Session and the queue's capacity, reading only", async () => {
    const fake = stubFetch((r) => {
      if (r.path.endsWith("/claude-code/runs")) return json(runs("running"));
      if (r.path === "/api/sessions/s8") return json({ session: session("s8") });
      return json({ error: { code: "not_found", message: "no" } }, 404);
    });
    await prefetchClaudeSession("p", "acme", "cs-3", HREF);
    expect(resident.knownSession(`link:${HREF}`)).toMatchObject({
      session: { sessionId: "s8" },
      run: { runId: 8 },
    });
    for (let i = 1; i <= 4; i++) resident.retainResident(session(`x${i}`), ref(i), `k${i}`);
    expect(resident.residentSessionIds()).toHaveLength(3);
    expect(fake.requests.every((r) => r.method === "GET")).toBe(true);
    // Only the queued and running runs: the ended ones are most of the list's bytes.
    const listed = fake.requests.find((r) => r.path.endsWith("/claude-code/runs"));
    expect(listed?.query.get("active")).toBe("1");
    expect(fake.requests.some((r) => r.path.includes("/claude-code/open"))).toBe(false);
    // A second look asks nothing: within the interval, and while the Session is known.
    const before = fake.requests.length;
    await prefetchClaudeSession("p", "acme", "cs-3", HREF);
    expect(fake.requests.length).toBe(before);
  });

  it("learns nothing while the session is not running", async () => {
    stubFetch((r) =>
      r.path.endsWith("/claude-code/runs")
        ? json(runs("queued"))
        : json({ error: { code: "not_found", message: "no" } }, 404),
    );
    const other = "/api/claude-code/open?org=acme&project=p&roadmap=4";
    await prefetchClaudeSession("p", "acme", "cs-3", other);
    expect(resident.knownSession(`link:${other}`)).toBeNull();
  });
});
