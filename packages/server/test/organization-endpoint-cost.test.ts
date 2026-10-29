/**
 * The reuse layers the organization read endpoints put around their expensive work, at their
 * edges. A period spend is aggregated once per organization and period, and aggregated again
 * once three seconds have gone by. A call that passes an empty ticket set — the organization's
 * creation run and the gateway's budget check — aggregates every time: an answer built without
 * tickets must neither take nor leave the cached one, because the two differ as soon as a
 * ticket has a session of its own. And the desk and ticket session caches are written as one
 * unit of work, so a failure part-way leaves no row behind; inside a caller's transaction the
 * segment nests, an inner rollback undoes only the segment and the caller still decides.
 */
import { wire } from "@prismshadow/penguin-core/kernel";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../src/db/database.js";
import { OrgCacheRepo } from "../src/db/repos/organizations.js";
import type { OrgDeps } from "../src/runtime/organization/deps.js";
import type { OrganizationService } from "../src/runtime/organization/service.js";
import { makeOrgHarness } from "./org-harness.js";

const P = "p1";
const ORG = "acme";
const CEO = "acme_ceo";
const HR = "acme_hr";
const T0 = Date.parse("2026-09-01T01:00:00Z");
const SECOND = 1_000;

/**
 * Counts the period aggregations the service asks for, and the sessions each one covered:
 * the fare is one `costBySession` pass, so the count is what "aggregated once" means.
 */
function countAggregations(service: OrganizationService): {
  calls: number;
  covered: string[][];
  reset: () => void;
} {
  const counter = {
    calls: 0,
    covered: [] as string[][],
    reset: (): void => {
      counter.calls = 0;
      counter.covered.length = 0;
    },
  };
  const deps = (service as unknown as { deps: OrgDeps }).deps;
  const usage = deps.usage;
  const real = usage.costBySession.bind(usage);
  usage.costBySession = async (projectId, sessionIds, fromTs, toTs) => {
    counter.calls++;
    counter.covered.push([...sessionIds]);
    return real(projectId, sessionIds, fromTs, toTs);
  };
  return counter;
}

function freshCache(): { db: ReturnType<typeof openDatabase>; cache: OrgCacheRepo } {
  const db = openDatabase(":memory:");
  return { db, cache: wire(OrgCacheRepo, { db }) };
}

/** Rows the caller wrote before handing over to the sync, counted to see what survived. */
function markerCount(db: ReturnType<typeof openDatabase>): number {
  const row = db.prepare("SELECT count(*) AS n FROM marker").get() as { n: number | bigint };
  return Number(row.n);
}

const deskRows = [
  { sessionId: "session-current", agentId: CEO, current: true },
  { sessionId: "session-previous", agentId: CEO, current: false },
];

/**
 * A harness with one organization already created and its CEO's desk session in hand. The
 * clock is moved past the window of the spend the creation's own detail read cached, so every
 * test below starts from a cold key rather than from the creation's zero.
 */
async function openedOrg(): Promise<{
  h: Awaited<ReturnType<typeof makeOrgHarness>>;
  desk: { sessionId: string };
}> {
  const h = await makeOrgHarness({ nowMs: T0 });
  await h.service.create(P, { orgId: ORG, name: ORG, mission: "Ship it" }, "alice");
  const desk = h.cache.deskSessions(P, ORG).find((r) => r.current);
  if (desk === undefined) throw new Error("the CEO's desk should be in the session cache");
  h.clock.nowMs = T0 + 4 * SECOND;
  return { h, desk };
}

