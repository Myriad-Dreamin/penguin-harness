/**
 * The list cache (lib/list-cache.ts): the last known Session rows and organizations, drawn on
 * the first frame and replaced by the server's answer.
 *
 * - Keyed by data root, user and Project: a read for any other is nothing.
 * - Versioned: another version, junk, or one malformed row discards the whole document.
 * - Storage that refuses or is full behaves as no cache — and a failed write leaves no stale one.
 * - Logout clears the user's lists and nobody else's.
 * - Bounded: active rows per (source, Agent), organization Sessions per Project, most recent first.
 * - Safe mode never reads it, and still writes.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OrganizationSummary, SessionInfo } from "@prismshadow/penguin-server/api";
import {
  CACHED_ORG_SESSIONS,
  CACHED_ROWS_PER_LIST,
  LIST_CACHE_VERSION,
  clearListCache,
  readOrganizationCache,
  readSessionCache,
  writeOrganizationCache,
  writeSessionCache,
} from "../src/lib/list-cache";
import { setSafeMode } from "../src/rescue/safe-mode";
import { blockedStorage, memoryStorage, stubLocalStorage } from "./helpers/storage";
import type { MemoryStorage } from "./helpers/storage";

const row = (sessionId: string, over: Partial<SessionInfo> = {}): SessionInfo =>
  ({
    sessionId,
    projectId: "p",
    agentId: "a1",
    workspace: "/w",
    createdAt: "2026-01-01T00:00:00Z",
    lastActiveAt: "2026-01-01T00:00:00Z",
    status: "idle",
    archived: false,
    ...over,
  }) as SessionInfo;
const at = (day: number) => `2026-01-${String(day).padStart(2, "0")}T00:00:00Z`;
const org = (orgId: string, machineId: string | null = null): OrganizationSummary =>
  ({ projectId: "p", orgId, name: orgId, machineId }) as OrganizationSummary;
const ids = (rows: { row: SessionInfo }[] | null) => rows?.map((entry) => entry.row.sessionId);

let storage: MemoryStorage;
beforeEach(() => {
  storage = stubLocalStorage(memoryStorage({ "penguin.installId": "root-a" }));
});
afterEach(() => setSafeMode(false));

describe("keying", () => {
  it("reads back what was written for the same user and Project", () => {
    const older = row("s1", { lastActiveAt: at(1) });
    const newer = row("s2", { lastActiveAt: at(2) });
    writeSessionCache("u", "p", [
      { row: older, source: null },
      { row: newer, source: "M1" },
    ]);
    // Most recently active first, each row with the server it lives on.
    expect(readSessionCache("u", "p")).toEqual([
      { row: newer, source: "M1" },
      { row: older, source: null },
    ]);
  });

  it("another user, another Project, or another data root reads nothing", () => {
    writeSessionCache("u", "p", [{ row: row("s1"), source: null }]);
    writeSessionCache("v", "p", [{ row: row("theirs"), source: null }]);
    expect(ids(readSessionCache("v", "p"))).toEqual(["theirs"]);
    expect(readSessionCache("u", "q")).toBeNull();
    // The same origin now serves another data root: the document is not this one's.
    storage.setItem("penguin.installId", "root-b");
    expect(readSessionCache("u", "p")).toBeNull();
  });

  it("no recorded data root: nothing is written or read", () => {
    storage.removeItem("penguin.installId");
    writeSessionCache("u", "p", [{ row: row("s1"), source: null }]);
    expect([...storage.map.keys()]).toEqual([]);
    expect(readSessionCache("u", "p")).toBeNull();
  });

  it("ids that contain separators do not collide", () => {
    writeSessionCache("a/b", "c", [{ row: row("s1", { projectId: "c" }), source: null }]);
    expect(readSessionCache("a", "b/c")).toBeNull();
    expect(ids(readSessionCache("a/b", "c"))).toEqual(["s1"]);
  });
});

describe("discarding", () => {
  const key = () => [...storage.map.keys()].find((k) => k.startsWith("penguin.listCache."))!;

  it("a document of another version is discarded, not migrated", () => {
    writeSessionCache("u", "p", [{ row: row("s1"), source: null }]);
    const doc = JSON.parse(storage.getItem(key())!) as Record<string, unknown>;
    storage.setItem(key(), JSON.stringify({ ...doc, v: LIST_CACHE_VERSION + 1 }));
    expect(readSessionCache("u", "p")).toBeNull();
    expect(storage.map.has(key() ?? "")).toBe(false);
  });

  it("junk, or one malformed row, discards the whole document", () => {
    writeSessionCache("u", "p", [{ row: row("s1"), source: null }]);
    const k = key();
    storage.setItem(k, "{not json");
    expect(readSessionCache("u", "p")).toBeNull();
    writeSessionCache("u", "p", [{ row: row("s1"), source: null }]);
    const doc = JSON.parse(storage.getItem(k)!) as { rows: unknown[] };
    doc.rows.push({ row: { title: "no id" }, source: null });
    storage.setItem(k, JSON.stringify(doc));
    expect(readSessionCache("u", "p")).toBeNull();
    expect(storage.map.has(k)).toBe(false);
  });

  it("storage that refuses behaves as no cache", () => {
    stubLocalStorage(blockedStorage());
    expect(() => writeSessionCache("u", "p", [{ row: row("s1"), source: null }])).not.toThrow();
    expect(readSessionCache("u", "p")).toBeNull();
    expect(readOrganizationCache("u")).toBeNull();
    expect(() => clearListCache("u")).not.toThrow();
  });

  it("a write the quota refuses removes the document it could not replace", () => {
    writeSessionCache("u", "p", [{ row: row("old"), source: null }]);
    const setItem = storage.setItem;
    storage.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
    writeSessionCache("u", "p", [{ row: row("new"), source: null }]);
    storage.setItem = setItem;
    // Not the stale "old": nothing.
    expect(readSessionCache("u", "p")).toBeNull();
  });
});

describe("logout", () => {
  it("clears the user's lists in every Project, and nobody else's", () => {
    writeSessionCache("u", "p", [{ row: row("s1"), source: null }]);
    writeSessionCache("u", "q", [{ row: row("s2", { projectId: "q" }), source: null }]);
    writeOrganizationCache("u", [org("o1")]);
    writeSessionCache("u2", "p", [{ row: row("other"), source: null }]);
    clearListCache("u");
    expect(readSessionCache("u", "p")).toBeNull();
    expect(readSessionCache("u", "q")).toBeNull();
    expect(readOrganizationCache("u")).toBeNull();
    expect(ids(readSessionCache("u2", "p"))).toEqual(["other"]);
  });
});

describe("bounds", () => {
  it("keeps the most recent active rows per (source, Agent), and drops other categories", () => {
    const many = Array.from({ length: CACHED_ROWS_PER_LIST + 5 }, (_, i) =>
      row(`s${i}`, { lastActiveAt: at((i % 28) + 1), createdAt: at(1) }),
    );
    writeSessionCache("u", "p", [
      ...many.map((r) => ({ row: r, source: null })),
      { row: row("there", { lastActiveAt: at(2) }), source: "M1" },
      { row: row("other-agent", { agentId: "a2" }), source: null },
      { row: row("archived", { archived: true }), source: null },
      { row: row("sub", { source: "subagent" } as Partial<SessionInfo>), source: null },
    ]);
    const cached = readSessionCache("u", "p")!;
    const local = cached.filter((e) => e.source === null && e.row.agentId === "a1");
    expect(local).toHaveLength(CACHED_ROWS_PER_LIST);
    // Most recent first: the oldest are the ones left out.
    expect(local[0]!.row.lastActiveAt >= local.at(-1)!.row.lastActiveAt).toBe(true);
    expect(ids(cached)).toContain("there");
    expect(ids(cached)).toContain("other-agent");
    expect(ids(cached)).not.toContain("archived");
    expect(ids(cached)).not.toContain("sub");
  });

  it("keeps organization Sessions, at most CACHED_ORG_SESSIONS of them", () => {
    const desks = Array.from({ length: CACHED_ORG_SESSIONS + 3 }, (_, i) =>
      row(`desk${i}`, { orgId: "o1", lastActiveAt: at((i % 28) + 1) } as Partial<SessionInfo>),
    );
    writeSessionCache(
      "u",
      "p",
      desks.map((r) => ({ row: r, source: "M1" })),
    );
    const cached = readSessionCache("u", "p")!;
    expect(cached).toHaveLength(CACHED_ORG_SESSIONS);
    expect(cached.every((e) => e.source === "M1")).toBe(true);
  });

  it("removes the per-machine rows earlier releases kept, on the first write", () => {
    storage.setItem("penguin.machineSessions.p:M1", "[]");
    storage.setItem("penguin.machineAgents.p:M1", "[]");
    writeSessionCache("u", "p", [{ row: row("s1"), source: null }]);
    expect(storage.map.has("penguin.machineSessions.p:M1")).toBe(false);
    expect(storage.map.has("penguin.machineAgents.p:M1")).toBe(true);
  });
});

describe("safe mode", () => {
  it("never reads the cache, and still writes the server's answer into it", () => {
    writeSessionCache("u", "p", [{ row: row("old"), source: null }]);
    writeOrganizationCache("u", [org("o1")]);
    setSafeMode(true);
    expect(readSessionCache("u", "p")).toBeNull();
    expect(readOrganizationCache("u")).toBeNull();
    writeSessionCache("u", "p", [{ row: row("new"), source: null }]);
    setSafeMode(false);
    expect(ids(readSessionCache("u", "p"))).toEqual(["new"]);
  });
});

describe("organizations", () => {
  it("reads back the list with each organization's machine", () => {
    writeOrganizationCache("u", [org("o1"), org("o2", "M1")]);
    expect(readOrganizationCache("u")).toEqual([org("o1"), org("o2", "M1")]);
    expect(readOrganizationCache("v")).toBeNull();
  });

  it("a malformed entry discards the list", () => {
    writeOrganizationCache("u", [org("o1")]);
    const k = [...storage.map.keys()].find((x) =>
      x.startsWith("penguin.listCache.organizations."),
    )!;
    const doc = JSON.parse(storage.getItem(k)!) as { organizations: unknown[] };
    doc.organizations.push({ orgId: 3 });
    storage.setItem(k, JSON.stringify(doc));
    expect(readOrganizationCache("u")).toBeNull();
  });
});
