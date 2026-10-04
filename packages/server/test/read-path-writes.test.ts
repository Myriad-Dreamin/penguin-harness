/**
 * Read paths that project state into SQLite write only what changed. The organization
 * handlers re-project the desk and ticket ledgers into `org_sessions` / `org_ticket_sessions`
 * on every read, and a forced trace-index pass re-upserts every shard it lists; each used to
 * write every row back unchanged. What is pinned: an unchanged projection writes nothing, a
 * changed row is still written, and the table ends exactly as the full rewrite left it.
 */
import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wire } from "@prismshadow/penguin-core/kernel";
import { userText } from "@prismshadow/penguin-core";
import { openDatabase } from "../src/db/database.js";
import { OrgCacheRepo } from "../src/db/repos/organizations.js";
import { TraceIndexRepo } from "../src/db/repos/trace-index.js";
import { TraceIndexService } from "../src/services/trace-index.js";
import { SessionSources } from "../src/runtime/session-sources.js";
import { makeTempRoot, writeTraceFile } from "./helpers.js";

let db: ReturnType<typeof openDatabase>;
beforeEach(() => {
  db = openDatabase(":memory:");
});
afterEach(() => db.close());

const changes = (): number => (db.prepare("SELECT total_changes() AS n").get() as { n: number }).n;

describe("the desk and ticket projections", () => {
  it("write nothing when the ledger says what the table already holds", () => {
    const cache = wire(OrgCacheRepo, { db });
    const desks = [
      { sessionId: "s1", agentId: "ceo", current: true },
      { sessionId: "s0", agentId: "ceo", current: false },
    ];
    cache.syncDeskSessions("p", "acme", desks);
    cache.syncTicketSessions("p", "acme", [{ ticketId: "t1", sessionId: "s2", agentId: "dev" }]);
    const before = changes();
    cache.syncDeskSessions("p", "acme", desks);
    cache.syncTicketSessions("p", "acme", [{ ticketId: "t1", sessionId: "s2", agentId: "dev" }]);
    expect(changes()).toBe(before);
  });

  it("still writes what changed, and removes what left the ledger", () => {
    const cache = wire(OrgCacheRepo, { db });
    cache.syncDeskSessions("p", "acme", [
      { sessionId: "s1", agentId: "ceo", current: true },
      { sessionId: "s0", agentId: "ceo", current: false },
    ]);
    cache.syncDeskSessions("p", "acme", [
      { sessionId: "s2", agentId: "ceo", current: true },
      { sessionId: "s1", agentId: "ceo", current: false },
    ]);
    expect(cache.deskSessions("p", "acme").map((r) => [r.sessionId, r.current])).toEqual([
      ["s2", true],
      ["s1", false],
    ]);
  });

  it("ends as the full rewrite did when the ledger names a session twice", () => {
    // Last row wins, as it did when every row was upserted in order.
    const cache = wire(OrgCacheRepo, { db });
    cache.syncDeskSessions("p", "acme", [{ sessionId: "s1", agentId: "ceo", current: false }]);
    cache.syncDeskSessions("p", "acme", [
      { sessionId: "s1", agentId: "ceo", current: true },
      { sessionId: "s1", agentId: "ceo", current: false },
    ]);
    expect(cache.deskSessions("p", "acme").map((r) => r.current)).toEqual([false]);
  });
});

describe("a forced trace-index pass", () => {
  it("does not upsert a shard already indexed at its size", async () => {
    const root = await makeTempRoot();
    const repo = wire(TraceIndexRepo, { db });
    const index = wire(TraceIndexService, {
      paths: { root },
      repo,
      sources: new SessionSources(),
    });
    const file = await writeTraceFile(
      root,
      "p",
      "a",
      "2026-07-05",
      "session-2026-07-05-10-00-00-aabb0001",
      0,
      [userText("hello")],
    );
    await index.reconcileAgent("p", "a", { force: true });
    const upsert = vi.spyOn(repo, "upsertFile");
    await index.reconcileAgent("p", "a", { force: true });
    expect(upsert).not.toHaveBeenCalled();

    // A shard that grew is upserted again (its cached page stats are voided).
    await fs.appendFile(file, `${JSON.stringify(userText("more"))}\n`);
    await index.reconcileAgent("p", "a", { force: true });
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