describe("period spend cache", () => {
  it("aggregates once for the same organization and period inside three seconds, and again after them", async () => {
    const { h, desk } = await openedOrg();
    const count = countAggregations(h.service);
    count.reset();

    h.costs.set(desk.sessionId, 5);
    const first = await h.service.finance(P, ORG);
    expect(first.total).toBe(5);
    expect(count.calls).toBe(1);

    // Inside the window the answer of a moment ago stands, however the usage moved meanwhile.
    h.costs.set(desk.sessionId, 9);
    h.clock.nowMs += SECOND;
    const second = await h.service.finance(P, ORG);
    expect(second.total).toBe(5);
    expect(count.calls).toBe(1);

    h.clock.nowMs += 3 * SECOND;
    const third = await h.service.finance(P, ORG);
    expect(third.total).toBe(9);
    expect(count.calls).toBe(2);
  });

  it("keys the cache by period, so another period is aggregated on its own", async () => {
    const { h, desk } = await openedOrg();
    const count = countAggregations(h.service);
    count.reset();

    h.costs.set(desk.sessionId, 5);
    expect((await h.service.finance(P, ORG)).total).toBe(5);
    expect(count.calls).toBe(1);

    h.costs.set(desk.sessionId, 7);
    const august = await h.service.finance(P, ORG, "2026-08");
    expect(august.period).toBe("2026-08");
    expect(august.total).toBe(7); // computed for its own key, not taken from September
    expect(count.calls).toBe(2);

    // Neither key disturbs the other, and a repeat of either is a hit.
    expect((await h.service.finance(P, ORG)).total).toBe(5);
    expect((await h.service.finance(P, ORG, "2026-08")).total).toBe(7);
    expect(count.calls).toBe(2);
  });

  it("aggregates on every call that passes an empty ticket set, and neither reads nor writes the cache", async () => {
    const { h } = await openedOrg();
    const count = countAggregations(h.service);
    await h.service.hire(P, ORG, { newAgent: { agentId: HR }, title: "HR", reportsTo: CEO });
    // A session that belongs to a ticket and to nobody's desk: a reader holding the tickets
    // counts it, a reader holding none cannot see it.
    h.sessions.insert({
      sessionId: "session-ticket-1",
      projectId: P,
      agentId: HR,
      provider: "custom",
      modelId: "m-bench",
      workspace: h.root,
      approvalMode: "allow-all",
      title: null,
      client: "org",
      lastActiveAt: new Date(T0).toISOString(),
      createdAt: new Date(T0).toISOString(),
    });
    const ticket = await h.service.createTicket(P, ORG, { title: "Ship it" }, { userId: "alice" });
    await h.service.attachTicket(P, ORG, ticket.ticketId, "session-ticket-1", {
      userId: "alice",
    });
    h.costs.set("session-ticket-1", 4);
    // Hiring and attaching each answer a read of their own, which cached the spend of that
    // moment; move past their window so this test starts from a cold key.
    h.clock.nowMs += 4 * SECOND;
    count.reset();

    expect((await h.service.finance(P, ORG)).total).toBe(4);
    expect(count.calls).toBe(1);
    expect(count.covered[0]).toContain("session-ticket-1");

    // The gateway's budget check reads the spend with an empty ticket set. It aggregates
    // rather than taking the answer cached a moment ago, which included the ticket's session.
    await h.service.gatewayDeliverToDesk(P, ORG, HR, "a line of work");
    expect(count.calls).toBe(2);
    expect(count.covered[1]).not.toContain("session-ticket-1");

    // And it left nothing behind: the next read is still the cached, ticket-aware answer.
    expect((await h.service.finance(P, ORG)).total).toBe(4);
    expect(count.calls).toBe(2);
  });
});

