/**
 * The Session list's side of the list cache (lib/list-cache.ts): what a drawn list looks like,
 * and what of the list on screen is written back. Kept out of state/sessions.tsx, whose store
 * decides WHEN — a context change draws, a whole answer writes.
 */
import type { SessionInfo } from "@prismshadow/penguin-server/api";
import { readSessionCache, writeSessionCache } from "../lib/list-cache";
import { isOrgSession } from "../lib/session-grouping";
import { mostRecentFirst } from "../lib/session-merge";
import { machineForSession, rememberSessionMachine } from "../lib/session-machines";

/** A list drawn from the cache: the list's own rows, then the organization rows held for a page. */
export interface DrawnList {
  sessions: SessionInfo[];
  /** The organization rows among them — no list round returns these, so a lookup confirms each. */
  org: string[];
  /** Whether any of the list's OWN rows were drawn: only those make "rows to show". */
  hasOwnRows: boolean;
}

/**
 * The Project's cached list, or null when there is none to draw. Each machine row is routed to
 * the machine it was last seen on, as a machine out of reach routes its cached rows, so opening
 * one addresses the machine that has it.
 */
export function drawSessionList(cacheUser: string, projectId: string): DrawnList | null {
  const cached = readSessionCache(cacheUser, projectId);
  if (cached === null || cached.length === 0) return null;
  for (const { row, source } of cached) {
    if (source !== null) rememberSessionMachine(row.sessionId, source);
  }
  const rows = cached.map((entry) => entry.row);
  // Ordered as a round orders its answer, so the usual difference the answer brings is
  // confined to the top few rows.
  const own = rows.filter((s) => !isOrgSession(s)).sort(mostRecentFirst);
  const org = rows.filter(isOrgSession);
  return {
    sessions: [...own, ...org],
    org: org.map((s) => s.sessionId),
    hasOwnRows: own.length > 0,
  };
}

/** Writes `sessions` back as the Project's cached list, each row with the server it lives on. */
export function writeSessionList(
  cacheUser: string,
  projectId: string,
  sessions: readonly SessionInfo[],
): void {
  writeSessionCache(
    cacheUser,
    projectId,
    sessions
      .filter((s) => s.projectId === projectId)
      .map((row) => ({ row, source: machineForSession(row.sessionId) })),
  );
}
