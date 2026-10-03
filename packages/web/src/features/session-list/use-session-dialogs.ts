/**
 * The session list's dialogs' state and what confirming each one does: rename and delete a
 * conversation, delete a parked draft, rename and remove a registered Workspace, and the
 * messaging binding (session-dialogs.tsx draws them).
 */
import { useState } from "react";
import { useNavigate } from "react-router";
import type { SessionInfo } from "@prismshadow/penguin-server/api";
import { toastError } from "@prismshadow/penguin-ui";
import * as api from "../../api/endpoints";
import { apiErrorText } from "../../lib/api-error";
import { sessionCategory } from "../../lib/session-grouping";
import { forgetSession } from "../../lib/session-seen";
import { removeFromSessionOrder, saveSessionOrder } from "../../lib/session-order";
import { setWorkspaceAlias, unregisterWorkspace } from "../../lib/workspace-registry";
import { useAuth } from "../../state/auth";
import { useSessions } from "../../state/sessions";
import { DRAFT_SESSION_ID } from "../chat/chat-page";
import { clearDraft, sessionDraftKey } from "../chat/draft-cache";
import { removeDraftSession } from "../chat/draft-sessions";
import type { DraftSessionEntry } from "../chat/draft-sessions";
import { removePinnedSession, savePinnedSessions } from "./pinned-sessions";
import type { useListPrefs } from "./list-prefs";

