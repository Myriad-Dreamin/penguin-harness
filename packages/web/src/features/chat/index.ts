/**
 * The chat module's public entry: everything outside this directory reaches it through here
 * (test/module-boundaries.test.ts fails on an import that goes around it).
 */
export { shortSessionId } from "./agent-topology";
export { type ChatDefaultsChangedDetail, dispatchChatDefaultsChanged } from "./chat-defaults-event";
export { DRAFT_SESSION_ID } from "./chat-page";
export { ChatRoute } from "./chat-route";
export { CodeBlock, CodeSurface } from "./code-block";
export { languageForExtension } from "./code-languages";
export {
  clearDraft,
  clearDraftChatDefaults,
  clearDraftModelRef,
  type DraftCache,
  draftFromUnknown,
  draftKey,
  type DraftStorage,
  loadDraft,
  saveDraft,
  sessionDraftKey,
} from "./draft-cache";
export {
  type DraftSessionEntry,
  draftSessionTitle,
  parkActiveDraft,
  removeDraftSession,
  useDraftSessions,
} from "./draft-sessions";
export { Md, SETTLED_MD_COMPONENTS } from "./md";
export { modelLabel, ModelSelect, PickerList } from "./model-select";
export { prepareNewChatDraft } from "./new-chat";
export { BOOK_ICON, filterSkills, localizedShortText, localizedText } from "./skill-use";
export { createStreamFollow, stickToBottom } from "./stream-follow";
export { SELECTABLE_THINKING_LEVELS, thinkingLevelOptionsFor } from "./thinking-level";
export {
  panelWidth,
  persistPanelWidth,
  resetPanelWidth,
  setPanelWidth,
  usePanelWidthValue,
} from "./use-panel-width";
export { useRuntimeLanguages } from "./use-runtime-languages";
export { WorkspaceSelect } from "./workspace-select";
