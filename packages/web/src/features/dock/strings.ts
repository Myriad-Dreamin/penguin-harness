/**
 * The dock module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `dock` section. A new string is added here, to both fragments, and
 * nowhere else — `DockStrings` makes a key missing from `dockEn` a type error.
 */
export const dockZh = {
  /** The dock header's "+" menu: panels and shells this dock can take a tab for. */
  addTab: "添加面板",
  /** A panel tab's × (its content closes; terminal tabs use terminal.killShell instead). */
  closeTab: "关闭面板",
  /** The dock header's ×: the dock hides, its tabs stay for the next open. */
  hideDock: "收起侧边栏",
  moveToRight: "移到右侧",
  moveToBottom: "移到下方",
  /** Boundary drag handle between a dock and the chat content (double-click resets). */
  resize: "调整面板大小",
  /** The toolbar's two pull-open buttons (aria-expanded carries the open state). */
  rightDock: "右侧栏",
  bottomDock: "下侧栏",
  /** A session-bound panel's body on the draft page, where no Session exists yet. */
  draftEmpty: "发送第一条消息后可用",
  /**
   * The floating launcher on the chat body's right edge while the right dock is hidden.
   * `launcherCaption` is printed under the ball at rest — the same words as the ball's
   * accessible name — gives way to `launcherOpen` while the ball itself is pointed at, and
   * to the pointed-at entry's name while the fan is open.
   */
  launcher: "快捷方式",
  launcherCaption: "快捷方式",
  /** Replaces `launcherCaption` while the pointer or focus is on the ball and no entry is: what the next click does, so the pair swaps with the fan's state. */
  launcherOpen: "打开",
  launcherClose: "关闭",
  /** Appended to the launcher's accessible name while its amber dot shows. */
  launcherPending: "子智能体有待审批",
  /** The fan of entries the launcher opens (its accessible group name). */
  launcherPanels: "快捷方式",
  /** The fan's last entry: puts the launcher away until Appearance settings bring it back. */
  launcherHide: "隐藏悬浮球",
  launcherHiddenToast: "悬浮球已隐藏，可在 设置 › 外观 中重新开启",
  /** Touch-only: the bottom dock's height toggle, standing in for a boundary drag. */
  maximize: "放大到整屏",
  restore: "还原高度",
};

export type DockStrings = typeof dockZh;

export const dockEn: DockStrings = {
  addTab: "Add panel",
  closeTab: "Close panel",
  hideDock: "Hide sidebar",
  moveToRight: "Move to the right",
  moveToBottom: "Move to the bottom",
  resize: "Resize panel",
  rightDock: "Right sidebar",
  bottomDock: "Bottom panel",
  draftEmpty: "Available once the conversation starts",
  launcher: "Shortcuts",
  launcherCaption: "Shortcuts",
  launcherOpen: "Open",
  launcherClose: "Close",
  launcherPending: "a subagent awaits approval",
  launcherPanels: "Shortcuts",
  launcherHide: "Hide launcher",
  launcherHiddenToast: "Launcher hidden — turn it back on in Settings › Appearance",
  maximize: "Fill the screen",
  restore: "Restore the height",
};
