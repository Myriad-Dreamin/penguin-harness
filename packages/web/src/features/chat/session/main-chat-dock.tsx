import { useCallback } from "react";
import { sessionThinkingLevel } from "../../model-picker";
import { useDockMount, closedDockView, dockViews } from "../../dock";
import type { ChatDockState } from "./main-dock-context";
import { terminalApiSupported } from "../../terminal";
import type { useMainChatActions } from "./main-chat-actions";

/** Exact consecutive main ChatPage statements 164..169; called once, in original order. */
export function useMainChatDock(scope: ReturnType<typeof useMainChatActions>) {
  const {
    navigate,
    projectId,
    modeSaving,
    models,
    fileOpenRequest,
    memoryRequest,
    subagentFocus,
    subagentTaskScope,
    draft,
    draftWorkspace,
    selected,
    stream,
    panelModel,
    sessionMemoryChanges,
    memoryListing,
    turnThinkingLevel,
    agentThinkingLevel,
    settledTurnSignal,
    prefillComposer,
    addComposerReference,
    onChangePermission,
    ctx,
  } = scope;

  // The docks to render: right beside the chat row, bottom below it (the narrow merged
  // view arrives as a bottom view). They render on the draft page too — the arrangement is
  // the user's workbench, and a terminal opened while drafting must be visible — with the
  // session-bound panels showing a placeholder until the first send creates the Session.
  // useDockMount keeps a closing dock mounted through its collapse transition and then
  // holds it at zero size on closedDockView, so hiding a dock costs none of what its panels
  // hold; it skips the animation for instant changes (scope switches, cross-dock moves).
  // Narrow: the merged view is a bottom view, and the closed one goes to the same mount.
  const views = dockViews();
  const rightMount = useDockMount(
    views.find((view) => view.position === "right") ?? null,
    closedDockView("right"),
  );
  const bottomMount = useDockMount(
    views.find((view) => view.position === "bottom") ?? null,
    closedDockView("bottom"),
  );
  const terminalSupported = terminalApiSupported();

  // The Memory panel's way to its management: add / edit / delete live on the Agent's
  // settings page, on the memory tab.
  const openMemorySettings = useCallback(
    (memoryAgentId: string) => navigate(`/agents/${memoryAgentId}?tab=memory`),
    [navigate],
  );
  /**
   * What the dock panel bodies read off this page (builtin-dock-panels.tsx), provided around
   * both docks below. Not memoised: `ctx` is rebuilt on every render and the stream fields
   * move with every version, so a memo would miss every time; the bodies re-render with the
   * page, exactly as they did when the page built them inline. The callbacks in it are the
   * page's own memoised ones, passed as they are, never wrapped afresh.
   */
  const chatDock: ChatDockState = {
    selected,
    draft,
    draftWorkspace,
    projectId,
    panelModel,
    stream,
    ctx,
    subagentFocus,
    subagentTaskScope,
    models,
    onChangePermission,
    modeSaving,
    parentThinkingLevel: sessionThinkingLevel(turnThinkingLevel, agentThinkingLevel),
    fileOpenRequest,
    settledTurnSignal,
    addComposerReference,
    sessionMemoryChanges,
    memoryListing,
    memoryRequest,
    openMemorySettings,
    prefillComposer,
  };
  return {
    ...scope,
    views,
    rightMount,
    bottomMount,
    terminalSupported,
    openMemorySettings,
    chatDock,
  };
}
