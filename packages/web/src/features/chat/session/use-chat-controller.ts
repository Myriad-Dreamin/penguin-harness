/**
 * The chat page's controller: from the route to the conversation on screen — selection, the
 * direct lookup and auto-select, the stream and the composer's draft, usage and background
 * processes, sending and handoffs, the model and thinking-level switches — and the dock panels'
 * jump commands. The toolbar, the body, the dialogs and the panel bodies read what it returns.
 *
 * The sub-hooks are consecutive stretches of what was one component, called in that component's
 * order: effects that depend on one another (the session-switch reset before the usage fetch
 * and the process poll, the settled-turn reloads before the read marker) still run in sequence.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ModelRefDto, SessionProcessInfo } from "@prismshadow/penguin-server/api";
import { S } from "../../../lib/strings";
import { useDocumentTitle } from "../../../lib/use-document-title";
import { machineForSession } from "../../../lib/session-machines";
import { isOrgSession } from "../../../lib/session-grouping";
import { conversationMode } from "../../company/company-nav";
import { useCompany } from "../../company";
import { promotedPricing, sameModelRef } from "../../models/model-grouping";
import type { StagedThinkingSwitch } from "../../model-picker";
import { useWorkflowTabs } from "../../workflows/workflow-tabs";
// importing it also registers the global Ctrl+` hotkey with the app bundle
import { setDockCwd } from "../../dock/dock-terminal";
import { dockVersion, isTabShown, openPanel, subscribeDock } from "../../dock/dock-state";
import { subscribeTerminals, terminalApiSupported } from "../../terminal";
import { latestTaskHasSubagent, taskStartCount } from "../agent-topology";
import { advancePanelTaskScope, createPanelTaskScope } from "../panel-task-scope";
import type { SwitchContextShape } from "../model-switch";
import { useSessionDraft } from "../use-session-draft";
import { useSessionStream } from "../use-session-stream";
import { useChatInputs } from "./use-chat-inputs";
import { usePanelRequests } from "./use-panel-requests";
import { useRoutedSession } from "./use-routed-session";
import { useTranscript } from "./use-transcript";
import { useAgentConfig } from "./use-agent-config";
import { useSessionLifecycle } from "./use-session-lifecycle";
import { useSessionUsage } from "./use-session-usage";
import { useSessionProcesses } from "./use-session-processes";
import { useProjectModels } from "./use-project-models";
import { useSessionSends } from "./use-session-sends";
import { useSessionControls } from "./use-session-controls";
import { useModelSwitches } from "./use-model-switches";
import { streamRenderContext } from "./stream-context";

export function useChatController() {
  const inputs = useChatInputs();
  const {
    navigate,
    location,
    routeSessionId,
    projectId,
    agentId,
    agents,
    setCurrentAgentId,
    reloadSessions,
    setTitle,
  } = inputs;
  const company = useCompany();

  const [infoOpen, setInfoOpen] = useState(false);
  // Background processes the conversation started (the details popover list), refreshed by
  // the polling effect in useSessionProcesses.
  const [processes, setProcesses] = useState<SessionProcessInfo[]>([]);
  // A mid-chat thinking-level pick staged behind the confirm dialog (issue #310): some
  // providers key their prompt PREFIX on the thinking level, so switching with history in
  // place invalidates the provider's prefix cache and the next request re-bills the whole
  // history as uncached input. The pick is only applied on an explicit choice; null = no
  // dialog, "ask" = dialog open, "compacting" = the user chose "compact, then switch" and
  // the pick is held until the compaction completes. Logic in thinking-level.ts
  // (needsThinkingSwitchConfirm / thinkingSwitchAfterCompaction).
  const [thinkingSwitch, setThinkingSwitch] = useState<StagedThinkingSwitch | null>(null);
  // A pick in the session toolbar's model picker, waiting on its confirm dialog (null = no
  // dialog). `shape` is what the switch will do to the context — compact it first, switch an
  // empty conversation at once, or continue from a summary already held — so the dialog and
  // the toast promise only that. See onPickSessionModel / confirmModelSwitch.
  const [modelSwitchAsk, setModelSwitchAsk] = useState<{
    to: ModelRefDto;
    shape: SwitchContextShape;
  } | null>(null);

  // The docks' arrangement lives in the dock store (features/dock) — tabs, active tab,
  // sizes, all global and persisted. This page re-renders on any dock change and owns only
  // the stream-driven JUMP COMMANDS the panel bodies consume: each is a fresh object per
  // call (identity-compared, so repeating the same jump still re-triggers the view's
  // effect), and each resets on a Session switch because it pointed into the old session's
  // stream. The tabs themselves deliberately survive the switch — the panels re-bind to
  // the conversation on screen.
  useSyncExternalStore(subscribeDock, dockVersion);
  useSyncExternalStore(subscribeTerminals, terminalApiSupported);
  const requests = usePanelRequests(routeSessionId);
  const route = useRoutedSession(inputs);
  const { draft, selected } = route;
  // Entering a conversation is a choice of mode, as entering an organization route is
  // (features/company/org-layout.tsx): the new-chat draft and the user's own conversations are
  // development mode's, so the switch and the sidebar follow whichever way the page was reached
  // — a typed URL, the tray's New Session, a link. Once per route, like the organization
  // routes: the switch's own move to company mode leaves this page, and re-claiming on a mode
  // change would undo the click before it does. A desk or ticket Session claims nothing.
  const { available: companyAvailable, setWorkMode } = company;
  const claimedMode = conversationMode(draft, selected === null ? null : isOrgSession(selected));
  const claimedRoute = useRef<string | null>(null);
  useEffect(() => {
    if (routeSessionId === null || claimedMode === null) return;
    if (claimedRoute.current === routeSessionId) return;
    claimedRoute.current = routeSessionId;
    if (companyAvailable) setWorkMode(claimedMode);
  }, [routeSessionId, claimedMode, companyAvailable, setWorkMode]);
  /**
   * The Agent this page renders under: the routed Session's own, else the current Agent (a
   * draft has no Session). The current Agent is resolved against THIS server's Agent list and
   * is adopted from the Session only when that list carries it — an organization's employee
   * whose Agent lives on a machine is never in it, so going by the current Agent alone left
   * that conversation on the placeholder for good, with nothing to say why.
   */
  const pageAgentId = selected?.agentId ?? agentId;
  // The tabs beside a conversation are its OWN Agent's, asked of the server that Agent's
  // workflows live on: a Session on a machine runs a copy of the Agent there, and the workflows
  // it built are in that copy. The current Agent is always one of this server's, so going by
  // it listed the wrong Agent's workflows (or none) for every Session on a machine.
  const workflowTabs = useWorkflowTabs(
    projectId,
    pageAgentId,
    selected === null ? null : machineForSession(selected.sessionId),
  );
  // `?file=<Workspace path>` on arrival — a proposal's scope row, a link from another page —
  // brings the Files tab up on that file, once; the parameter is consumed so a reload does
  // not reopen it and the history keeps a clean conversation URL.
  const { openWorkspaceFile } = requests;
  useEffect(() => {
    if (selected === null) return;
    const query = new URLSearchParams(location.search);
    const file = query.get("file");
    if (file === null || file === "") return;
    openWorkspaceFile(file);
    query.delete("file");
    const search = query.toString();
    navigate(
      { pathname: location.pathname, search: search === "" ? "" : `?${search}` },
      { replace: true },
    );
  }, [selected?.sessionId, location.pathname, location.search, navigate, openWorkspaceFile]);
  // New shells start in this conversation's Workspace — its files are what a terminal
  // opened here is for. While drafting, the Workspace is the one picked in the draft and
  // DraftView publishes it instead (a child effect runs before this one, so this must
  // yield rather than clobber it with null). Leaving the chat for another page keeps the
  // last conversation's Workspace: it is a better default than home for the hotkey,
  // which stays live everywhere. With the machine that Workspace is on: the path only means
  // anything on its own filesystem, and a shell for this conversation belongs beside the
  // agent running it.
  useEffect(() => {
    if (draft) return;
    setDockCwd(
      selected?.workspace ?? null,
      selected === null ? null : machineForSession(selected.sessionId),
    );
  }, [draft, selected]);

  // Currently effective model (session state, the model reference comes from the Session DTO): model selection in draft state is handled internally by DraftView.
  const activeModelRef = selected
    ? { provider: selected.provider, modelId: selected.modelId }
    : null;

  // Tab title follows the current Session (refreshes in sync once the auto-generated title arrives).
  useDocumentTitle(selected ? (selected.title ?? S.chat.defaultSessionTitle) : S.nav.chat);

  const stream = useSessionStream(
    selected?.sessionId ?? null,
    selected?.status ?? "idle",
    setTitle,
    // Sub-session registration notice (session_created is pushed over the parent session's channel): reload the list so it appears immediately.
    () => void reloadSessions(),
  );

  // Chat input area draft: caches text, both staged switch chips (`/agent` target, `/model`
  // target) and the selected skills keyed by sessionId; restored after navigating away and back
  // or a refresh, discarded on successful send.
  const {
    initial: sessionDraft,
    onTextChange: onDraftTextChange,
    onHandoffTargetChange: onDraftHandoffChange,
    onPendingModelChange: onDraftPendingModelChange,
    onSkillsChange: onDraftSkillsChange,
    discard: discardSessionDraft,
  } = useSessionDraft(selected?.sessionId ?? null);

  const transcript = useTranscript(stream, routeSessionId, projectId, selected);

  // Current Agent follows the Session in the route (keeps the sidebar and stats aligned on deep
  // links / refresh). Only aligns when **the selected Session changes** — never put agentId in
  // the dependency array: otherwise, when switching from a "running session" to a new chat with
  // a different Agent, navigate and setCurrentAgentId aren't in the same batch — a transitional
  // render of "new agentId + old route (old session still selected)" would appear first, and
  // this effect would then flip the Agent back to the old session's Agent based on that,
  // causing the new chat to end up created on the old Agent.
  const selectedSessionId = selected?.sessionId ?? null;
  const selectedAgentId = selected?.agentId ?? null;
  // The thinking level pinned on THIS Session, read straight off the Session row
  // (SessionInfo.thinkingLevel, written by the picker through PATCH — see
  // applyTurnThinkingLevel): "" = never pinned, and the picker then displays the Agent
  // config's level (auto-follow — each model context reads the config, so Agent-config edits
  // keep taking effect). A pin is DURABLE: it survives a reload, shows up in a second tab,
  // and core applies it from the Session's next LLM request on (soft-limited — the picker's
  // menu advises compacting first, since the change invalidates the model's cached
  // context). It is still never written through to the Agent config (that stays draft-only).
  const turnThinkingLevel = selected?.thinkingLevel ?? "";
  // The Agent list may not carry this Session's Agent yet (an Agent an organization created
  // moments ago): the probe below reloads the list, and this effect re-runs once it lands.
  const selectedAgentKnown =
    selectedAgentId !== null && agents.some((a) => a.agentId === selectedAgentId);
  useEffect(() => {
    if (selectedSessionId && selectedAgentId && selectedAgentKnown)
      setCurrentAgentId(selectedAgentId);
    else if (selectedSessionId && selectedAgentId)
      console.warn(
        `[chat] the Agent ${selectedAgentId} of ${selectedSessionId} is not in this server's Agent list; the conversation renders under the Session's own Agent id`,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId, selectedAgentId, selectedAgentKnown, setCurrentAgentId]);

  // Agents tab AUTO-OPEN (the one automatic tab action): the pure tracker
  // (advancePanelTaskScope, unit-tested) brings the agents tab to the front on the CURRENT
  // task's first live spawn, re-armed at every task boundary so a manual close is respected
  // until the next one. It never re-triggers an already-shown tab (that would yank a pinned
  // historical graph back to the latest Task); the tracker consumes the attempt regardless.
  const panelTaskScopeRef = useRef(createPanelTaskScope());
  // Deliberately the LIVE model's items only (never the backfilled prefix): the tracker
  // reads an INCREASE as "the user started a new Task", and a scroll-up backfill growing
  // the count would spuriously re-arm the auto-open mid-conversation. The latest Task
  // always lives in the live tail window, so live-only loses nothing.
  const taskCount = taskStartCount(stream.model.items);
  const liveSpawn = stream.taskState !== "idle" && latestTaskHasSubagent(stream.model);
  useEffect(() => {
    const action = advancePanelTaskScope(panelTaskScopeRef.current, {
      sessionId: selectedSessionId,
      taskCount,
      liveSpawn,
    });
    if (action === "autoOpen" && !isTabShown("agents")) openPanel("agents");
    // The tracker only acts on real transitions of these three observed values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId, taskCount, liveSpawn]);

  const agentConfig = useAgentConfig(projectId, selectedAgentId);
  const lifecycle = useSessionLifecycle({
    ...inputs,
    ...route,
    selectedSessionId,
    stream,
  });
  const usage = useSessionUsage({
    routeSessionId,
    projectId,
    selected,
    stream,
    infoOpen,
    setThinkingSwitch,
    setModelSwitchAsk,
    setProcesses,
  });
  const processList = useSessionProcesses({
    selected,
    selectedSessionId,
    stream,
    infoOpen,
    processes,
    setProcesses,
  });
  const { models, credentialGuide, setCredentialGuide } = useProjectModels(projectId);
  const sends = useSessionSends({
    ...inputs,
    selected,
    turnThinkingLevel,
    models,
    discardSessionDraft,
  });
  const controls = useSessionControls({ ...inputs, ...route, stream });
  const switches = useModelSwitches({
    selected,
    stream,
    models,
    turnThinkingLevel,
    agentThinkingLevel: agentConfig.agentThinkingLevel,
    thinkingSwitch,
    setThinkingSwitch,
    modelSwitchAsk,
    setModelSwitchAsk,
    syncHealedSessionId: sends.syncHealedSessionId,
    applySessionRow: controls.applySessionRow,
    applyTurnThinkingLevel: controls.applyTurnThinkingLevel,
  });

  // Real-time cost for a turn: converts the Task's bucketed usage using a Model's (paired
  // reference) current pricing; null if no pricing is configured. That pricing is the list
  // price, so a promotion the models response reports for the Model comes off it here, as it
  // does on the recorded cost. A Task is priced on the model it ran on when its row names one
  // (a Session can switch models between Tasks), else on the Session's own.
  const pricingOf = (ref: ModelRefDto | null) => {
    const m = models?.models.find((x) => sameModelRef(x, ref));
    return promotedPricing(m?.pricing, m?.discount);
  };
  const modelPricing = pricingOf(activeModelRef);
  const ctx = streamRenderContext({
    stream,
    selected,
    onApprove: controls.onApprove,
    onSendToBackground: controls.onSendToBackground,
    pricingOf,
    modelPricing,
    onStop: sends.onStop,
    openWorkspaceFile: requests.openWorkspaceFile,
    setSubagentTaskScope: requests.setSubagentTaskScope,
    setSubagentFocus: requests.setSubagentFocus,
    setMemoryRequest: requests.setMemoryRequest,
    deletedMemoryKeys: transcript.deletedMemoryKeys,
    statFiles: usage.statFiles,
    onFork: sends.onFork,
    a2uiActions: controls.a2uiActions,
  });

  // Any pending approval sitting inside a subagent (approvalKey = "originChain toolCallId";
  // main-session keys start with a space): surfaces an amber dot on the toolbar button so a
  // nested approval stays discoverable while the panel is closed.
  const anySubagentPending = [...stream.pendingApprovals.keys()].some((k) => !k.startsWith(" "));

  return {
    ...inputs,
    ...requests,
    ...route,
    ...transcript,
    ...agentConfig,
    ...lifecycle,
    ...usage,
    ...processList,
    ...sends,
    ...controls,
    ...switches,
    infoOpen,
    setInfoOpen,
    processes,
    thinkingSwitch,
    setThinkingSwitch,
    modelSwitchAsk,
    setModelSwitchAsk,
    pageAgentId,
    workflowTabs,
    activeModelRef,
    stream,
    sessionDraft,
    onDraftTextChange,
    onDraftHandoffChange,
    onDraftPendingModelChange,
    onDraftSkillsChange,
    selectedSessionId,
    turnThinkingLevel,
    models,
    credentialGuide,
    setCredentialGuide,
    modelPricing,
    ctx,
    anySubagentPending,
  };
}

export type ChatController = ReturnType<typeof useChatController>;
