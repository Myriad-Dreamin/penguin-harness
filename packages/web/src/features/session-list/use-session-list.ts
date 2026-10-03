/**
 * The session list's controller: every piece of state the list, its groups and its dialogs read,
 * and every action they take, composed from the hooks beside it. The section's scope calls it
 * (section.tsx), so the list's state lives as long as the sidebar does — another work mode does
 * not render the list, and coming back finds it as it was left.
 */
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useMatch, useNavigate } from "react-router";
import type { SessionCategory, SessionInfo } from "@prismshadow/penguin-server/api";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { onCommand } from "../../lib/shortcuts/dispatcher";
import { noteSessionSeen, useSessionSeen } from "../../lib/session-seen";
import {
  TIME_FOLDERS_GROUP_KEY,
  groupPageOf,
  groupSessionsByTime,
  matchesSessionQuery,
  partitionSessions,
  totalCategoryCounts,
  workspaceGroupKey,
} from "../../lib/session-grouping";
import type { SessionPartition } from "../../lib/session-grouping";
import { machineForSession } from "../../lib/session-machines";
import { registerWorkspace } from "../../lib/workspace-registry";
import type { SessionSortMode } from "../../lib/session-order";
import { newEntityForGroupMode } from "../../components/ui/group-list";
import { useAuth } from "../../state/auth";
import { useLocale } from "../../state/locale";
import { useProject } from "../../state/project";
import { useSessions } from "../../state/sessions";
import type { WorkspaceGroupEntry } from "../../lib/session-row-contributions";
import { sessionListDeps } from "./deps";
import { useListPrefs } from "./list-prefs";
import { useSessionGroups } from "./use-session-groups";
import { folderKey, useGroupReveal, useRevealState } from "./use-group-reveal";
import { useSessionDrag } from "./use-session-drag";
import { useSessionDialogs } from "./use-session-dialogs";

