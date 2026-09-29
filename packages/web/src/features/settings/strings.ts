/**
 * The settings module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `settings` section. A new string is added here, to both fragments, and
 * nowhere else — `SettingsStrings` makes a key missing from `settingsEn` a type error.
 */
export const settingsZh = {
  language: "语言",
  languageInfo: "界面语言，可跟随浏览器设置。",
  /** Sidebar user-menu row opening the Settings dialog, and that dialog's title. */
  title: "设置",
  /** Sidebar user-menu row, under the settings row, opening the dashboard page. */
  dashboard: "看板",
  /** Rail headings: the viewer's own preferences vs. the whole server's. */
  groupPersonal: "个人",
  groupServer: "服务器",
  /** Personal pages of the settings dialog. */
  profile: "个人资料",
  generalTitle: "通用",
  appearanceTitle: "外观",
  accountTitle: "账户",
  /** Trace import: the two pickers' accessible names, the pick-a-file action, and its outcomes. */
  importTrace: "导入 Trace",
  importTraceInfo:
    "上传从其他部署导出的 .jsonl 轨迹文件，它会成为所选 Agent 的一个会话。目的地的两个部分都在这里选择：导入接口按 Agent 划分——轨迹文件自带的 session_meta 无法指认本机的 Agent，其中的 agent_state 路径属于导出它的那台机器——而 Project 需要明确指定，因为本对话框不显示当前是哪一个，也因此可以导入到当前打开之外的 Project。导出在对话的 Trace 面板中进行。",
  importTraceProject: "导入到 Project",
  importTraceAgent: "导入到 Agent",
  importTracePick: "选择文件",
  importTraceRunning: "导入中…",
  importTraceDone: (target: string) => `轨迹已导入到 ${target}`,
  importTraceTooLarge: "文件超过 14MB 上限。",
  /** Admin-only sub-page (server-global); its explanation is disclosed at the pane heading. */
  proxyTitle: "代理选项",
  proxyInfo:
    "服务器全局设置，保存后立即生效，无需重启。回环地址始终直连。" +
    "「连通性测速」向下方列出的地址各发一次不带凭据的 GET，量的是本服务器出站这一跳：" +
    "对方回了 HTTP 响应即算连通，401、403 同样算——它们说明域名解析、TCP 连接与 TLS 握手都已走通；" +
    "连不通指的是传输本身失败。测的是已保存的设置——只有保存才会重建出站 dispatcher，" +
    "所以测速排在「保存」下方，改过地址要先保存再测。结果先到先出，各自到达即显示。",
  /** The two switches: the server's own outbound traffic / agent command subprocess environments. */
  proxyForApp: "应用程序使用代理",
  proxyForAgent: "Agent 环境使用代理",
  /** The shared explicit proxy address (empty = follow the proxy environment variables). */
  proxyAddress: "代理地址",
  proxyAddressPlaceholder: "留空 = 跟随系统代理",
  /** Reachability test: the block's heading, and its button at rest and while probing. */
  proxyProbe: "连通性测速",
  proxyProbeRun: "测速",
  proxyProbeRunning: "测速中…",
  /** A provider answered: the latency IS the result, so this is the only visible text. */
  proxyProbeLatency: (ms: number): string => `${ms} ms`,
  /** The same verdict in words, read out beside the number — a bare figure does not say "reachable". */
  proxyProbeReachableState: "已连通",
  /** Listed but not yet measured: an absence, not a verdict. */
  proxyProbeIdle: "未测试",
  /** A provider did not answer: the transport fault, each naming the state in words. */
  proxyProbeFailure: {
    timeout: "连接超时",
    dns: "域名解析失败",
    refused: "连接被拒绝",
    tls: "TLS 握手失败",
    network: "无法连接",
  },
  /** Admin-only sub-page (server-global). */
  sharingTitle: "分享",
  sharingInfo:
    "把 Agent 的定义（系统配置、提示词、技能、工具、工作流）发布为 GitHub gist，或从 gist 安装。发布需要一个带 gist 权限的 GitHub token，由服务器保存；安装公开 gist 不需要 token。",
  sharingDesc:
    "服务器优先用它所在机器上 gh CLI 的登录身份发布；没有 gh 时才用这个 token。它只写不读，界面只显示是否已配置。",
  githubToken: "GitHub token",
  githubTokenHint:
    "需要 gist 权限（Fine-grained token: Gists → Read and write）。留空并保存不会改动。",
  githubTokenStored: "已配置 token。",
  githubTokenMissing: "尚未配置 token：Agent 可以从 gist 安装，但不能发布。",
  githubTokenReplace: "输入新 token 以替换",
  githubTokenClear: "清除 token",
  /** Admin-only sub-page (server-global): the options loaded plugins declare. */
  pluginsTitle: "插件",
  /** An enum option this machine cannot honour, listed greyed out. */
  pluginOptionUnavailable: (title: string, reason: string) => `${title}（不支持：${reason}）`,
  pluginsInfo:
    "各已装载插件在其包里声明的选项，表单按插件自己的 schema 生成。与插件本身一样是服务器全局的；保存后立即送达插件，无需重启。没有声明选项的插件不会出现在这里。",
  /** A secret field with a stored value: submitting it empty keeps the stored one. */
  pluginSecretKeepHint: "留空保持已保存的值不变",
  pluginSecretClear: "清除已存值",
  /** The Plugins settings page's machine picker: each server keeps its own plugin settings. */
  pluginConfigMachine: "机器",
  /** Under a number field whose box does not parse; the save is not sent. */
  pluginFieldNotNumber: "必须是数字",
  uploadLimitsTitle: "上传限制",
  /** Its two number fields, both in whole MB. */
  attachmentMaxMb: "单个附件上限（MB）",
  attachmentTotalMb: "单条消息附件合计上限（MB）",
  /** Accepted range for each field: read while typing, so it stays under the field. */
  attachmentMaxMbHint: (min: number, max: number): string => `取值 ${min}–${max} MB`,
  attachmentTotalMbHint: (min: number, max: number): string =>
    `取值 ${min}–${max} MB，且不得低于单个附件上限`,
  /** What these two numbers do NOT govern — disclosed at the pane heading. */
  uploadLimitsInfo: (count: number, imageMb: number): string =>
    `一条消息最多 ${count} 个附件；对话内嵌图片另有 ${imageMb}MB 上限，不随此设置变化——` +
    `图片会进入对话与轨迹，每次翻阅历史与恢复会话都要重新付出它的体积。`,
  theme: "主题",
  themeInfo: "应用的明暗外观。",
  themeLight: "浅色",
  themeDark: "深色",
  followSystem: "跟随系统",
  terminalTheme: "终端主题",
  terminalThemeInfo: "终端面板的配色，默认跟随应用主题。",
  followAppTheme: "跟随主题",
  langZh: "中文",
  langEn: "English",
  fontSize: "字号",
  fontSizeInfo: "界面整体字号。",
  fontSmall: "小",
  fontMedium: "中",
  fontLarge: "大",
  accent: "主题色",
  accentInfo: "界面强调色。",
  launcher: "快捷方式悬浮球",
  launcherInfo:
    "在对话正文右缘浮动的圆形按钮，展开后是工作台各块面板与终端的快捷方式；这里关掉后它就不再出现，展开里的「隐藏悬浮球」同样会关掉它。",
  toolAliases: "工具短名",
  toolAliasesInfo:
    "对话里的工具卡片用短名称呼内置工具，read_file 显示为「读取」。其余工具（含 MCP 工具）与轨迹观测始终是工具原本的名字；悬停短名也能看到它。",
  notifications: "任务完成通知",
  notificationsInfo:
    "Task 在窗口失焦或隐藏时结束，弹一条系统通知，点击即回到该 Session。打开这个开关会当场向系统申请通知权限——系统只问这一次，被拒之后不再询问，只能到系统的通知设置里改回来。",
  notificationsDenied: "系统已拒绝本应用的通知权限。请先在系统的通知设置中允许，再打开这个开关。",
  notificationsDismissed:
    "权限提示被关闭、没有给出答复，通知因此保持关闭。再次打开这个开关可以重新申请。",
  notificationsUnsupported: "当前浏览器不支持系统通知。",
  /** Desktop shell only: the system-tray icon. Absent in a browser. */
  trayIcon: "托盘图标",
  trayIconInfo:
    "桌面应用运行期间在系统托盘（Windows 通知区、macOS 菜单栏、Linux 托盘）常驻一个图标，点击即可回到窗口，右键可开新会话或退出。默认开启；关掉后图标立即消失，无需重启，此时关闭窗口不再收进托盘：macOS 应用留在 Dock，Windows 与 Linux 关窗即退出。",
  currencyInfo: "价格显示币种；存储始终为美元。",
  changePasswordInfo: "更改当前账号的登录密码。",
  /** Personal company-mode switch (general page) and the admin master switch (its own server page). */
  companyModeTitle: "公司模式",
  companyModePersonal: "公司模式",
  companyModePersonalInfo:
    "关闭只隐藏本人的模式切换，组织照常运转；管理员的总开关在「服务器」分组。",
  companyModeServer: "启用公司模式",
  companyModeServerInfo:
    "服务器总开关，缺省关闭，需由管理员在此打开。关闭即停用组织调度器与全部组织路由，并隐藏所有人的模式切换；磁盘上的组织不受影响，重新打开后不会补发错过的触发。内测功能：可能有不稳定的现象，遇到问题请反馈。",
  accentNames: {
    neutral: "灰白",
    blue: "蓝",
    green: "绿",
    violet: "紫",
    rose: "红",
    amber: "橙",
  } as Record<string, string>,
};

