/**
 * The plugins module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `plugins` section. A new string is added here, to both fragments, and
 * nowhere else — `PluginsStrings` makes a key missing from `pluginsEn` a type error.
 */
export const pluginsZh = {
  installedTitle: "已安装的插件",
  installedDesc:
    "当前 Project 要求的插件，以及其中哪些正在被本进程运行。服务器能自行重组时，改动无需重启即可生效；重组会中止所有 Project 正在进行的 Agent 运行。",
  installedEmpty: "还没有安装任何插件。",
  stateActive: "运行中",
  builtin: "内置",
  builtinHint: "随本次构建自带：安装它不需要下载，但仍需你点安装才会加载。",
  installedRestart: "待重启",
  stateFailed: "加载失败",
  replacesLabel: "替换",
  restartPending: "有已列出但未运行的插件，且本服务器无法免重启应用：重启服务器后加载。",
  uninstall: "移除",
  install: "安装",
  installing: "安装中…",
  /** The Project-level install: the plugin is listed, and running unless the row says otherwise. */
  deploymentInstalledToast: (name: string) => `已安装 ${name}`,
  /** Listed, but the process could not load it: the reason, not a success. */
  deploymentFailedToast: (name: string, reason: string) => `${name} 加载失败：${reason}`,
  applyConfirmInstall: (name: string) => `安装 ${name}？`,
  applyConfirmRemove: (name: string) => `移除 ${name}？`,
  applyConfirmBody: "所有 Project 中正在进行的 Agent 运行都会被中止。",
  pageTitle: "插件",
  /** The header's machine picker: which machine's plugins the page shows and edits. */
  viewMachine: "机器",
  allMachines: "所有机器",
  thisServer: "本机",
  /** A row listed for some machines only, by alias. */
  onlyOn: (names: string) => `仅在 ${names}`,
  /** An all-machines row listed only for other machines. */
  notHere: "本机不运行",
  /** A row the Project lists for a machine that has not reported it running yet. */
  notSynced: "尚未同步到该机器",
  /** Remove is unavailable in a machine's view for a plugin the shared table lists. */
  sharedCannotRemove: "已对所有机器启用：请在「所有机器」视图中移除。",
  machineUnreadable: (name: string, reason: string) => `无法读取 ${name} 运行的插件：${reason}`,
  /** Header icon button opening the Settings dialog on its Plugins page (admin only). */
  openSettings: "插件设置",
  pageDesc:
    "所有插件在一个列表里。插件库里的随本次构建自带（技能和／或钩子包——快捷调用，或安装到 Agent）；当前 Project 要求的模块插件在服务端运行，市场里其余的可以为它安装。",
  /** The list's header: how many plugins are installed — the library's (shipped, every Agent may use them) plus the module plugins this Project lists. */
  installedSection: (n: number): string => `已安装的插件 (${n})`,
  /** The second list: registry entries this Project does not ask for yet. */
  availableSection: (n: number): string => `可安装 (${n})`,
  notInstalled: "未安装",
  /** The filter column beside the lists, and the empty result. */
  filterCategories: "分类",
  filterKind: "包含",
  filterState: "状态",
  filterClear: "清除筛选",
  kindLabel: { skills: "技能", hooks: "钩子", modules: "模块" },
  stateLabel: {
    installed: "已安装",
    available: "可安装",
    running: "运行中",
    restart: "待重启",
    failed: "加载失败",
  },
  noMatch: "没有匹配的插件。",
  /** The description of a shipped package the registry has no entry for. */
  shippedNoEntry: "随本次构建自带；市场里还没有它的条目。",
  /** The "built in" tag on a library plugin: it ships with the build and needs no download. */
  libraryBuiltinHint: "随本次构建自带；安装到 Agent 即可在那里使用。",
  /** Plugin count in the group header (small text to the right of the category name). */
  pluginCount: (n: number): string => `${n} 个插件`,
  /** Search box of the create dialog's plugin picker. */
  searchPlaceholder: "搜索插件",
  /** Usage count in the card metadata (shows "unused" instead of a bare 0). */
  /** Section labels of the plugin detail Modal. */
  detailSkills: "技能",
  detailHooks: "钩子",
  usedByAgents: (n: number): string => (n === 0 ? "未被使用" : `${n} 个 Agent 在用`),
  /** Title on a disabled quick-start button: it pre-selects one of the plugin's skills on the currently selected Agent, so the plugin has to be installed there first. */
  /** Quick start's tooltip: what pressing it does, and what it does not. */
  quickStartHint: "快速开始：打开一份带该插件演示的草稿——点发送之前什么都不会运行",
  quickStartInstallTitle: (plugin: string, agent: string) =>
    `先把 ${plugin} 安装到 ${agent} 再快速开始？`,
  quickStartAfterInstall: "随后打开一份带演示的草稿；点发送之前什么都不会运行。",
  quickStartNotRunning: "插件运行后才能快速开始——它正在等待重启，或加载失败",
  quickStartNeedsAdmin: "模块插件由管理员安装；运行后才能快速开始",
  /** The demo of a module plugin that declares none. */
  quickStartGenericText: (specifier: string) =>
    `演示一下 ${specifier} 插件能做什么：在当前工作区里拿个小东西用一用，并告诉我它带来了什么变化。`,
  /** Top toast shown on successful install / uninstall. */
  installedToast: (plugin: string, agent: string): string => `已将 ${plugin} 安装到 ${agent}`,
  uninstalledToast: (plugin: string, agent: string): string => `已从 ${agent} 卸载 ${plugin}`,
  updateOutdated: (n: number): string => `有新版本：更新 ${n} 个 Agent 的安装`,
  updateConfirmTitle: (name: string): string => `更新 ${name}`,
  updateConfirmWarning: (name: string): string =>
    `更新 ${name} 会把库内当前副本重装到各 Agent，覆盖其已安装的技能与钩子文件——本地改动会丢失，如有需要请先导出备份。`,
  updatedToast: (plugin: string, n: number): string =>
    `已将 ${plugin} 更新到最新版（${n} 个 Agent）`,
  /** Uninstall confirmation: removing the installed copy deletes its files (local edits included). */
  uninstallConfirmTitle: (name: string): string => `卸载 ${name}`,
  uninstallConfirmBody: (plugin: string, agent: string): string =>
    `确定从 ${agent} 卸载 ${plugin} 吗？其已安装的技能与钩子文件（含本地改动）将被删除。`,
};