export function useSessionList({
  onNavigate,
  canDrag,
  current,
  rootRef,
  initialSearchOpen,
}: {
  onNavigate: (() => void) | undefined;
  /** Whether a pointer that can drag is present: manual sort and group reorder need one. */
  canDrag: boolean;
  /** The list's work mode is the current one; in another the list is not rendered, so the search command declines. */
  current: boolean;
  /** The sidebar's root: hidden (`display: none`) below the `md` breakpoint while still mounted. */
  rootRef: RefObject<HTMLDivElement | null>;
  /** Mount with the session search open and focused: the search shortcut pressed on the collapsed rail. */
  initialSearchOpen: boolean;
}) {
  const navigate = useNavigate();
  const { drafts, rows, useRowMarks } = sessionListDeps.useDeps();
  const { user } = useAuth();
  const { locale } = useLocale();
  const { currentProject, agents, setCurrentAgentId } = useProject();
  const { countsByAgent, machineLabels, hasMoreFor, loading, replace } = useSessions();
  const chatMatch = useMatch("/chat/:sessionId");
  const activeSessionId = chatMatch?.params.sessionId ?? null;
  const currentProjectId = currentProject?.projectId ?? null;

  const reveal = useRevealState();
  /** Live title search: the input's visibility and its query (transient — never persisted). */
  const [searchOpen, setSearchOpen] = useState(initialSearchOpen);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // The sessions.search command: open the field, or put the caret back into an open one. It
  // declines (the browser's own key runs) when the field could not be seen: another work mode
  // has no session list, and the pinned sidebar is `display: none` below the `md` breakpoint
  // while still mounted. Re-registered when the field opens or closes so the handler reads the state.
  useEffect(
    () =>
      onCommand("sessions.search", () => {
        if (!current) return false;
        if (rootRef.current !== null && rootRef.current.getClientRects().length === 0) return false;
        if (searchOpen) searchInputRef.current?.focus();
        else setSearchOpen(true);
      }),
    [searchOpen, current],
  );
  const [searchQuery, setSearchQuery] = useState("");
  /** Search active = a non-blank query is live-filtering the list. */
  const searching = searchQuery.trim() !== "";
  /** Close the search row and drop the filter (the toggle button, the clear ×, and Escape all land here). */
  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
  };

  const prefs = useListPrefs({
    currentProjectId,
    searching,
    resetReveal: reveal.resetReveal,
  });
  const { groupMode, sortMode, registeredWorkspaces, applyRegistryChange } = prefs;
  const groups = useSessionGroups({
    groupMode,
    pinnedGroups: prefs.pinnedGroups,
    groupOrder: prefs.groupOrder,
    registeredWorkspaces,
  });
  const { sessions, byAgent, orderedAgents, orderedWorkspaceGroups } = groups;

  /** This Project's read markers; re-renders the rows whenever one is stamped. */
  const sessionSeen = useSessionSeen(currentProjectId);
  /** What the contributed marks say on each row (the relay, the scheduled task; rowActions). */
  const rowMarks = useRowMarks();
  /** Header list-settings dropdown (grouping + sort radios). */
  const [listSettingsOpen, setListSettingsOpen] = useState(false);

  const drag = useSessionDrag({ prefs, currentProjectId, canDrag, searching });
  const revealOps = useGroupReveal({
    reveal,
    groupMode,
    searching,
    sessions,
    activeSessionId,
    agentGroupTotal: orderedAgents.length,
    orderedWorkspaceGroups,
    workspaceGroupCounts: groups.workspaceGroupCounts,
  });
  /** Parked draft conversations of this user × Project, newest first (reactive, the chat module's). */
  const draftEntries = drafts.useParked(user?.userId ?? null, currentProjectId);
  const dialogs = useSessionDialogs({ prefs, byAgent, currentProjectId, activeSessionId });

  /** Group key a Session's FOLDERS hang off under the current mode (the archived-open state); time mode keeps one shared set for the whole Project. */
  const sessionGroupKey = (s: SessionInfo) =>
    groupMode === "agent"
      ? s.agentId
      : groupMode === "time"
        ? TIME_FOLDERS_GROUP_KEY
        : workspaceGroupKey(s.workspace, machineForSession(s.sessionId));

  /** The sort actually applied: a stored "manual" needs a drag-capable pointer to mean anything (see canDrag). */
  const effectiveSortMode: SessionSortMode = sortMode === "manual" && canDrag ? "manual" : "recent";

  /** Title filter of one group's loaded rows (search only sees loaded pages — there is no server-side search). */
  const filterRows = (rows: SessionInfo[]) =>
    searching ? rows.filter((s) => matchesSessionQuery(s, searchQuery)) : rows;

  /**
   * Time mode's split of the loaded rows: the buckets take the active conversations, the
   * shared folders below take the rest. Deliberately NOT memoized — the bucket boundary is
   * `Date.now()`, and a memo would freeze it at its last dependency change; the compact
   * relative timestamps rendered beside these rows are recomputed every render for exactly
   * the same reason. Null outside time mode, so no other mode pays for the two passes.
   */
  const timeParts = groupMode === "time" ? partitionSessions(filterRows(sessions)) : null;
  const timeGroups = timeParts === null ? [] : groupSessionsByTime(timeParts.active, Date.now());

  /** Time mode's exact server share, Project-wide: its buckets span every Agent, so the shared folders and the whole-list "More" read the summed counts. */
  const projectCounts = totalCategoryCounts(countsByAgent);

  /** Agents holding rows of a category anywhere in this Project — time mode's fetch fan-out (the counts are kept in step locally, so they cover freshly added rows too). */
  const projectAgentsFor = (category: SessionCategory) =>
    [...countsByAgent].filter(([, counts]) => counts[category] > 0).map(([agentId]) => agentId);

  /** Agents with an unfetched active page left; the whole-list "More" of time mode pages all of them at once. */
  const timeMoreAgents = projectAgentsFor("active").filter((id) => hasMoreFor(id, "active"));

  /** A time bucket's rows as a group partition: the buckets carry active conversations only. */
  const bucketPartition = (rows: SessionInfo[]): SessionPartition => ({
    active: rows,
    subagent: [],
    schedule: [],
    benchmark: [],
    archived: [],
  });

  /** Parked drafts through the live search (matched on their first-line title). */
  const shownDrafts = searching
    ? draftEntries.filter((e) => e.title.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : draftEntries;

  /** Whether the active search hits anything anywhere (drafts included) — drives the quiet no-match line. */
  const hasSearchMatches =
    shownDrafts.length > 0 ||
    (groupMode === "agent"
      ? orderedAgents.some((a) => filterRows(byAgent.get(a.agentId) ?? []).length > 0)
      : groupMode === "time"
        ? timeParts !== null && Object.values(timeParts).some((rows) => rows.length > 0)
        : orderedWorkspaceGroups.some((g) => filterRows(g.sessions).length > 0));

  /** Archive / unarchive: persists immediately and updates in place (fails silently; the next list refresh self-corrects). */
  const toggleArchive = async (s: SessionInfo) => {
    // Archiving the currently open chat: expand the "archived" folder so it doesn't silently vanish from the sidebar with no way back.
    if (!s.archived && s.sessionId === activeSessionId) {
      reveal.setOpenFolders((prev) => new Set(prev).add(folderKey(sessionGroupKey(s), "archived")));
    }
    try {
      const res = await api.patchSession(s.sessionId, { archived: !s.archived });
      replace(res.session);
    } catch {
      /* Ignore: non-critical operation */
    }
  };

  const go = (to: string) => {
    navigate(to);
    onNavigate?.();
  };

  /**
   * New chat: enters draft state (/chat/new) without creating a Session — Model / Workspace /
   * approval mode are all chosen on the draft input card, and the Session is only actually
   * created when the first message is sent. Route state carries only what the clicked entry
   * is about: the agent-mode group header's "+" names that group's Agent, the workspace-mode
   * group header's "+" names that group's Workspace path ("" = a temporary workspace), and the
   * pinned "New chat" and the header's create button name nothing. Every field left unnamed
   * starts on the Project's new-chat defaults, then the built-in fallback (new-chat.ts).
   */
  const newChat = ({
    agentId,
    workspace,
    machineId,
    browseFiles,
  }: { agentId?: string; workspace?: string; machineId?: string; browseFiles?: boolean } = {}) => {
    // Typed-but-unsent text in the ACTIVE new-chat draft becomes a parked draft
    // conversation first (a row in the list below, sendable anytime — draft-sessions.ts),
    // so this click always lands on an empty composer and never silently shelves content;
    // the selections a text-less earlier visit left behind are released with it.
    if (user && currentProjectId) drafts.prepareNewChat(user.userId, currentProjectId);
    if (agentId) setCurrentAgentId(agentId);
    const state = {
      ...(agentId ? { agentId } : {}),
      // The machine travels WITH the path, always — including its absence. A path names a
      // different directory on every machine, so handing the composer one without the other
      // is handing it a directory it cannot find.
      ...(workspace !== undefined ? { workspace, machineId } : {}),
      // The chat page opens the dock's Files panel on arrival (a group's "Browse files").
      ...(browseFiles === true ? { browseFiles } : {}),
    };
    navigate(`/chat/${drafts.newChatId}`, Object.keys(state).length > 0 ? { state } : undefined);
    onNavigate?.();
  };

  /** Runs a contributed Workspace-group entry on a group's directory (rowActions). */
  const runWorkspaceEntry = (entry: WorkspaceGroupEntry, path: string, machineId: string | null) =>
    entry.run({ path, machineId }, { newChat, ...(onNavigate ? { onNavigate } : {}) });

  /** What the header's create button makes, and its tooltip (the created object follows the grouping mode). */
  const newEntity = newEntityForGroupMode(groupMode);
  const newEntityLabel =
    newEntity === "agent"
      ? S.agent.create
      : newEntity === "chat"
        ? S.chat.newSessionMenu
        : S.chat.newWorkspaceEntity;

  /**
   * 新建工作区: register the browsed pick so it surfaces as a group immediately, Sessions
   * or not. An empty registered group is appended and nothing pins or orders it yet, so it
   * lands last — turn to the page that now holds it, or to the page of the group that was
   * already there. Otherwise, past ten groups, the freshly added Workspace would sit on a
   * page the user is not looking at and the click would read as a no-op.
   */
  const addWorkspace = (path: string, machineId?: string | null) => {
    const next = registerWorkspace(registeredWorkspaces, path, machineId ?? undefined);
    if (next === registeredWorkspaces) return;
    applyRegistryChange(next);
    const key = workspaceGroupKey(path, machineId ?? null);
    const existing = orderedWorkspaceGroups.findIndex((g) => g.key === key);
    reveal.setGroupPage(groupPageOf(existing >= 0 ? existing : orderedWorkspaceGroups.length));
  };

  /**
   * The ssh alias of a group's machine, or null for this server's own groups — what a name
   * is qualified with. An unlabelled machine (the list is admin-only, and a machine can also
   * drop out of the ssh config) falls back to its id: honest, where inventing a name is not.
   */
  const machineNameOf = (machineId: string | null): string | null =>
    machineId === null ? null : (machineLabels.get(machineId) ?? machineId);

  const openSession = (s: SessionInfo) => {
    // Opening is what "read" means here: stamp the marker before navigating.
    noteSessionSeen(currentProjectId, s.sessionId, s.lastActiveAt);
    // Cross-group click: the current Agent follows this Session's own Agent.
    setCurrentAgentId(s.agentId);
    go(`/chat/${s.sessionId}`);
  };

  return {
    ...prefs,
    ...groups,
    ...reveal,
    ...revealOps,
    ...drag,
    ...dialogs,
    locale,
    agents,
    countsByAgent,
    loading,
    hasMoreFor,
    replace,
    activeSessionId,
    currentProjectId,
    sessionSeen,
    rowMarks,
    sessionEntries: rows.sessionEntries,
    workspaceEntries: rows.workspaceEntries,
    searchOpen,
    setSearchOpen,
    searchInputRef,
    searchQuery,
    setSearchQuery,
    searching,
    closeSearch,
    listSettingsOpen,
    setListSettingsOpen,
    canDrag,
    effectiveSortMode,
    filterRows,
    timeParts,
    timeGroups,
    projectCounts,
    projectAgentsFor,
    timeMoreAgents,
    bucketPartition,
    shownDrafts,
    hasSearchMatches,
    sessionGroupKey,
    toggleArchive,
    go,
    newChat,
    runWorkspaceEntry,
    newEntity,
    newEntityLabel,
    addWorkspace,
    machineNameOf,
    openSession,
  };
}

/** Everything the list's pieces read and do: one object, handed down as `list`. */
export type SessionListController = ReturnType<typeof useSessionList>;
