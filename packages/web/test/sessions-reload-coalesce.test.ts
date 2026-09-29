/**
 * Reloads are merged: one round in flight, at most one queued (state/sessions.tsx `reload`).
 *
 * A round asks every source about every Agent. Each `session_created`, `schedule_fired` or
 * `resync_required` asks for one, and before this every trigger started its own round at once
 * — so while one round waited on a slow machine, a busy Project put a fresh Agents × sources
 * wave on the wire per event, and the waves piled up in the browser (2026-09-29, 53531:
 * net::ERR_INSUFFICIENT_RESOURCES). The store is exercised directly (node, no DOM); the API
 * module is mocked at the seam, and every list call is held until the test releases it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionsResponse } from "@prismshadow/penguin-server/api";

vi.mock("../src/api/endpoints", () => ({ listSessions: vi.fn() }));

import * as api from "../src/api/endpoints";
import { createSessionsStore } from "../src/state/sessions";

const listSessions = vi.mocked(api.listSessions);
const COUNTS = { active: 0, subagent: 0, schedule: 0, benchmark: 0, archived: 0 };
const AGENTS = ["a1", "a2", "a3"];

/** Every list call waits here until released; `rows` is what the next release answers. */
let held: { projectId: string; resolve: (r: SessionsResponse) => void }[] = [];
const release = () => {
  const now = held;
  held = [];
  for (const call of now)
    call.resolve({
      sessions: [
        {
          sessionId: `${call.projectId}-row`,
          agentId: "a1",
          projectId: call.projectId,
          createdAt: "2026-09-29T00:00:00.000Z",
        } as SessionsResponse["sessions"][number],
      ],
      counts: COUNTS,
    });
};
/** Lets the store's promise chains run (the rounds' awaits and the queue's then). */
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  held = [];
  listSessions.mockReset();
  listSessions.mockImplementation(
    (projectId) => new Promise<SessionsResponse>((resolve) => held.push({ projectId, resolve })),
  );
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function store() {
  const s = createSessionsStore();
  s.setState({ projectId: "p", agentIds: AGENTS, machineIds: ["m1"] });
  return s;
}

describe("reloads while a round is in flight", () => {
  it("merge into ONE more round, however many arrive", async () => {
    const s = store();
    const first = s.getState().reload();
    await settle();
    // this server and m1, about each Agent
    expect(listSessions).toHaveBeenCalledTimes(6);
    const burst = Array.from({ length: 5 }, () => s.getState().reload());
    await settle();
    // Nothing more goes out while the first round waits.
    expect(listSessions).toHaveBeenCalledTimes(6);
    release();
    await first;
    await settle();
    // The queued round, once: 6 more calls, not 5 × 6.
    expect(listSessions).toHaveBeenCalledTimes(12);
    release();
    await Promise.all(burst);
    expect(listSessions).toHaveBeenCalledTimes(12);
  });

  it("every caller's promise settles only after a round that started after its call", async () => {
    const s = store();
    void s.getState().reload();
    await settle();
    let done = false;
    const late = s
      .getState()
      .reload()
      .then(() => (done = true));
    release();
    await settle();
    // The first round is over, but the one this caller asked for is still out.
    expect(done).toBe(false);
    release();
    await late;
    expect(done).toBe(true);
  });

  it("a trigger after the queue drained starts a round at once", async () => {
    const s = store();
    const first = s.getState().reload();
    await settle();
    release();
    await first;
    listSessions.mockClear();
    void s.getState().reload();
    await settle();
    expect(listSessions).toHaveBeenCalledTimes(6);
  });
});

describe("a reload for another list", () => {
  it("does not wait for the round in flight, and that round's answers are dropped", async () => {
    const s = store();
    void s.getState().reload();
    await settle();
    const stale = held;
    held = [];
    // A Project switch: the Provider resets the context and reloads.
    s.setState({ projectId: "q", sessions: [] });
    const fresh = s.getState().reload();
    await settle();
    // Started at once, not queued behind the old round.
    expect(held).toHaveLength(6);
    expect(held.every((c) => c.projectId === "q")).toBe(true);
    release();
    await fresh;
    // The old round lands late: its rows are for a list no longer on screen.
    held = stale;
    release();
    await settle();
    expect(s.getState().sessions.map((r) => r.sessionId)).toEqual(["q-row"]);
  });
});
