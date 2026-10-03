/**
 * The session list's per-Project choices that survive a refresh: the grouping mode, which
 * groups are collapsed, pinned or (folder-only) opened, the pinned conversations, the row sort
 * mode and manual order, the manual group order, and the manually-added Workspaces.
 */
import { useEffect, useState } from "react";
import { initialGroupMode, storeGroupMode } from "../../components/ui/group-list";
import type { GroupMode } from "../../components/ui/group-list";
import {
  initialSessionSortMode,
  loadSessionOrder,
  storeSessionSortMode,
} from "../../lib/session-order";
import type { SessionSortMode } from "../../lib/session-order";
import { loadWorkspaceRegistry, saveWorkspaceRegistry } from "../../lib/workspace-registry";
import type { WorkspaceEntry } from "../../lib/workspace-registry";
import { loadPinnedSessions, savePinnedSessions, togglePinnedSession } from "./pinned-sessions";
import { loadGroupOrder } from "./group-order";

/**
 * Collapsed-group and pinned-group persistence (survives a refresh), one storage key
 * per Project and concern — group keys are Agent ids / Workspace paths, which are
 * Project-scoped. Both grouping modes share one set per concern (their key spaces
 * never collide); stray keys left by deleted Agents or Workspaces are harmless
 * (never matched) and the per-Project sets stay tiny.
 */
const collapsedGroupsKey = (projectId: string) => `penguin.sidebarCollapsedGroups.${projectId}`;
const pinnedGroupsKey = (projectId: string) => `penguin.sidebarPinnedGroups.${projectId}`;
/**
 * Opened folder-only groups, in a set of their own because the two say opposite things: a
 * group that opens by default stores the keys the user CLOSED, while a folder-only group
 * (collapsed by default — session-grouping.ts's isFolderOnly) stores the keys the user
 * OPENED. A group that gains an active row stops being folder-only and is simply read out of
 * the other set again, which is why neither set ever has to be rewritten.
 */
const expandedFolderOnlyGroupsKey = (projectId: string) =>
  `penguin.sidebarExpandedFolderGroups.${projectId}`;
/** Reads a persisted group-key set (no Project yet / corrupted storage degrade to empty). */
function loadGroupSet(storageKey: string | null): ReadonlySet<string> {
  if (!storageKey) return new Set();
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return new Set(
      Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [],
    );
  } catch {
    return new Set();
  }
}
function saveGroupSet(storageKey: string | null, next: ReadonlySet<string>): void {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify([...next]));
  } catch {
    /* best-effort persistence (quota/private mode) */
  }
}