export type PluginsStrings = typeof pluginsZh;

export const pluginsEn: PluginsStrings = {
  installedTitle: "Installed plugins",
  installedDesc:
    "What this Project asks for, and which of those this process is running. A change applies without a restart where the server can re-assemble itself; re-assembling stops the agent runs in progress in every Project.",
  installedEmpty: "No plugins installed yet.",
  stateActive: "running",
  builtin: "built in",
  builtinHint:
    "Ships with this build: installing it downloads nothing, and it loads only once you install it.",
  installedRestart: "restart to load",
  stateFailed: "failed to load",
  replacesLabel: "replaces",
  restartPending:
    "A listed plugin is not running and this server could not apply it without a restart: restart the server to load it.",
  uninstall: "Remove",
  install: "Install",
  installing: "Installing…",
  /** The Project-level install: the plugin is listed, and running unless the row says otherwise. */
  deploymentInstalledToast: (name: string) => `Installed ${name}`,
  /** Listed, but the process could not load it: the reason, not a success. */
  deploymentFailedToast: (name: string, reason: string) => `${name} failed to load: ${reason}`,
  applyConfirmInstall: (name: string) => `Install ${name}?`,
  applyConfirmRemove: (name: string) => `Remove ${name}?`,
  applyConfirmBody: "Agent runs in progress in every Project will be stopped.",
  pageTitle: "Plugins",
  /** The header's machine picker: which machine's plugins the page shows and edits. */
  viewMachine: "Machine",
  allMachines: "All machines",
  thisServer: "This server",
  /** A row listed for some machines only, by alias. */
  onlyOn: (names: string) => `only on ${names}`,
  /** An all-machines row listed only for other machines. */
  notHere: "not on this server",
  /** A row the Project lists for a machine that has not reported it running yet. */
  notSynced: "not on that machine yet",
  /** Remove is unavailable in a machine's view for a plugin the shared table lists. */
  sharedCannotRemove: "Enabled on all machines: remove it in the All machines view.",
  machineUnreadable: (name: string, reason: string) =>
    `Could not read what ${name} runs: ${reason}`,
  /** Header icon button opening the Settings dialog on its Plugins page (admin only). */
  openSettings: "Plugin settings",
  pageDesc:
    "Every plugin in one list. The library's plugins ship with this build (skills and/or a hook package — quick-start a chat, or install to agents); the module plugins this Project asks for run in the server, and the rest of the registry can be installed for it.",
  /** The list's header: how many plugins are installed — the library's (shipped, every Agent may use them) plus the module plugins this Project lists. */
  installedSection: (n: number): string => `Installed plugins (${n})`,
  /** The second list: registry entries this Project does not ask for yet. */
  availableSection: (n: number): string => `Available (${n})`,
  notInstalled: "not installed",
  /** The filter column beside the lists, and the empty result. */
  filterCategories: "Categories",
  filterKind: "Contains",
  filterState: "Status",
  filterClear: "Clear filters",
  kindLabel: { skills: "Skills", hooks: "Hooks", modules: "Modules" },
  stateLabel: {
    installed: "Installed",
    available: "Available",
    running: "Running",
    restart: "Restart to load",
    failed: "Failed to load",
  },
  noMatch: "No plugin matches that.",
  /** The description of a shipped package the registry has no entry for. */
  shippedNoEntry: "Ships with this build; the registry has no entry for it yet.",
  /** The "built in" tag on a library plugin: it ships with the build and needs no download. */
  libraryBuiltinHint: "Ships with this build; install it to an agent to use it there.",
  pluginCount: (n: number): string => (n === 1 ? "1 plugin" : `${n} plugins`),
  searchPlaceholder: "Search plugins",
  /** Section labels of the plugin detail Modal. */
  detailSkills: "Skills",
  detailHooks: "Hooks",
  usedByAgents: (n: number): string =>
    n === 0 ? "not used yet" : n === 1 ? "used by 1 agent" : `used by ${n} agents`,
  /** Title on a disabled quick-start button: it pre-selects one of the plugin's skills on the currently selected agent, so the plugin has to be installed there first. */
  /** Quick start's tooltip: what pressing it does, and what it does not. */
  quickStartHint:
    "Quick start: opens a draft with a demo of this plugin — nothing runs until you send it",
  quickStartInstallTitle: (plugin: string, agent: string) =>
    `Install ${plugin} on ${agent} to quick-start?`,
  quickStartAfterInstall: "Then a draft with its demo opens; nothing runs until you send it.",
  quickStartNotRunning:
    "Quick start needs the plugin running — it is waiting for a restart or failed to load",
  quickStartNeedsAdmin: "An admin installs module plugins; quick start works once it runs",
  /** The demo of a module plugin that declares none. */
  quickStartGenericText: (specifier: string) =>
    `Show me what the ${specifier} plugin does: use it on something small in this Workspace and tell me what it changed.`,
  installedToast: (plugin: string, agent: string): string => `Installed ${plugin} to ${agent}`,
  uninstalledToast: (plugin: string, agent: string): string =>
    `Uninstalled ${plugin} from ${agent}`,
  updateOutdated: (n: number): string => `Update available: update ${n} agent install(s)`,
  updateConfirmTitle: (name: string): string => `Update ${name}`,
  updateConfirmWarning: (name: string): string =>
    `Updating ${name} reinstalls the library copy over each agent's installed skill and hook files — any local edits are lost. Export a backup first if you need them.`,
  updatedToast: (plugin: string, n: number): string =>
    `Updated ${plugin} to the latest version (${n} agent(s))`,
  /** Uninstall confirmation: removing the installed copy deletes its files (local edits included). */
  uninstallConfirmTitle: (name: string): string => `Uninstall ${name}`,
  uninstallConfirmBody: (plugin: string, agent: string): string =>
    `Uninstall ${plugin} from ${agent}? Its installed skill and hook files (local edits included) will be deleted.`,
};