describe("session cache sync", () => {
  it("writes the whole desk segment as one unit of work: a failure part-way leaves no row behind", () => {
    const { db, cache } = freshCache();
    db.exec(
      "CREATE TRIGGER reject_bad BEFORE INSERT ON org_sessions WHEN NEW.session_id = 'bad' " +
        "BEGIN SELECT RAISE(ABORT, 'no room for this row'); END",
    );
    expect(() =>
      cache.syncDeskSessions(P, ORG, [
        { sessionId: "session-one", agentId: CEO, current: true },
        { sessionId: "bad", agentId: CEO, current: false },
        { sessionId: "session-two", agentId: CEO, current: false },
      ]),
    ).toThrow(/no room for this row/);
    // The row written before the failing one is gone too: the segment is one unit, not one
    // transaction per row.
    expect(cache.deskSessions(P, ORG)).toEqual([]);
  });

  it("commits by itself when no caller holds a transaction open", () => {
    const { db, cache } = freshCache();
    cache.syncDeskSessions(P, ORG, deskRows);
    expect(cache.deskSessions(P, ORG)).toHaveLength(2);
    // A transaction left open would make this BEGIN throw, and the rows survive a rollback
    // only because the sync committed them on its own.
    db.exec("BEGIN");
    db.exec("ROLLBACK");
    expect(cache.deskSessions(P, ORG)).toHaveLength(2);
  });

  it("nests in a caller's transaction: its rollback takes the segment, its commit keeps it", () => {
    const { db, cache } = freshCache();
    db.exec("CREATE TABLE marker (v TEXT)");
    db.exec("BEGIN");
    db.exec("INSERT INTO marker (v) VALUES ('outer')");
    cache.syncDeskSessions(P, ORG, deskRows);
    expect(cache.deskSessions(P, ORG)).toHaveLength(2);
    db.exec("ROLLBACK");
    expect(cache.deskSessions(P, ORG)).toEqual([]);
    expect(markerCount(db)).toBe(0);

    db.exec("BEGIN");
    db.exec("INSERT INTO marker (v) VALUES ('kept')");
    cache.syncDeskSessions(P, ORG, deskRows);
    db.exec("COMMIT");
    expect(cache.deskSessions(P, ORG)).toHaveLength(2);
    expect(markerCount(db)).toBe(1);
  });

  it("rolls back only the segment when a row fails inside the caller's transaction", () => {
    const { db, cache } = freshCache();
    db.exec("CREATE TABLE marker (v TEXT)");
    db.exec(
      "CREATE TRIGGER reject_bad BEFORE INSERT ON org_sessions WHEN NEW.session_id = 'bad' " +
        "BEGIN SELECT RAISE(ABORT, 'no room for this row'); END",
    );
    db.exec("BEGIN");
    db.exec("INSERT INTO marker (v) VALUES ('outer')");
    expect(() =>
      cache.syncDeskSessions(P, ORG, [
        { sessionId: "session-one", agentId: CEO, current: true },
        { sessionId: "bad", agentId: CEO, current: false },
      ]),
    ).toThrow(/no room for this row/);
    // The segment is gone; the caller's own write is not, and its transaction is still open
    // (a COMMIT with no transaction would throw here).
    expect(cache.deskSessions(P, ORG)).toEqual([]);
    expect(markerCount(db)).toBe(1);
    db.exec("COMMIT");
    expect(markerCount(db)).toBe(1);
  });

  it("gives the ticket session cache the same one-unit, nestable shape", () => {
    const { db, cache } = freshCache();
    db.exec("CREATE TABLE marker (v TEXT)");
    db.exec(
      "CREATE TRIGGER reject_ticket BEFORE INSERT ON org_ticket_sessions " +
        "WHEN NEW.ticket_id = 'bad' BEGIN SELECT RAISE(ABORT, 'no room for this row'); END",
    );
    expect(() =>
      cache.syncTicketSessions(P, ORG, [
        { ticketId: "t-one", sessionId: "s-one", agentId: CEO },
        { ticketId: "bad", sessionId: "s-two", agentId: CEO },
      ]),
    ).toThrow(/no room for this row/);
    expect(cache.ticketSessions(P, ORG)).toEqual([]);

    db.exec("BEGIN");
    db.exec("INSERT INTO marker (v) VALUES ('outer')");
    cache.syncTicketSessions(P, ORG, [{ ticketId: "t-one", sessionId: "s-one", agentId: CEO }]);
    expect(cache.ticketSessions(P, ORG)).toHaveLength(1);
    db.exec("ROLLBACK");
    expect(cache.ticketSessions(P, ORG)).toEqual([]);
    expect(markerCount(db)).toBe(0);
  });
});
