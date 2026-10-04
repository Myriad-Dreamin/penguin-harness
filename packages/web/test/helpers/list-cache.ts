/**
 * One machine's slice of the Session list cache (lib/list-cache.ts), for the store suites: they
 * seed what a machine was last seen holding and read back what a round left there. The stores
 * under test run with `cacheUser: "u"`, and the suite records {@link TEST_INSTALL_ID} as the data
 * root before each test.
 */
import type { SessionInfo } from "@prismshadow/penguin-server/api";
import { readSessionCache, writeSessionCache } from "../../src/lib/list-cache";

export const TEST_INSTALL_ID = "test-root";
export const TEST_CACHE_USER = "u";

/** Replaces `machineId`'s cached rows in `projectId`'s list, leaving every other source's. */
export function rememberMachineSessions(
  projectId: string,
  machineId: string,
  rows: readonly SessionInfo[],
): void {
  const kept = (readSessionCache(TEST_CACHE_USER, projectId) ?? []).filter(
    (entry) => entry.source !== machineId,
  );
  writeSessionCache(TEST_CACHE_USER, projectId, [
    ...kept,
    ...rows.map((row) => ({ row, source: machineId })),
  ]);
}

/** `machineId`'s cached rows in `projectId`'s list, most recently active first. */
export function cachedMachineSessions(projectId: string, machineId: string): SessionInfo[] {
  return (readSessionCache(TEST_CACHE_USER, projectId) ?? [])
    .filter((entry) => entry.source === machineId)
    .map((entry) => entry.row);
}