export type SettingsStrings = typeof settingsZh;

export const settingsEn: SettingsStrings = {
  language: "Language",
  languageInfo: "Interface language; can follow the browser.",
  /** Sidebar user-menu row opening the Settings dialog, and that dialog's title. */
  title: "Settings",
  /** Sidebar user-menu row, under the settings row, opening the dashboard page. */
  dashboard: "Dashboard",
  /** Rail headings: the viewer's own preferences vs. the whole server's. */
  groupPersonal: "Personal",
  groupServer: "Server",
  /** Personal pages of the settings dialog. */
  profile: "Profile",
  generalTitle: "General",
  appearanceTitle: "Appearance",
  accountTitle: "Account",
  /** Trace import: the two pickers' accessible names, the pick-a-file action, and its outcomes. */
  importTrace: "Import Trace",
  importTraceInfo:
    "Upload a .jsonl Trace exported from another install and it becomes a conversation of the chosen Agent. Both halves of the destination are picked here: the endpoint is per-Agent — a Trace file's own session_meta cannot name a local Agent, since its agent_state path belongs to the machine that exported it — and the Project is asked for because this dialog does not show which one is open, which also means a Trace can go to a Project other than the open one. Exporting happens in a conversation's Trace panel.",
  importTraceProject: "Import into project",
  importTraceAgent: "Import into agent",
  importTracePick: "Choose file",
  importTraceRunning: "Importing…",
  importTraceDone: (target: string) => `Trace imported into ${target}`,
  importTraceTooLarge: "The file exceeds the 14MB limit.",
  /** Admin-only sub-page (server-global); its explanation is disclosed at the pane heading. */
  proxyTitle: "Proxy options",
  proxyInfo:
    "Server-global, and in force the moment it is saved — nothing to restart. Loopback " +
    "addresses always go direct. The reachability test sends one credential-free GET to each " +
    "address listed below and measures this server's own outbound hop: any HTTP answer counts " +
    "as reachable, 401 and 403 included — a refused credential still proves DNS, TCP and TLS " +
    "all completed — while unreachable means the transport itself failed. It measures the " +
    "saved settings, since only a save rebuilds the outbound dispatcher; that is why the test " +
    "sits below Save, and why an edited address has to be saved before testing. Results " +
    "appear one by one, each as soon as its own answer arrives.",
  /** The two switches: the server's own outbound traffic / agent command subprocess environments. */
  proxyForApp: "Application uses the proxy",
  proxyForAgent: "Agent environment uses the proxy",
  /** The shared explicit proxy address (empty = follow the proxy environment variables). */
  proxyAddress: "Proxy address",
  proxyAddressPlaceholder: "Empty = follow system proxy",
  /** Reachability test: the block's heading, and its button at rest and while probing. */
  proxyProbe: "Reachability test",
  proxyProbeRun: "Test",
  proxyProbeRunning: "Testing…",
  /** A provider answered: the latency IS the result, so this is the only visible text. */
  proxyProbeLatency: (ms: number): string => `${ms} ms`,
  /** The same verdict in words, read out beside the number — a bare figure does not say "reachable". */
  proxyProbeReachableState: "Reachable",
  /** Listed but not yet measured: an absence, not a verdict. */
  proxyProbeIdle: "Not tested",
  /** A provider did not answer: the transport fault, each naming the state in words. */
  proxyProbeFailure: {
    timeout: "Timed out",
    dns: "DNS lookup failed",
    refused: "Connection refused",
    tls: "TLS handshake failed",
    network: "Unreachable",
  },
  /** Admin-only sub-page (server-global): the options loaded plugins declare. */
  pluginsTitle: "Plugins",
  /** An enum option this machine cannot honour, listed greyed out. */
  pluginOptionUnavailable: (title: string, reason: string) => `${title} (not supported: ${reason})`,
  pluginsInfo:
    "The options each loaded plugin declares in its package, drawn from the plugin's own schema. Server-global, like the plugins themselves; a save reaches the plugin at once, nothing to restart. A plugin that declares no options has no form here.",
  /** A secret field with a stored value: submitting it empty keeps the stored one. */
  pluginSecretKeepHint: "Leave empty to keep the saved value",
  pluginSecretClear: "Clear stored value",
  /** The Plugins settings page's machine picker: each server keeps its own plugin settings. */
  pluginConfigMachine: "Machine",
  /** Under a number field whose box does not parse; the save is not sent. */
  pluginFieldNotNumber: "Must be a number",
  sharingTitle: "Sharing",
  sharingInfo:
    "Publish an Agent's definition (system config, prompt, skills, tools, workflows) as a GitHub gist, or install one from a gist. Publishing needs a GitHub token with the gist scope, kept by the server; installing a public gist needs none.",
  sharingDesc:
    "The server publishes as the `gh` CLI logged in on its machine when there is one; this token is the fallback. It is write-only: the page shows whether one is stored, never the value.",
  githubToken: "GitHub token",
  githubTokenHint:
    "Needs the gist scope (fine-grained token: Gists → Read and write). Leaving it empty and saving changes nothing.",
  githubTokenStored: "A token is stored.",
  githubTokenMissing: "No token yet: Agents can be installed from a gist, but not published.",
  githubTokenReplace: "Enter a new token to replace it",
  githubTokenClear: "Clear token",
  uploadLimitsTitle: "Upload limits",
  /** Its two number fields, both in whole MB. */
  attachmentMaxMb: "Max attachment size (MB)",
  attachmentTotalMb: "Max total per message (MB)",
  /** Accepted range for each field: read while typing, so it stays under the field. */
  attachmentMaxMbHint: (min: number, max: number): string => `${min}–${max} MB`,
  attachmentTotalMbHint: (min: number, max: number): string =>
    `${min}–${max} MB, and not below the per-file limit`,
  /** What these two numbers do NOT govern — disclosed at the pane heading. */
  uploadLimitsInfo: (count: number, imageMb: number): string =>
    `A message may carry at most ${count} attachments. Images placed inline in the ` +
    `conversation keep a separate ${imageMb}MB limit that this setting does not raise — an ` +
    `inline image enters the conversation and the Trace, where its size is paid again on ` +
    `every history page and resume.`,
  theme: "Theme",
  themeInfo: "Light or dark look of the app.",
  themeLight: "Light",
  themeDark: "Dark",
  followSystem: "System",
  terminalTheme: "Terminal theme",
  terminalThemeInfo: "Colors of the terminal panel; follows the app theme by default.",
  followAppTheme: "App",
  langZh: "中文",
  langEn: "English",
  fontSize: "Font size",
  fontSizeInfo: "Overall interface font size.",
  fontSmall: "S",
  fontMedium: "M",
  fontLarge: "L",
  accent: "Accent",
  accentInfo: "Interface accent color.",
  launcher: "Shortcuts launcher",
  launcherInfo:
    "The round button floating on the conversation's right edge that fans out shortcuts to the workbench's panels and the terminal. Turning it off here removes it; the fan's \"Hide launcher\" entry does the same.",
  toolAliases: "Tool short names",
  toolAliasesInfo:
    'Tool cards in a conversation name the built-in tools by a short alias: read_file reads as "read". Every other tool (MCP tools included) and the Trace viewer keep the tool\'s own name, and hovering a short name shows it.',
  notifications: "Task completion notifications",
  notificationsInfo:
    "Shows a system notification when a Task finishes while the window is hidden or unfocused; clicking it opens that Session. Turning this on asks the system for permission on the spot — the system asks once, never again after a refusal, and the only way back is its own notification settings.",
  notificationsDenied:
    "The system has denied notifications for this app. Allow them in your system notification settings, then turn this on again.",
  notificationsDismissed:
    "The permission prompt was closed without an answer, so notifications stay off. Turn this on again to ask once more.",
  notificationsUnsupported: "This browser does not support system notifications.",
  trayIcon: "Tray icon",
  trayIconInfo:
    "The desktop app keeps an icon in the system tray — the Windows notification area, the macOS menu bar, the Linux tray — for as long as it runs: click it to come back to the window, right-click it to start a session or quit. On by default; turning it off removes the icon at once, no restart, and closing the window then no longer hides it, so the app stays in the Dock on macOS and quits on Windows and Linux.",
  currencyInfo: "Display currency for prices; storage is always USD.",
  changePasswordInfo: "Change this account's sign-in password.",
  /** Personal company-mode switch (general page) and the admin master switch (its own server page). */
  companyModeTitle: "Company mode",
  companyModePersonal: "Company mode",
  companyModePersonalInfo:
    "Off only hides your own mode switch; organizations keep running. The admin master switch sits under Server.",
  companyModeServer: "Enable company mode",
  companyModeServerInfo:
    "The server-wide master switch, off until an admin turns it on here. Off stops the organization scheduler and every organization route and hides the mode switch for everyone. Organizations on disk are untouched, and turning it back on backfills no missed trigger. Beta: it may be unstable; please report what you hit.",
  accentNames: {
    neutral: "Neutral",
    blue: "Blue",
    green: "Green",
    violet: "Violet",
    rose: "Rose",
    amber: "Amber",
  } as Record<string, string>,
};
