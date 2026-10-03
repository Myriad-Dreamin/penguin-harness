/**
 * How much of the session list is on screen: which page of groups, how far each group and each
 * folder has been revealed, which folders are open, and which "More" fetches are in flight —
 * plus the loads that keep a revealed page filled.
 */
import { useEffect, useRef, useState } from "react";
import type { SessionCategory, SessionInfo } from "@prismshadow/penguin-server/api";
import type { GroupMode } from "../../components/ui/group-list";
import {
  SIDEBAR_PAGE_SIZE,
  TIME_FOLDERS_GROUP_KEY,
  clampGroupPage,
  cutAtWatermark,
  groupPageCount,
  groupPageSlice,
  sessionCategory,
  workspaceGroupKey,
} from "../../lib/session-grouping";
import type { FolderCategory, GroupCounts, WorkspaceGroup } from "../../lib/session-grouping";
import { machineForSession } from "../../lib/session-machines";
import { useSessions } from "../../state/sessions";

/**
 * Open-state key of a collapsed folder (subagent / scheduled / evaluations / archived) inside
 * a group: each folder has its own state. "\0" never appears in Agent ids or Workspace paths,
 * so the composite never collides across groups or with plain group keys.
 */
export const folderKey = (groupKey: string, category: FolderCategory) => `${category}\0${groupKey}`;

/**
 * The reveal state on its own, declared ahead of the choices that reset it: a Project switch
 * and a grouping-mode switch both drop the page and the reveal caps (list-prefs.ts).
 */
export function useRevealState() {
  /** Expanded folders (subagent / scheduled / evaluations / archived; collapsed by default), keyed by folderKey — each folder has its own open state. */
  const [openFolders, setOpenFolders] = useState<ReadonlySet<string>>(new Set());
  /** "More" rows with a fetch in flight, keyed `${category}\0${groupKey}` — the row disables and reads "loading" so a page that lands entirely in other groups still visibly did something. */
  const [pendingLoads, setPendingLoads] = useState<ReadonlySet<string>>(new Set());
  /** Per-group display cap for active rows (keyed by group key; absent = SIDEBAR_PAGE_SIZE). "More" raises it a page at a time. */
  const [groupCaps, setGroupCaps] = useState<ReadonlyMap<string, number>>(new Map());
  /** The same display cap per folder (keyed by folderKey; absent = SIDEBAR_PAGE_SIZE), so an expanded folder reveals a page at a time instead of everything a fetch returned. */
  const [folderCaps, setFolderCaps] = useState<ReadonlyMap<string, number>>(new Map());
  /** Which PAGE of groups renders (#139: dozens of Agents/Workspaces made the list too tall to scan), 0-based; reset per Project and on a mode switch, and clamped at render to the pages that still exist. */
  const [groupPage, setGroupPage] = useState(0);

  const resetReveal = () => {
    setGroupPage(0);
    setGroupCaps(new Map());
    setFolderCaps(new Map());
  };
  return {
    openFolders,
    setOpenFolders,
    pendingLoads,
    setPendingLoads,
    groupCaps,
    setGroupCaps,
    folderCaps,
    setFolderCaps,
    groupPage,
    setGroupPage,
    resetReveal,
  };
}

