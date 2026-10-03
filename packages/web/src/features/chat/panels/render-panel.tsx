/**
 * The dock's panel bodies beside the conversation on screen: the page hands this to DockPanel as
 * its renderPanel.
 */
import type { ReactNode } from "react";
import { EmptyState } from "@prismshadow/penguin-ui";
import { S } from "../../../lib/strings";
import { WorkspaceBrowser } from "../../workspace";
import { sessionThinkingLevel } from "../../model-picker";
import { TracePanel } from "../../traces/trace-panel";
import { MessagingPanel } from "../../messaging/messaging-panel";
import { SchedulePanel } from "../../schedules/schedule-panel";
import { BuiltinBrowserPanel } from "../../builtin-browser/browser-panel";
import { panelLabel } from "../../dock/panel-meta";
import type { PanelKind } from "../../dock/dock-state";
import { approvalModeChoices } from "../approval-mode";
import { ChatMemoryView } from "../memory-view";
import { SubagentsView } from "../subagents-view";
import type { ChatSessionController } from "../session/use-chat-session";

/**
 * The panel tabs' bodies. Keyed by Session where the view starts over per conversation
 * (agents / memory / trace); the Workspace browser instead re-binds through its props —
 * its own handled-once request guard is what the conversation-switch e2e covers.
 */
export function renderChatPanel(
  session: ChatSessionController,
  kind: PanelKind,
  active: boolean,
): ReactNode {
  const {
    navigate,
    projectId,
    draft,
    draftWorkspace,
    selected,
    stream,
    ctx,
    panelModel,
    models,
    subagentFocus,
    subagentTaskScope,
    fileOpenRequest,
    memoryRequest,
    settledTurnSignal,
    sessionMemoryChanges,
    memoryListing,
    modeSaving,
    turnThinkingLevel,
    agentThinkingLevel,
    onChangeApprovalMode,
    onChangeSandbox,
    addComposerReference,
    prefillComposer,
  } = session;
  // The browser is one set of pages shared by every conversation, not a Session's view,
  // so it needs no Session and works on the draft page too.
  if (kind === "builtin-browser") return <BuiltinBrowserPanel active={active} />;
  // The draft's Files panel browses the folder picked in the composer, addressed by the
  // directory itself; a temporary Workspace has none yet.
  if (!selected && draft && kind === "workspace" && projectId) {
    return draftWorkspace !== null ? (
      <WorkspaceBrowser
        scope={{
          kind: "workspace",
          projectId,
          workspace: draftWorkspace.path,
          machineId: draftWorkspace.machineId,
        }}
        active={active}
        onAddReference={addComposerReference}
      />
    ) : (
      <EmptyState title={panelLabel(kind)} description={S.files.draftTemporary} />
    );
  }
  if (!selected)
    return (
      <EmptyState
        title={panelLabel(kind)}
        // The schedules tab says what the first message unlocks; the other tabs share one line.
        description={kind === "schedules" ? S.schedule.panelDraftEmpty : S.dock.draftEmpty}
      />
    );
  switch (kind) {
    case "agents":
      return (
        <SubagentsView
          key={selected.sessionId}
          session={selected}
          // The merged view (backfilled windows included): a chip on an older turn keeps
          // its historical graph and child conversation reachable after pagination.
          model={panelModel}
          version={stream.version}
          taskRunning={stream.taskState !== "idle"}
          ctx={ctx}
          focusRequest={subagentFocus}
          taskScope={subagentTaskScope}
          subagents={stream.subagents}
          models={models?.models ?? []}
          approvalMode={selected.approvalMode}
          approvalModes={approvalModeChoices(selected.client, selected.approvalMode)}
          onChangeApprovalMode={onChangeApprovalMode}
          onChangeSandbox={onChangeSandbox}
          modeSaving={modeSaving}
          parentThinkingLevel={sessionThinkingLevel(turnThinkingLevel, agentThinkingLevel)}
        />
      );
    case "workspace":
      return (
        <WorkspaceBrowser
          scope={{ kind: "session", sessionId: selected.sessionId }}
          openRequest={fileOpenRequest}
          active={active}
          reloadSignal={settledTurnSignal}
          onAddReference={addComposerReference}
        />
      );
    case "memory":
      return (
        <ChatMemoryView
          key={selected.sessionId}
          session={selected}
          changes={sessionMemoryChanges}
          scopes={memoryListing.scopes}
          listingError={memoryListing.error}
          request={memoryRequest}
          active={active}
          // Management (add / edit / delete) lives on the agent-settings memory tab.
          onOpenSettings={() => navigate(`/agents/${selected.agentId}?tab=memory`)}
        />
      );
    case "trace":
      return (
        <TracePanel
          key={selected.sessionId}
          session={selected}
          active={active}
          reloadSignal={settledTurnSignal}
        />
      );
    case "messaging":
      return (
        <MessagingPanel key={selected.sessionId} sessionId={selected.sessionId} active={active} />
      );
    case "schedules":
      return (
        <SchedulePanel
          key={selected.sessionId}
          session={selected}
          active={active}
          onPrefillComposer={prefillComposer}
        />
      );
  }
}
