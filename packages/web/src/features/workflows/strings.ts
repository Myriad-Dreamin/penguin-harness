/**
 * The workflows module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `workflows` section. A new string is added here, to both fragments, and
 * nowhere else — `WorkflowsStrings` makes a key missing from `workflowsEn` a type error.
 */
export const workflowsZh = {
  tabsLabel: "聊天与工作流",
  chatTab: "聊天",
  brokenMark: "当前文件加载失败",
  reload: "重新加载",
  reloading: "加载中…",
  history: "历史",
  loadError: "加载失败",
  loadingHistory: "加载历史…",
  /** The full-page route while it is still finding out which page it should show. */
  loadingPage: "正在打开页面…",
  noHistory: "还没有记录过版本。",
  current: "当前",
  restore: "恢复",
  remove: "移除",
  fillApp: "占满应用",
  fillAppHint: "让这个页面占满整个应用；Ctrl+P / Ctrl+Shift+P 打开命令面板可退出",
  exitFullPage: "退出全页模式（回到聊天）",
  exitHint: "按 Ctrl+P 或 Ctrl+Shift+P 打开命令面板可回到聊天。",
  noSuchPage: "这个 workflow 不存在或没有页面。",
  removeConfirm: "删除这个工作流及其全部已记录版本？",
  removeYes: "确认移除",
  removing: "移除中…",
  removeNo: "取消",
  fileCount: (n: number) => `${n} 个文件`,
};

export type WorkflowsStrings = typeof workflowsZh;

export const workflowsEn: WorkflowsStrings = {
  tabsLabel: "Chat and workflows",
  chatTab: "Chat",
  brokenMark: "The current files failed to load",
  reload: "Reload",
  reloading: "Reloading…",
  history: "History",
  loadError: "Load error",
  loadingHistory: "Loading history…",
  /** The full-page route while it is still finding out which page it should show. */
  loadingPage: "Opening the page…",
  noHistory: "No versions recorded yet.",
  current: "current",
  restore: "Restore",
  remove: "Remove",
  fillApp: "Fill the app",
  fillAppHint:
    "Show this page as the whole app; Ctrl+P / Ctrl+Shift+P opens the command palette to leave",
  exitFullPage: "Exit full page (back to chat)",
  exitHint: "Press Ctrl+P or Ctrl+Shift+P for the command palette to get back to the chat.",
  noSuchPage: "This workflow does not exist or has no page.",
  removeConfirm: "Delete this workflow and all its recorded versions?",
  removeYes: "Remove",
  removing: "Removing…",
  removeNo: "Keep",
  fileCount: (n: number) => `${n} files`,
};