export function useSessionDialogs({
  prefs,
  byAgent,
  currentProjectId,
  activeSessionId,
}: {
  prefs: ReturnType<typeof useListPrefs>;
  byAgent: ReadonlyMap<string, SessionInfo[]>;
  currentProjectId: string | null;
  activeSessionId: string | null;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { remove, replace } = useSessions();
  const {
    groupMode,
    pinnedSessions,
    setPinnedSessions,
    sessionOrder,
    setSessionOrder,
    registeredWorkspaces,
    applyRegistryChange,
  } = prefs;
  /** Registered Workspace being renamed (alias edit; null = none) and the alias being typed. The machine is half of which directory this is. */
  const [renamingWorkspace, setRenamingWorkspace] = useState<{
    path: string;
    machineId: string | null;
  } | null>(null);
  const [workspaceAliasText, setWorkspaceAliasText] = useState("");
  /** Registered Workspace pending removal confirmation (null = none); label = the group's displayed name for the confirm copy. */
  const [deletingWorkspace, setDeletingWorkspace] = useState<{
    path: string;
    machineId: string | null;
    label: string;
  } | null>(null);
  /** Session pending delete confirmation (null = none). */
  const [deletingSession, setDeletingSession] = useState<SessionInfo | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  /** Parked draft conversation pending delete confirmation (null = none). */
  const [deletingDraft, setDeletingDraft] = useState<DraftSessionEntry | null>(null);
  /** Session currently being renamed (null = none) and the title being typed. */
  const [renamingSession, setRenamingSession] = useState<SessionInfo | null>(null);
  const [renameText, setRenameText] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  /** Session whose messaging-binding dialog is open (null = none). */
  const [messagingSession, setMessagingSession] = useState<SessionInfo | null>(null);

  const confirmRename = async () => {
    if (!renamingSession) return;
    const title = renameText.trim();
    if (!title) return;
    setRenameBusy(true);
    setRenameError(null);
    try {
      const res = await api.patchSession(renamingSession.sessionId, { title });
      replace(res.session);
      setRenamingSession(null);
    } catch (e) {
      setRenameError(apiErrorText(e));
    } finally {
      setRenameBusy(false);
    }
  };

  const confirmDeleteSession = async () => {
    if (!deletingSession) return;
    setDeletingBusy(true);
    const target = deletingSession;
    try {
      await api.deleteSession(target.sessionId);
      // remove() also tombstones the id (see the store's isDeleted), which is what keeps the
      // chat page from re-fetching the Session it is still routed at during the frames before
      // the navigate() below lands. Ordering the two is deliberately NOT the mechanism: the
      // list lives in a zustand store whose updates are not subject to React's transition
      // lanes, so scheduling tricks here cannot be relied on to sequence them.
      remove(target.sessionId);
      // The session is gone, so clear its input draft too (no orphaned keys left in localStorage; keys are scoped per user, #68).
      if (user) clearDraft(sessionDraftKey(user.userId, target.sessionId));
      // Prune its pin and manual-order entry as well (both helpers return the same
      // reference when the id wasn't present — the write is skipped then).
      const prunedPins = removePinnedSession(pinnedSessions, target.sessionId);
      if (prunedPins !== pinnedSessions) {
        setPinnedSessions(prunedPins);
        savePinnedSessions(currentProjectId, prunedPins);
      }
      forgetSession(currentProjectId, target.sessionId);
      const prunedOrder = removeFromSessionOrder(sessionOrder, target.sessionId);
      if (prunedOrder !== sessionOrder) {
        setSessionOrder(prunedOrder);
        saveSessionOrder(currentProjectId, groupMode, prunedOrder);
      }
      setDeletingSession(null);
      // The deleted session was the one open: jump to this Agent's next conversation, otherwise
      // fall back to the chat home page. Auto-opened conversations are never archived (hidden by
      // default — landing there would look like the chat vanished into thin air) and never
      // subagent children (they belong to some other conversation).
      if (activeSessionId === target.sessionId) {
        const rest = (byAgent.get(target.agentId) ?? []).filter((s) => {
          const category = sessionCategory(s);
          return (
            s.sessionId !== target.sessionId && (category === "active" || category === "schedule")
          );
        });
        navigate(rest[0] ? `/chat/${rest[0].sessionId}` : "/chat");
      }
    } catch (e) {
      toastError(apiErrorText(e));
    } finally {
      setDeletingBusy(false);
    }
  };

  /** Confirmed parked-draft deletion: drops the entry; a deleted draft that is open falls back to the plain new-chat page. */
  const confirmDeleteDraft = () => {
    if (!deletingDraft) return;
    if (user && currentProjectId) {
      removeDraftSession(user.userId, currentProjectId, deletingDraft.id);
    }
    if (activeSessionId === deletingDraft.id) navigate(`/chat/${DRAFT_SESSION_ID}`);
    setDeletingDraft(null);
  };

  /** Open the alias editor pre-filled with the current alias ("" = following the basename). */
  const openRenameWorkspace = (path: string, machineId: string | null) => {
    setWorkspaceAliasText(
      registeredWorkspaces.find((e) => e.path === path && (e.machineId ?? null) === machineId)
        ?.alias ?? "",
    );
    setRenamingWorkspace({ path, machineId });
  };

  /** Commit the alias (blank reverts the label to the directory basename). Direct save — no server, nothing destructive. */
  const confirmRenameWorkspace = () => {
    if (!renamingWorkspace) return;
    applyRegistryChange(
      setWorkspaceAlias(
        registeredWorkspaces,
        renamingWorkspace.path,
        renamingWorkspace.machineId,
        workspaceAliasText,
      ),
    );
    setRenamingWorkspace(null);
  };

  /**
   * 删除工作区 (confirmed via the shared ConfirmModal, like every destructive-looking
   * action): drops the sidebar registry entry only — disk and Sessions are never
   * touched, the confirm copy says exactly that, and re-adding restores it. A group
   * that still has Sessions simply persists as session-derived.
   */
  const confirmDeleteWorkspace = () => {
    if (!deletingWorkspace) return;
    applyRegistryChange(
      unregisterWorkspace(
        registeredWorkspaces,
        deletingWorkspace.path,
        deletingWorkspace.machineId,
      ),
    );
    setDeletingWorkspace(null);
  };

  return {
    renamingWorkspace,
    setRenamingWorkspace,
    workspaceAliasText,
    setWorkspaceAliasText,
    deletingWorkspace,
    setDeletingWorkspace,
    deletingSession,
    setDeletingSession,
    deletingBusy,
    deletingDraft,
    setDeletingDraft,
    renamingSession,
    setRenamingSession,
    renameText,
    setRenameText,
    renameBusy,
    renameError,
    setRenameError,
    messagingSession,
    setMessagingSession,
    confirmRename,
    confirmDeleteSession,
    confirmDeleteDraft,
    openRenameWorkspace,
    confirmRenameWorkspace,
    confirmDeleteWorkspace,
  };
}
