/**
 * The Session list drawn from the list cache (state/sessions.tsx `drawCached`, lib/list-cache.ts).
 *
 * - The cached rows are on screen at once, routed to their machines, with `sourcesPending`
 *   raised: shown, not decided from.
 * - The server's whole answer replaces them (a cached row the answer lacks is gone) and is
 *   written back; an answer still on its way, or a server that cannot answer, decides nothing.
 * - Agents still answering keep their cached rows while the others' answers land.
 * - Organization rows stay unconfirmed until a lookup confirms or drops them.
 * - Safe mode draws nothing.
 *
 * Exercised against the store directly (node, no DOM), with the API module mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionInfo, SessionsResponse } from "@prismshadow/penguin-server/api";
import { ApiError } from "../src/api/client";

const answers = new Map<string, SessionsResponse>();
const gates = new Map<string, Promise<void>>();
const key = (machineId: string | null, agentId: string) => `${machineId ?? ""}|${agentId}`;

vi.mock("../src/api/endpoints", () => ({
  listSessions: async (
    _projectId: string,
    agentId: string,
    _opts: unknown,
    machineId?: string | null,
  ) => {
    await gates.get(key(machineId ?? null, agentId));
    const answer = answers.get(key(machineId ?? null, agentId));
    if (answer === undefined) throw new ApiError(0, "network_error", "no answer");
    return answer;
  },
}));

import { createSessionsStore } from "../src/state/sessions";
import { forgetSessionMachines, machineForSession } from "../src/lib/session-machines";
import { readSessionCache, writeSessionCache } from "../src/lib/list-cache";
import { setSafeMode } from "../src/rescue/safe-mode";
import { memoryStorage, stubLocalStorage } from "./helpers/storage";

const at = (day: number) => `2026-01-${String(day).padStart(2, "0")}T00:00:00Z`;
const row = (sessionId: string, day: number, over: Partial<SessionInfo> = {}): SessionInfo =>
  ({
    sessionId,
    projectId: "p",
    agentId: "a1",
    workspace: "/w",
    createdAt: at(day),
    lastActiveAt: at(day),
    status: "idle",
    hasTrace: false,
    archived: false,
    ...over,
  }) as SessionInfo;
const desk = (sessionId: string, day: number) =>
  row(sessionId, day, { orgId: "o1" } as Partial<SessionInfo>);
const page = (sessions: SessionInfo[]): SessionsResponse =>
  ({
    sessions,
    counts: { active: sessions.length, subagent: 0, schedule: 0, archived: 0 },
  }) as SessionsResponse;

/** Holds `(machineId, agentId)`'s answer back until the returned function is called. */
const holdBack = (machineId: string | null, agentId: string): (() => void) => {
  let open: () => void = () => undefined;
  gates.set(key(machineId, agentId), new Promise<void>((resolve) => (open = resolve)));
  return open;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const ids = (store: ReturnType<typeof createSessionsStore>) =>
  store.getState().sessions.map((s) => s.sessionId);
const cachedIds = () => readSessionCache("u", "p")?.map((e) => e.row.sessionId) ?? null;

/** A store as the Provider leaves it after a context change: the context set, then drawn. */
function boot(agentIds = ["a1"], machineIds: string[] = []) {
  const store = createSessionsStore();
  store.setState({
    projectId: "p",
    cacheUser: "u",
    agentIds,
    machineIds,
    offlineMachineIds: [],
  });
  store.getState().drawCached();
  return store;
}

beforeEach(() => {
  answers.clear();
  gates.clear();
  forgetSessionMachines();
  stubLocalStorage(memoryStorage({ "penguin.installId": "root" }));
});
afterEach(() => setSafeMode(false));

describe("drawing the list from the cache", () => {
  it("shows the cached rows at once, newest first and routed, without deciding from them", () => {
    writeSessionCache("u", "p", [
      { row: row("old", 1), source: null },
      { row: row("there", 3), source: "M1" },
      { row: row("new", 2), source: null },
    ]);
    const store = boot();
    expect(ids(store)).toEqual(["there", "new", "old"]);
    expect(machineForSession("there")).toBe("M1");
    expect(store.getState().loading).toBe(false);
    // Shown, not an answer: "missing", "latest" and "no Sessions" wait for the server.
    expect(store.getState().sourcesPending).toBe(true);
  });

  it("nothing cached leaves the list loading, as before", () => {
    const store = boot();
    expect(ids(store)).toEqual([]);
    expect(store.getState().loading).toBe(true);
    expect(store.getState().sourcesPending).toBe(false);
  });

  it("the server's answer replaces the cached rows wholesale, and is written back", async () => {
    writeSessionCache("u", "p", [
      { row: row("deleted-meanwhile", 3), source: null },
      { row: row("kept", 1), source: null },
    ]);
    answers.set(key(null, "a1"), page([row("created-elsewhere", 4), row("kept", 1)]));
    const release = holdBack(null, "a1");
    const store = boot();
    const done = store.getState().reload();
    await settle();
    // Still on its way: the cached list stands and still decides nothing.
    expect(ids(store)).toEqual(["deleted-meanwhile", "kept"]);
    expect(store.getState().sourcesPending).toBe(true);
    release();
    await done;
    // A cached row the answer lacks is gone: clicking it now takes the ordinary lookup path.
    expect(ids(store)).toEqual(["created-elsewhere", "kept"]);
    expect(store.getState().sourcesPending).toBe(false);
    expect(cachedIds()).toEqual(["created-elsewhere", "kept"]);
  });

  it("an empty answer is 'no Sessions' — only once the server has said it", async () => {
    writeSessionCache("u", "p", [{ row: row("gone", 1), source: null }]);
    answers.set(key(null, "a1"), page([]));
    const store = boot();
    await store.getState().reload();
    expect(ids(store)).toEqual([]);
    expect(store.getState().loading).toBe(false);
    expect(store.getState().sourcesPending).toBe(false);
    expect(cachedIds()).toEqual([]);
  });

  it("a server that cannot answer decides nothing: the cached rows stand, still pending", async () => {
    vi.useFakeTimers();
    try {
      writeSessionCache("u", "p", [{ row: row("cached", 1), source: null }]);
      const store = boot();
      await store.getState().reload();
      expect(ids(store)).toEqual(["cached"]);
      expect(store.getState().sourcesPending).toBe(true);
      expect(cachedIds()).toEqual(["cached"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Agents still answering keep their cached rows while the others' answers land", async () => {
    writeSessionCache("u", "p", [
      { row: row("a1-cached", 2), source: null },
      { row: row("a2-cached", 1, { agentId: "a2" }), source: null },
    ]);
    answers.set(key(null, "a1"), page([row("a1-fresh", 3)]));
    answers.set(key(null, "a2"), page([row("a2-fresh", 4, { agentId: "a2" })]));
    const release = holdBack(null, "a2");
    const store = boot(["a1", "a2"]);
    const done = store.getState().reload();
    await settle();
    // a1 answered and replaced its rows; a2 has not, and keeps the ones it had.
    expect(ids(store)).toEqual(["a1-fresh", "a2-cached"]);
    expect(store.getState().sourcesPending).toBe(true);
    release();
    await done;
    expect(ids(store)).toEqual(["a2-fresh", "a1-fresh"]);
    expect(store.getState().sourcesPending).toBe(false);
  });

  it("a machine still answering stands in with its cached rows, the same path as one offline", async () => {
    writeSessionCache("u", "p", [
      { row: row("here-cached", 1), source: null },
      { row: row("there-cached", 2), source: "M1" },
    ]);
    answers.set(key(null, "a1"), page([row("here", 3)]));
    answers.set(key("M1", "a1"), page([row("there", 4)]));
    const release = holdBack("M1", "a1");
    const store = boot(["a1"], ["M1"]);
    const done = store.getState().reload();
    await settle();
    expect(ids(store)).toEqual(["here", "there-cached"]);
    expect(machineForSession("there-cached")).toBe("M1");
    release();
    await done;
    expect(ids(store)).toEqual(["there", "here"]);
    expect(readSessionCache("u", "p")).toEqual([
      { row: row("there", 4), source: "M1" },
      { row: row("here", 3), source: null },
    ]);
  });

  it("safe mode draws nothing", () => {
    writeSessionCache("u", "p", [{ row: row("cached", 1), source: null }]);
    setSafeMode(true);
    const store = boot();
    expect(ids(store)).toEqual([]);
    expect(store.getState().loading).toBe(true);
  });

  it("no cache user (signed-out shapes, tests): no cache read or written", async () => {
    writeSessionCache("u", "p", [{ row: row("cached", 1), source: null }]);
    answers.set(key(null, "a1"), page([row("fresh", 2)]));
    const store = createSessionsStore();
    store.setState({ projectId: "p", agentIds: ["a1"], machineIds: [], offlineMachineIds: [] });
    store.getState().drawCached();
    expect(ids(store)).toEqual([]);
    await store.getState().reload();
    expect(cachedIds()).toEqual(["cached"]);
  });
});

describe("organization rows from the cache", () => {
  it("are drawn unconfirmed and survive the round, which never lists them", async () => {
    writeSessionCache("u", "p", [
      { row: row("mine", 1), source: null },
      { row: desk("desk", 2), source: "M1" },
    ]);
    answers.set(key(null, "a1"), page([row("mine", 1)]));
    const store = boot();
    expect(ids(store)).toEqual(["mine", "desk"]);
    expect(machineForSession("desk")).toBe("M1");
    expect(store.getState().unconfirmed.has("desk")).toBe(true);
    await store.getState().reload();
    expect(ids(store)).toContain("desk");
    expect(store.getState().unconfirmed.has("desk")).toBe(true);
  });

  it("the lookup's row confirms one; its failure drops it from the list and the cache", async () => {
    writeSessionCache("u", "p", [
      { row: desk("confirmed", 2), source: null },
      { row: desk("gone", 1), source: null },
    ]);
    answers.set(key(null, "a1"), page([]));
    const store = boot();
    await store.getState().reload();
    store.getState().add(desk("confirmed", 3));
    expect(store.getState().unconfirmed.has("confirmed")).toBe(false);
    store.getState().dropUnconfirmed("gone");
    expect(ids(store)).toEqual(["confirmed"]);
    expect(cachedIds()).toEqual(["confirmed"]);
    // A confirmed row is not the cache's to drop.
    store.getState().dropUnconfirmed("confirmed");
    expect(ids(store)).toEqual(["confirmed"]);
  });
});
