/**
 * Learning, before the click, where a roadmap's Open session leads. Only reads: the link itself
 * is never asked ahead, since asking it queues a resume when the session is not running. The
 * run list says whether a run holds the roadmap's Claude Code session; when one is running, its
 * Session is read and the terminal's lookup started (chat/surface-warm.ts), and the dialog opens
 * on that Session at once (claude-session-resident.tsx `warmTarget`). A session that is not
 * running leaves nothing behind: the click then follows the link as before.
 *
 * The roadmap page asks when its button appears and again when the pointer comes to it, at
 * most every {@link PREFETCH_EVERY_MS} — by then a lookup from the page's arrival is stale.
 */
import * as api from "../../api/endpoints";
import { listOrgClaudeRuns } from "../../api/claude-code";
import { machineForOrg } from "../../lib/org-machines";
import { rememberLinkedMachine } from "../../lib/session-machines";
import { warmSurface } from "../chat/surface-warm";
import { openTargetKey } from "./claude-session-open";
import { knownSession, setResidentCapacity, warmTarget } from "./claude-session-resident";

/** The least time between two lookups for one link. */
export const PREFETCH_EVERY_MS = 10_000;

const last = new Map<string, number>();

/** Learns where the open link `href` (an app-relative path) leads, when its run is running. */
export async function prefetchClaudeSession(
  projectId: string,
  orgId: string,
  claudeSessionId: string,
  href: string,
): Promise<void> {
  const now = Date.now();
  if (now - (last.get(href) ?? -Infinity) < PREFETCH_EVERY_MS) return;
  // Already known (kept, or learned recently enough): a click opens at once without asking more,
  // and a read now would only compete with the click's own on a slow link.
  if (knownSession(openTargetKey({ kind: "link", path: href })) !== null) return;
  last.set(href, now);
  try {
    const list = await listOrgClaudeRuns(projectId, orgId, true);
    setResidentCapacity(list.capacity);
    const run = list.runs.find(
      (r) =>
        r.status === "running" &&
        r.claudeSessionId === claudeSessionId &&
        r.sessionId !== undefined,
    );
    if (run?.sessionId === undefined) return;
    const machine = machineForOrg(projectId, orgId);
    rememberLinkedMachine(run.sessionId, machine);
    warmSurface(run.sessionId);
    const { session } = await api.getSession(run.sessionId);
    warmTarget(openTargetKey({ kind: "link", path: href }), session, {
      projectId,
      orgId,
      runId: run.id,
      machine,
    });
  } catch {
    // Nothing learned: the click follows the link as it always could.
  }
}
