/**
 * Chat page:
 * a thin top toolbar (Session title / status / iconized stats / panel switcher / details
 * popup) + the message stream and input area (input box vertically centered when there
 * are no messages), with the dock surfaces beside and below (features/dock): every side
 * element — subagents, Workspace files, Memory, Trace, terminals — is a tab in the right
 * or bottom dock, arranged by the user and persisted globally. This page contributes the
 * panel BODIES (they need its session/stream state) through DockPanel's renderPanel, and
 * the stream's jump commands: a message file card, or a reply's link to a Workspace file,
 * opens the Workspace tab on that file (onOpenFile), a subagent chip opens the agents tab
 * focused (onOpenSubagent), a memory-change row opens the Memory tab located
 * (onLocateMemoryChange).
 * Approval mode and Model/context usage live in the input area's toolbar; context is compacted
 * via the /compact slash command.
 * Draft state (/chat/new) is carried by DraftView: Agent / Workspace / approval mode / Model are
 * chosen before sending, and everything except approval mode is locked once the Session is
 * created. The Session list and the new-chat entry point live in the global sidebar.
 */
import type { ReactNode } from "react";
import { Skeleton } from "@prismshadow/penguin-ui";
import { WorkflowFrame, WorkflowTabStrip } from "../workflows/workflow-tabs";
import { DockPanel } from "../dock/dock-panel";
import { useDockMount } from "../dock/use-dock-mount";
import { closedDockView, dockViews, type PanelKind } from "../dock/dock-state";
import { terminalApiSupported } from "../terminal/terminal-list";
import { useChatSession } from "./session/use-chat-session";
import { SessionDialogs } from "./session/session-dialogs";
import { ChatToolbar } from "./toolbar/chat-toolbar";
import { liveHeaderStats } from "./toolbar/session-stats";
import { SessionDetails } from "./toolbar/session-details";
import { ProcessList } from "./toolbar/process-list";
import { ChatBody } from "./body/chat-body";
import { renderChatPanel } from "./panels/render-panel";

export function ChatPage() {
  const chat = useChatSession();
  const {
    projectId,
    agentId,
    agents,
    currency,
    selected,
    stream,
    workflowTabs,
    outline,
    railFit,
    streamScrollRef,
    anySubagentPending,
    infoOpen,
    setInfoOpen,
    machineNameOf,
    usageBuckets,
    processes,
    procBusy,
    exitedIds,
    onKillProcess,
    onRemoveProcess,
    onClearExitedProcesses,
  } = chat;

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
  const renderPanel = (kind: PanelKind, active: boolean): ReactNode =>
    renderChatPanel(chat, kind, active);

  if (!projectId || !agentId) {
    return (
      <div className="p-6">
        <Skeleton className="h-6 w-64" />
      </div>
    );
  }

  const hs = liveHeaderStats(chat);
  return (
    // data-dock-host: the docks' edge bands, drop preview and the bottom dock's height
    // ratio all measure this column (dock-drag.tsx / dock-panel.tsx).
    // bg-canvas: the chat column is the page, so it takes the theme's page colour — white and
    // gray-950 in Primer, exactly what it painted before; paper in Console, the sheet in Frost —
    // and the transcript's sticky rows, painted in the same token, sit on it without a seam.
    <div data-dock-host className="relative flex h-full flex-col bg-canvas">
      {/* Workflow tabs: the Agent's own pages beside the chat. A workflow tab covers the
          chat (which stays mounted, so its state survives a look at the page) below the
          strip; the strip is absent when the Agent has no workflow with a UI. */}
      <WorkflowTabStrip
        tabs={workflowTabs.tabs}
        notices={workflowTabs.notices}
        active={workflowTabs.active}
        onSelect={workflowTabs.setActive}
      />
      {workflowTabs.activeTab !== null && projectId !== null && agentId !== null && (
        <div className="absolute inset-x-0 bottom-0 top-9 z-10">
          <WorkflowFrame
            // Per tab: the frame keeps this workflow's history fold, its error and its
            // armed Remove, and none of that belongs to the next tab.
            key={workflowTabs.activeTab.tabId}
            projectId={projectId}
            agentId={selected?.agentId ?? agentId}
            tab={workflowTabs.activeTab}
            onChanged={() => void workflowTabs.refresh()}
            onRemoved={() => {
              workflowTabs.setActive(null);
              void workflowTabs.refresh();
            }}
          />
        </div>
      )}
      {/* Thin top toolbar */}
      {selected && (
        <ChatToolbar
          selected={selected}
          taskState={stream.taskState}
          agentsPending={anySubagentPending}
          railShown={railFit.shown}
          outline={outline}
          outlineOffset={stream.outlineOffset}
          streamScrollRef={streamScrollRef}
          infoOpen={infoOpen}
          setInfoOpen={setInfoOpen}
          hs={hs}
          currency={currency}
        >
          <SessionDetails
            selected={selected}
            agents={agents}
            machineName={machineNameOf(selected.sessionId)}
            hs={hs}
            usageBuckets={usageBuckets}
          >
            <ProcessList
              processes={processes}
              procBusy={procBusy}
              exitedIds={exitedIds}
              onKillProcess={onKillProcess}
              onRemoveProcess={onRemoveProcess}
              onClearExitedProcesses={onClearExitedProcesses}
            />
          </SessionDetails>
        </ChatToolbar>
      )}

      {/* Body: chat column + the right dock on this row (below the toolbar — a dock
          beside the whole page would squeeze the header), with the bottom dock after the
          row spanning the full page width. data-dock-row is what the drag preview
          measures for a right landing. */}
      <div data-dock-row className="flex min-h-0 flex-1">
        {/* The chat area, and the only region a dragged file may be dropped on (#311): it
            covers the conversation and the composer in both branches below, and nothing else
            — the sidebar, the mobile top bar, the toolbar above and the docked panels beside
            it (terminal panes included) are all outside, where a file drop is inert (see
            drop-zone.tsx). `relative` bounds the drop overlay to this column. */}
        <ChatBody session={chat} projectId={projectId} />

        {rightMount.view && (
          <DockPanel
            view={rightMount.view}
            open={rightMount.open}
            animateEntrance={rightMount.animateEntrance}
            renderPanel={renderPanel}
            panelBadges={{ agents: anySubagentPending }}
            terminalSupported={terminalSupported}
          />
        )}
      </div>

      {bottomMount.view && (
        <DockPanel
          view={bottomMount.view}
          open={bottomMount.open}
          animateEntrance={bottomMount.animateEntrance}
          renderPanel={renderPanel}
          panelBadges={{ agents: anySubagentPending }}
          terminalSupported={terminalSupported}
        />
      )}

      <SessionDialogs session={chat} />
    </div>
  );
}
