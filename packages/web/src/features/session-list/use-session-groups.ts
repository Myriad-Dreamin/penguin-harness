/**
 * The session list's derived views of the store: the user's own rows, the Workspace groups, the
 * folder-only groups of each mode, and both modes' group lists in their displayed order.
 */
import { useMemo } from "react";
import type { SessionCategoryCounts, SessionInfo } from "@prismshadow/penguin-server/api";
import type { GroupMode } from "../../components/ui/group-list";
import {
  FOLDER_CATEGORIES,
  aggregateWorkspaceCounts,
  aggregateWorkspaceLatest,
  completeWorkspaceGroups,
  foldedShare,
  groupSessionsByWorkspace,
  isFolderOnly,
  sessionCategory,
  withoutOrgSessions,
  workspaceGroupKey,
} from "../../lib/session-grouping";
import { machineForSession } from "../../lib/session-machines";
import { mergeRegisteredWorkspaces } from "../../lib/workspace-registry";
import type { WorkspaceEntry } from "../../lib/workspace-registry";
import { agentDisplayName, useProject } from "../../state/project";
import { useSessions } from "../../state/sessions";
import { orderGroups } from "./group-order";

/**
 * One group's active and folded shares — what decides whether it is folder-only, and the
 * count its dimmed header then carries. The server's exact per-category totals are raised,
 * category by category, by the rows already in memory: the counts are taken at fetch time, so
 * a conversation created since exists only as a loaded row (the rule a workspace group's
 * header count already applies to its active share).
 */
const groupShares = (
  totals: SessionCategoryCounts | undefined,
  rows: readonly SessionInfo[],
): { active: number; folded: number } => {
  const counts: SessionCategoryCounts = {
    active: 0,
    subagent: 0,
    schedule: 0,
    benchmark: 0,
    archived: 0,
  };
  for (const s of rows) counts[sessionCategory(s)] += 1;
  counts.active = Math.max(counts.active, totals?.active ?? 0);
  for (const category of FOLDER_CATEGORIES)
    counts[category] = Math.max(counts[category], totals?.[category] ?? 0);
  return { active: counts.active, folded: foldedShare(counts) };
};

