/**
 * The organization list's side of the list cache (lib/list-cache.ts). An organization page
 * cannot fetch anything before it knows which machine the organization runs on
 * (lib/org-machines.ts), and the list that says so spans every Project: drawn from the cache,
 * a page opened by URL knows at once, and the server's list then settles it — including
 * whether the organization is still there at all, which the cache never decides.
 */
import type { OrganizationSummary } from "@prismshadow/penguin-server/api";
import { readOrganizationCache, writeOrganizationCache } from "../../lib/list-cache";
import { rememberOrgMachine } from "../../lib/org-machines";

/**
 * The user's cached organizations, each routed to the machine it was last seen on; empty when
 * there is nothing to draw.
 */
export function drawOrganizations(userId: string): OrganizationSummary[] {
  const cached = readOrganizationCache(userId) ?? [];
  for (const org of cached) rememberOrgMachine(org.projectId, org.orgId, org.machineId ?? null);
  return cached;
}

/** Writes a COMPLETE answer back — every Project listed; a partial one would forget the rest. */
export function writeOrganizations(
  userId: string,
  organizations: readonly OrganizationSummary[],
): void {
  writeOrganizationCache(userId, organizations);
}