export function useListPrefs({
  currentProjectId,
  searching,
  resetReveal,
}: {
  currentProjectId: string | null;
  /** A live search: groups render force-opened, so toggling one would change nothing on screen. */
  searching: boolean;
  /** Drops the page and reveal state that a Project or mode switch makes meaningless. */
  resetReveal: () => void;
}) {
  const collapseStoreKey = currentProjectId === null ? null : collapsedGroupsKey(currentProjectId);
  const pinStoreKey = currentProjectId === null ? null : pinnedGroupsKey(currentProjectId);
  const folderOnlyStoreKey =
    currentProjectId === null ? null : expandedFolderOnlyGroupsKey(currentProjectId);
  /** Grouping mode of the Session list (Workspace by default; the choice persists across sessions). */
  const [groupMode, setGroupModeState] = useState<GroupMode>(initialGroupMode);
  /** Collapsed groups (expanded by default), keyed by Agent id or Workspace group key depending on the mode; persisted per Project. */
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() =>
    loadGroupSet(collapseStoreKey),
  );
  /** Pinned groups (sorted before unpinned within their mode), keyed like collapsedGroups; persisted per Project. */
  const [pinnedGroups, setPinnedGroups] = useState<ReadonlySet<string>>(() =>
    loadGroupSet(pinStoreKey),
  );
  /** Folder-only groups the user has opened (they render collapsed by default), keyed like collapsedGroups but persisted in their own set — the two record opposite choices (see expandedFolderOnlyGroupsKey). */
  const [expandedFolderOnlyGroups, setExpandedFolderOnlyGroups] = useState<ReadonlySet<string>>(
    () => loadGroupSet(folderOnlyStoreKey),
  );
  /** Pinned conversations (bubbled to the top of their group's active list), Session ids; persisted per Project frontend-side (pinned-sessions.ts). */
  const [pinnedSessions, setPinnedSessions] = useState<ReadonlySet<string>>(() =>
    loadPinnedSessions(currentProjectId),
  );
  /** Row sort mode ("recent" default / "manual" drag order; the choice persists across sessions like the grouping mode). */
  const [sortMode, setSortModeState] = useState<SessionSortMode>(initialSessionSortMode);
  /** Manual row order (Session ids; only relative order within a co-rendered partition matters); persisted per Project AND grouping mode — the modes cut different partitions. */
  const [sessionOrder, setSessionOrder] = useState<readonly string[]>(() =>
    loadSessionOrder(currentProjectId, initialGroupMode()),
  );
  /**
   * Manual GROUP order (Workspace keys / Agent ids), persisted per Project and grouping
   * mode like the row order. Independent of `sortMode`: dragging a group is itself the
   * intent, so there is no second toggle — an empty array is the identity and the list
   * keeps its automatic sort. Empty in time mode, whose buckets are chronological
   * (group-order.ts).
   */
  const [groupOrder, setGroupOrder] = useState<readonly string[]>(() =>
    loadGroupOrder(currentProjectId, initialGroupMode()),
  );
  /** Manually-added Workspaces (header 新建工作区; render as empty groups until Sessions exist, with optional display aliases); persisted per Project. */
  const [registeredWorkspaces, setRegisteredWorkspaces] = useState<readonly WorkspaceEntry[]>(() =>
    loadWorkspaceRegistry(currentProjectId),
  );
  // Project resolved on first load / switched: swap in that Project's persisted collapse/pin sets.
  useEffect(() => {
    setCollapsedGroups(loadGroupSet(collapseStoreKey));
    setPinnedGroups(loadGroupSet(pinStoreKey));
    setExpandedFolderOnlyGroups(loadGroupSet(folderOnlyStoreKey));
    setPinnedSessions(loadPinnedSessions(currentProjectId));
    setSessionOrder(loadSessionOrder(currentProjectId, groupMode));
    setGroupOrder(loadGroupOrder(currentProjectId, groupMode));
    setRegisteredWorkspaces(loadWorkspaceRegistry(currentProjectId));
    // The other Project's groups are gone, and so is any meaning their reveal state had.
    resetReveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseStoreKey, pinStoreKey, folderOnlyStoreKey, currentProjectId]);

  const setGroupMode = (mode: GroupMode) => {
    storeGroupMode(mode);
    setGroupModeState(mode);
    // The modes have unrelated group lists: go back to the first page, drop the per-group
    // reveal state (a cap keyed by an Agent id means nothing to a Workspace group), and
    // swap in this mode's own manual order (the stored sequence is read within partitions,
    // whose boundaries are exactly what the mode decides — one shared array would scramble).
    setSessionOrder(loadSessionOrder(currentProjectId, mode));
    setGroupOrder(loadGroupOrder(currentProjectId, mode));
    resetReveal();
  };

  /**
   * Collapse/expand a group. A folder-only group flips the OTHER set: it is collapsed by
   * default, so what persists is the fact that the user opened it (expandedFolderOnlyGroupsKey).
   */
  const toggleGroup = (key: string, folderOnly = false) => {
    // Inert while searching: groups render force-opened then, so a click would change
    // nothing on screen while silently rewriting the persisted collapse state — the user
    // would find groups flipped once the query clears.
    if (searching) return;
    // Computed outside the state updater (theme.tsx convention): the persistence write is a
    // side effect, and updaters must stay pure (double-invoked in StrictMode).
    const next = new Set(folderOnly ? expandedFolderOnlyGroups : collapsedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    if (folderOnly) {
      setExpandedFolderOnlyGroups(next);
      saveGroupSet(folderOnlyStoreKey, next);
    } else {
      setCollapsedGroups(next);
      saveGroupSet(collapseStoreKey, next);
    }
  };

  /** Pin / unpin a group (same toggle-and-persist convention as toggleGroup). */
  const togglePin = (key: string) => {
    const next = new Set(pinnedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPinnedGroups(next);
    saveGroupSet(pinStoreKey, next);
  };

  /** Pin / unpin one conversation (row menu; same toggle-and-persist convention). */
  const toggleSessionPin = (sessionId: string) => {
    const next = togglePinnedSession(pinnedSessions, sessionId);
    setPinnedSessions(next);
    savePinnedSessions(currentProjectId, next);
  };

  /** Switch the row sort mode (store-then-set convention). Leaving manual KEEPS the stored order — toggling back restores it. */
  const setSortMode = (mode: SessionSortMode) => {
    storeSessionSortMode(mode);
    setSortModeState(mode);
  };

  /** Persist-if-changed for every registry mutation (register / alias / unregister share the same-reference fast exit). */
  const applyRegistryChange = (next: readonly WorkspaceEntry[]) => {
    if (next === registeredWorkspaces) return;
    setRegisteredWorkspaces(next);
    saveWorkspaceRegistry(currentProjectId, next);
  };

  return {
    groupMode,
    setGroupMode,
    collapsedGroups,
    pinnedGroups,
    expandedFolderOnlyGroups,
    pinnedSessions,
    setPinnedSessions,
    sortMode,
    setSortMode,
    sessionOrder,
    setSessionOrder,
    groupOrder,
    setGroupOrder,
    registeredWorkspaces,
    applyRegistryChange,
    toggleGroup,
    togglePin,
    toggleSessionPin,
  };
}