export function useSessionGroups({
  groupMode,
  pinnedGroups,
  groupOrder,
  registeredWorkspaces,
}: {
  groupMode: GroupMode;
  pinnedGroups: ReadonlySet<string>;
  groupOrder: readonly string[];
  registeredWorkspaces: readonly WorkspaceEntry[];
}) {
  const { agents } = useProject();
  const {
    sessions: allSessions,
    byAgent: allByAgent,
    countsByAgent,
    workspaceCountsByAgent,
    workspaceLatestByAgent,
  } = useSessions();

  /**
   * The rows this list renders: the user's OWN conversations. An organization's desk and
   * ticket Sessions (marked by `orgId`, or by the durable `client === "org"` stamp once the
   * organization is gone) are driven by its scheduler and are reached as themselves in company
   * mode — a desk from the 工位 group, a ticket session from its ticket. The store's own
   * fetches already leave them out, totals and Workspace stamps included (the server's
   * `excludeOrg`), so the counts below are the list's exact share; this filter is for a row
   * that entered by another door (the chat page's deep-link self-heal), applied once, at the
   * source, or the dropped row would still conjure the Workspace group, Agent group or time
   * bucket it belongs to. It applies whatever the company-mode switches say (see
   * withoutOrgSessions): this list is the user's conversations, and a switch about the shell
   * does not turn a scheduler's Session into one.
   */
  const sessions = useMemo(() => withoutOrgSessions(allSessions), [allSessions]);
  const byAgent = useMemo(() => {
    const map = new Map<string, SessionInfo[]>();
    for (const [agentId, rows] of allByAgent) map.set(agentId, withoutOrgSessions(rows));
    return map;
  }, [allByAgent]);

  /** Workspace-mode per-group exact server totals (folded from the per-Agent per-Workspace counts). */
  const workspaceGroupCounts = useMemo(
    () => aggregateWorkspaceCounts(workspaceCountsByAgent),
    [workspaceCountsByAgent],
  );

  /** Workspace-mode per-group newest-Session stamps (folded the same way): a group's recency before any of its rows are loaded. */
  const workspaceGroupLatest = useMemo(
    () => aggregateWorkspaceLatest(workspaceLatestByAgent),
    [workspaceLatestByAgent],
  );

  /**
   * Workspace groups (workspace mode): the loaded rows' groups, completed with every
   * Workspace the server's counts know (empty until their rows page in — the initial load
   * is each Agent's ten newest conversations, which touch only a few of dozens of
   * Workspaces), by recency with the temp group last, plus the manually-added Workspaces
   * as empty groups behind them (newest registration first).
   */
  const workspaceGroups = useMemo(
    () =>
      mergeRegisteredWorkspaces(
        completeWorkspaceGroups(
          // A Workspace is a directory on a machine: rows from two machines that share a path
          // string are two groups, and the "+" of each opens a chat on its own machine.
          groupSessionsByWorkspace(sessions, (s) => machineForSession(s.sessionId)),
          workspaceGroupCounts,
          workspaceGroupLatest,
        ),
        registeredWorkspaces,
      ),
    [sessions, workspaceGroupCounts, workspaceGroupLatest, registeredWorkspaces],
  );

  /**
   * The folder-only groups of each mode: group key → the conversations folded inside it. A
   * group with no active conversation of its own but rows inside its folders — a Workspace
   * only subagents ever ran in, an Agent that has only ever been evaluated — folds up, sorts
   * behind the other groups of its mode and wears a dimmed header carrying that count. (The
   * Test Workspaces an evaluation creates per Case × Run never form groups of their own: they
   * fold into the merged temp group, see session-grouping.ts's isTempWorkspace.)
   *
   * Read off the group lists BEFORE they are ordered: the ordering consumes this, so it
   * cannot be what feeds it. The search query is deliberately not part of it either — a query
   * hides rows rather than emptying a group, and a list that folded and reshuffled itself as
   * the user typed would be unreadable.
   */
  const folderOnlyAgents = useMemo(() => {
    const out = new Map<string, number>();
    for (const agent of agents) {
      const shares = groupShares(
        countsByAgent.get(agent.agentId),
        byAgent.get(agent.agentId) ?? [],
      );
      if (isFolderOnly(shares.active, shares.folded)) out.set(agent.agentId, shares.folded);
    }
    return out;
  }, [agents, countsByAgent, byAgent]);
  const folderOnlyWorkspaceGroups = useMemo(() => {
    const out = new Map<string, number>();
    for (const group of workspaceGroups) {
      const shares = groupShares(workspaceGroupCounts.get(group.key)?.totals, group.sessions);
      if (isFolderOnly(shares.active, shares.folded)) out.set(group.key, shares.folded);
    }
    return out;
  }, [workspaceGroups, workspaceGroupCounts]);

  // Pinned groups first within each mode, then the manual drag order within each pin
  // partition, and the folder-only groups behind the rest of the unpinned cluster (a pinned
  // one stays where it was pinned). Nothing dragged yet = an empty order = the automatic
  // sort untouched (recency for Workspace groups with the temp group last, the configured
  // Agent order for Agents), which is also what a group with no stored place falls back to.
  // The stored array belongs to the mode it was loaded for: handing an Agent list an
  // order of Workspace keys is a no-op only as long as the two key namespaces cannot
  // collide, and it costs the empty-order fast path on every render of the other mode.
  const orderedAgents = useMemo(
    () =>
      orderGroups(agents, (a) => a.agentId, {
        pinned: pinnedGroups,
        order: groupMode === "agent" ? groupOrder : [],
        demote: (a) => folderOnlyAgents.has(a.agentId),
      }),
    [agents, pinnedGroups, groupOrder, groupMode, folderOnlyAgents],
  );
  const orderedWorkspaceGroups = useMemo(
    () =>
      orderGroups(workspaceGroups, (g) => g.key, {
        pinned: pinnedGroups,
        order: groupMode === "workspace" ? groupOrder : [],
        demote: (g) => folderOnlyWorkspaceGroups.has(g.key),
      }),
    [workspaceGroups, pinnedGroups, groupOrder, groupMode, folderOnlyWorkspaceGroups],
  );

  // The FULL displayed group sequences a drop commits — every group of the mode, not the
  // page of groups on screen (see groupDragProps).
  const agentGroupSequence = useMemo(() => orderedAgents.map((a) => a.agentId), [orderedAgents]);
  const workspaceGroupSequence = useMemo(
    () => orderedWorkspaceGroups.map((g) => g.key),
    [orderedWorkspaceGroups],
  );

  /** Registered Workspaces by GROUP key — only their groups offer the rename/remove overflow. */
  const registeredKeys = useMemo(
    () => new Set(registeredWorkspaces.map((e) => workspaceGroupKey(e.path, e.machineId ?? null))),
    [registeredWorkspaces],
  );

  /** agentId → display name (row hint tooltips in workspace mode). */
  const agentNameById = useMemo(
    () => new Map(agents.map((a) => [a.agentId, agentDisplayName(a)])),
    [agents],
  );

  return {
    sessions,
    byAgent,
    workspaceGroupCounts,
    folderOnlyAgents,
    folderOnlyWorkspaceGroups,
    orderedAgents,
    orderedWorkspaceGroups,
    agentGroupSequence,
    workspaceGroupSequence,
    registeredKeys,
    agentNameById,
  };
}
