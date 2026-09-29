/**
 * The palette module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `commandPalette` section. A new string is added here, to both fragments, and
 * nowhere else — `CommandPaletteStrings` makes a key missing from `commandPaletteEn` a type error.
 */
export const commandPaletteZh = {
  title: "命令面板",
  placeholder: "输入以筛选命令…",
  noResults: "没有匹配的命令",
  hint: "Ctrl+P / Ctrl+Shift+P（⌘P）切换 · ↑↓ 选择 · Enter 执行",
  harnessHistory: "Harness 历史",
  /** The desktop shell's native actions, offered here because its menu bar stays hidden. */
  installCli: "安装 penguin 命令…",
  checkUpdates: "检查桌面版更新…",
  checkingUpdates: "正在检查更新…",
  openDevTools: "打开开发者工具",
  projectOnGitHub: "在 GitHub 上查看项目",
};

export type CommandPaletteStrings = typeof commandPaletteZh;

export const commandPaletteEn: CommandPaletteStrings = {
  title: "Command Palette",
  placeholder: "Type to filter commands…",
  noResults: "No matching commands",
  hint: "Ctrl+P / Ctrl+Shift+P (⌘P) to toggle · ↑↓ to select · Enter to run",
  harnessHistory: "Harness history",
  installCli: "Install 'penguin' command…",
  checkUpdates: "Check for desktop updates…",
  checkingUpdates: "Checking for updates…",
  openDevTools: "Open DevTools",
  projectOnGitHub: "Project on GitHub",
};