/** The reveal state's behaviour over the current group lists. */
export function useGroupReveal({
  reveal,
  groupMode,
  searching,
  sessions,
  activeSessionId,
  agentGroupTotal,
  orderedWorkspaceGroups,
  workspaceGroupCounts,
}: {
  reveal: ReturnType<typeof useRevealState>;
  groupMode: GroupMode;
  searching: boolean;
  sessions: SessionInfo[];
  activeSessionId: string | null;
  /** How many Agent groups the agent mode lists (its pager's total). */
  agentGroupTotal: number;
  orderedWorkspaceGroups: WorkspaceGroup[];
  workspaceGroupCounts: ReadonlyMap<string, GroupCounts>;
}) {
  const { isLoadedFor, hasMoreFor, activityWatermarkFor, loadMoreFor } = useSessions();
  const {
    openFolders,
    setOpenFolders,
    pendingLoads,
    setPendingLoads,
    groupCaps,
    setGroupCaps,
    folderCaps,
    setFolderCaps,
    groupPage,
  } = reveal;

  /**
   * Group pagination (Workspace / Agent modes — time mode has at most three buckets and
   * pages nothing). A pure display window: the manual group order still commits over the
   * FULL sequence (see groupDragProps), and no group's data loading depends on which page
   * it sits on. Search bypasses paging entirely — a match on page 3 would read as no match
   * at all, which is the same reason a collapsed group is forced open while searching.
   */
  const pagedGroupTotal =
    groupMode === "agent"
      ? agentGroupTotal
      : groupMode === "workspace"
        ? orderedWorkspaceGroups.length
        : 0;
  const groupPageTotal = groupPageCount(pagedGroupTotal);
  /** The page actually on screen: the stored one, pinned inside the pages that still exist. */
  const shownGroupPage = clampGroupPage(groupPage, pagedGroupTotal);

  /** The groups to render: this page's slice, or every match while searching. */
  const groupsOnPage = <T>(groups: T[]): T[] =>
    searching ? groups : groupPageSlice(groups, shownGroupPage);

  /** In-flight key of one group's category "More" (folderKey shares the same composite for folder categories). */
  const loadKey = (groupKey: string, category: SessionCategory) => `${category}\0${groupKey}`;

  /**
   * The server stream a group's fetches walk: its own, under Workspace grouping, or the
   * Agent's whole one otherwise. Only Workspace groups need their own — an Agent group IS
   * the whole stream, and a time bucket is cut from rows that are already loaded, so it
   * fetches nothing of its own at all.
   *
   * This is what makes the groups independent. Sharing one per-Agent cursor meant a group's
   * "load more" consumed the page its siblings were about to read: their rows appeared,
   * their reveal counts moved, and the group that asked could grow by less than a page — or
   * by nothing at all.
   */
  const fetchScope = (groupKey: string): string | undefined =>
    groupMode === "workspace" ? groupKey : undefined;

  /** loadMoreFor with an in-flight marker for the triggering "More" row (disable + loading text). */
  const trackedLoadMore = (groupKey: string, category: SessionCategory, agentIds: string[]) => {
    const key = loadKey(groupKey, category);
    setPendingLoads((prev) => new Set(prev).add(key));
    void loadMoreFor(agentIds, category, fetchScope(groupKey)).finally(() => {
      setPendingLoads((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    });
  };

  /**
   * Open/close a group's folder. A folder's content is loaded on demand: the first
   * expand fetches its category's first page for every contributing Agent that hasn't
   * been asked yet (already-loaded rows stay put — re-expanding never refetches; the
   * folder's own "More" row does the paging from there).
   */
  const toggleFolder = (groupKey: string, category: FolderCategory, agentIds: string[]) => {
    // Inert while searching (same reason as toggleGroup): folders render force-opened,
    // so a click would only fire a pointless category fetch and desync the open state.
    if (searching) return;
    const key = folderKey(groupKey, category);
    const opening = !openFolders.has(key);
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (opening) next.add(key);
      else next.delete(key);
      return next;
    });
    if (opening) {
      const scope = fetchScope(groupKey);
      const unloaded = agentIds.filter((id) => !isLoadedFor(id, category, scope));
      if (unloaded.length > 0) void loadMoreFor(unloaded, category, scope);
    }
  };

  // The open chat is an automation-created Session: expand exactly its origin's folder in its
  // group, so the active row is never hidden inside a collapsed folder (mirrors the archived
  // expansion on archiving the open chat; archived wins, so an archived Session is left to
  // that folder). Auto-expansion fires ONCE per (grouping mode, active session): the ref guard
  // keeps list mutations (status ticks, reloads) from re-opening a folder the user explicitly
  // collapsed while that chat stays open. `sessions` must remain a dependency — the active
  // session may not be in the list yet on first render, and the guard is only set once the
  // row is actually found and expanded.
  const lastAutoExpandedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeSessionId) return;
    const s = sessions.find((x) => x.sessionId === activeSessionId);
    if (!s) return;
    const category = sessionCategory(s);
    if (category === "active" || category === "archived") return;
    const guard = `${groupMode}\0${activeSessionId}`;
    if (lastAutoExpandedRef.current === guard) return;
    lastAutoExpandedRef.current = guard;
    const groupKey =
      groupMode === "agent"
        ? s.agentId
        : groupMode === "time"
          ? TIME_FOLDERS_GROUP_KEY
          : workspaceGroupKey(s.workspace, machineForSession(s.sessionId));
    const key = folderKey(groupKey, category);
    setOpenFolders((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    // Same on-demand load a click-expand does, for this Session's own Agent (siblings of
    // other contributing Agents stay behind the folder's "More"), down the same stream the
    // folder itself pages.
    const scope = groupMode === "workspace" ? groupKey : undefined;
    if (!isLoadedFor(s.agentId, category, scope)) void loadMoreFor([s.agentId], category, scope);
  }, [activeSessionId, sessions, groupMode, isLoadedFor, loadMoreFor]);

  /**
   * Workspace mode: give every rendered group its own first page. The initial load reads
   * the Agent's whole stream, which is one stream cut by Workspace — it fills the groups
   * unevenly, so a group can come up with two rows while the neighbour it shares an Agent
   * with got eight. Any group left short of a full first page (or of its own total, if that
   * is smaller) asks for one down its own stream, once: the scoped pair is loaded from then
   * on and this is inert.
   *
   * Only the groups on screen ask — the pager bounds that to one page of groups — and a
   * search is left alone, since it renders loaded matches only and fetching cannot find more.
   *
   * The ask is marked in flight like a "More" click (pendingLoads), for two reasons: a group
   * the counts know but no page has loaded rows of starts out empty, and its body must read
   * as loading rather than as having no conversations; and the marker is what keeps this
   * effect from asking twice — every landed page changes the group list and re-runs it, and
   * an in-flight pair is still unloaded, so a second request would start its cursor over and
   * the group would later skip a page.
   */
  useEffect(() => {
    if (groupMode !== "workspace" || searching) return;
    for (const group of groupPageSlice(orderedWorkspaceGroups, shownGroupPage)) {
      const counts = workspaceGroupCounts.get(group.key);
      const total = counts?.totals.active ?? 0;
      const agents = [
        ...new Set([...(counts?.agents.active ?? []), ...group.sessions.map((s) => s.agentId)]),
      ];
      // Counts not in yet (0): nothing is known to be missing, so nothing is asked for. What
      // the group SHOWS is what a first page has to fill: rows in memory below its watermark
      // (another Agent's stream reached further) are not on screen.
      const loaded = cutAtWatermark(
        group.sessions.filter((s) => sessionCategory(s) === "active"),
        activityWatermarkFor(agents, "active", group.key),
      ).length;
      if (loaded >= Math.min(SIDEBAR_PAGE_SIZE, total)) continue;
      const unloaded = agents.filter((id) => !isLoadedFor(id, "active", group.key));
      if (unloaded.length === 0) continue;
      const key = loadKey(group.key, "active");
      if (pendingLoads.has(key)) continue;
      setPendingLoads((prev) => new Set(prev).add(key));
      void loadMoreFor(unloaded, "active", group.key).finally(() => {
        setPendingLoads((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      });
    }
  }, [
    groupMode,
    searching,
    orderedWorkspaceGroups,
    shownGroupPage,
    workspaceGroupCounts,
    isLoadedFor,
    activityWatermarkFor,
    loadMoreFor,
    pendingLoads,
  ]);

  /**
   * A folder's "Show N more chats": reveal one more page of the rows it already holds,
   * and fetch its next server page only when the reveal actually runs past them and
   * somewhere is left to fetch from. Mirrors the active list's showMore — a page already
   * in memory spends no request, which in time mode is a fan-out across every
   * contributing Agent.
   */
  const revealFolderMore = (
    groupKey: string,
    category: FolderCategory,
    agentIds: string[],
    loaded: number,
  ) => {
    const key = folderKey(groupKey, category);
    const nextCap = (folderCaps.get(key) ?? SIDEBAR_PAGE_SIZE) + SIDEBAR_PAGE_SIZE;
    setFolderCaps((prev) => {
      const next = new Map(prev);
      next.set(key, nextCap);
      return next;
    });
    if (loaded < nextCap && agentIds.some((id) => hasMoreFor(id, category, fetchScope(groupKey)))) {
      trackedLoadMore(groupKey, category, agentIds);
    }
  };

  /** A folder's "show less": back to the first page (rows already fetched stay in memory). */
  const collapseFolder = (key: string) => {
    setFolderCaps((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  };

  /**
   * Active-list "Show N more chats": reveal one more page of this group's already-loaded
   * active rows, and fetch the next active server page only when the reveal actually runs
   * past what is loaded. A group whose next page is already in memory spends no request —
   * in workspace mode a fetch fans out to every Agent contributing to the group and its
   * rows may land in other groups entirely, so a pointless one is not free.
   */
  const showMore = (groupKey: string, agentIds: string[], loaded: number) => {
    const nextCap = (groupCaps.get(groupKey) ?? SIDEBAR_PAGE_SIZE) + SIDEBAR_PAGE_SIZE;
    setGroupCaps((prev) => {
      const next = new Map(prev);
      next.set(groupKey, nextCap);
      return next;
    });
    if (agentIds.length > 0 && loaded < nextCap) trackedLoadMore(groupKey, "active", agentIds);
  };

  /** "Show less": drop one group's reveal back to the first page (rows already fetched stay in memory). */
  const collapseRows = (groupKey: string) => {
    setGroupCaps((prev) => {
      if (!prev.has(groupKey)) return prev;
      const next = new Map(prev);
      next.delete(groupKey);
      return next;
    });
  };

  return {
    groupPageTotal,
    shownGroupPage,
    groupsOnPage,
    loadKey,
    fetchScope,
    trackedLoadMore,
    toggleFolder,
    revealFolderMore,
    collapseFolder,
    showMore,
    collapseRows,
  };
}
