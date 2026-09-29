/**
 * UI copy (bilingual): this file holds the Chinese dictionary `zh` and the runtime
 * active dictionary `S`; the English dictionary lives in strings-en.ts (constrained
 * to the same shape by the `Strings` type). Locale preference is resolved by
 * state/locale.tsx, which calls `setActiveStrings` to switch and remounts the whole
 * tree keyed by locale, so `S.x` reads in components always reflect the current
 * language (module-level constants do not update on switch — keep reads inside components).
 * Keep domain terms capitalized in English — Workspace, Token, Task, Session, Project, Trace.
 * "agent" is a common noun: lowercase mid-sentence, capitalized only at the start of a
 * label/sentence or in a proper name (Agent State, AgentHub). zh names the SURFACE
 * 「智能体」 — the nav entry, the grouping option, the panel — and keeps "Agent" as-is
 * inside running prose, where it is the term of art rather than the thing being pointed at.
 */
import { terminalZh } from "../features/terminal/strings";
import { adminZh } from "../features/admin/strings";
import { agentZh } from "../features/agents/strings";
import { aiCreateZh } from "../features/ai-create/strings";
import { benchmarkZh } from "../features/benchmark/strings";
import { browserZh } from "../features/browser/strings";
import { chatZh } from "../features/chat/strings";
import { companyZh } from "../features/company/strings";
import { dashboardZh } from "../features/dashboard/strings";
import { dockZh } from "../features/dock/strings";
import { harnessHistoryZh } from "../features/harness/strings";
import { machinesZh } from "../features/machines/strings";
import { messagingZh } from "../features/messaging/strings";
import { modelsZh } from "../features/models/strings";
import { commandPaletteZh } from "../features/palette/strings";
import { pluginsZh } from "../features/plugins/strings";
import { portsZh } from "../features/ports/strings";
import { scheduleZh } from "../features/schedules/strings";
import { semanticIdZh } from "../features/semantic-id/strings";
import { settingsZh } from "../features/settings/strings";
import { skillsZh } from "../features/skills/strings";
import { tracesZh } from "../features/traces/strings";
import { usageZh } from "../features/usage/strings";
import { workflowsZh } from "../features/workflows/strings";

export const zh = {
  appName: "PenguinHarness",

  nav: {
    chat: "对话",
    newChat: "新对话",
    agents: "智能体",
    models: "模型库",
    machines: "机器",
    plugins: "插件市场",
    usage: "成本中心",
    traces: "轨迹观测",
    benchmark: "评估中心",
    // Collapsed-rail tooltips (product-specified wording; new chat reuses chat.newSessionMenu, the other pages reuse the page names above).
    lastConversation: "最近一次对话",
    // The rail avatar's tooltip says what the control does; who is signed in stays in its accessible name.
    userSettings: "用户设置",
    collapseSidebar: "收起侧栏",
    expandSidebar: "展开侧栏",
    collapseGroup: "折叠",
    expandGroup: "展开",
    pinGroup: "置顶分组",
    unpinGroup: "取消置顶",
    /** Company mode's page entries (S.nav.org.<key>, the COMPANY_NAV_KEYS manifest), and the mode switch's option names. */
    org: {
      overview: "概览",
      chart: "组织图",
      calendar: "日历",
      tickets: "工单",
      finance: "财务",
      handbook: "手册",
      /** The proposals page a plugin contributes (ORG_PAGE_RENDERERS); the row exists only while the plugin does. */
      proposals: "提案",
      /** The roadmaps page a plugin contributes and serves itself (an iframe row of ORG_PAGE_RENDERERS); the row exists only while the plugin does. */
      roadmaps: "路线图",
    },
  },

  /** Machines page: the server's own ssh hosts, and installing this build on one. */
  machines: machinesZh,

  /** The Browser: a dock tab showing a page on a host of its own. */
  browser: browserZh,

  /** Port forwarding: the dock's Ports panel, and a machine's Ports page. */
  ports: portsZh,

  /** Server-side terminal (the in-app dock and the standalone /terminal page): the terminal module owns this copy. */
  terminal: terminalZh,

  /** The dock surfaces (right / bottom) every side element renders in as a tab. */
  dock: dockZh,

  /** The Trace dock panel (the current conversation's Trace files). */
  tracePanel: {
    empty: "暂无轨迹",
    emptyHint: "该会话还没有产生 Trace 文件",
    loadFailed: "轨迹加载失败",
  },

  dashboard: dashboardZh,

  settings: settingsZh,

  commandPalette: commandPaletteZh,
  workflows: workflowsZh,
  harnessHistory: harnessHistoryZh,
  /**
   * The software-update flow (lib/update-flow.ts): the one modal for both the server release
   * and the desktop client, the account-menu row, the version-line badge, and the toasts for
   * outcomes that land while the modal is closed. Null version = the backend named none.
   */
  update: {
    /** Version-line date label (owner-specified wording); `date` is formatMonthDay output. */
    lastUpdated: (date: string) => `最近更新日期 ${date}`,
    /** The version line's superscript (owner-specified wording), a button into the modal; the other two follow the flow. */
    newVersionBadge: "有新版本可用",
    badgeDownloading: "正在下载更新",
    badgeReady: "重启以更新",
    /** A release offered: the row's label and the avatar badges' sentence. */
    newVersion: (v: string) => `新版本 v${v} 可用`,
    /** A release downloaded / installed and waiting for the restart: the row's label and the badges' sentence. */
    restartToUpdate: (v: string | null) => (v !== null ? `重启以更新到 v${v}` : "重启以完成更新"),
    /** The combined wording for an anchor covering several update trails at once. */
    updatesAvailable: "有可用更新",
    // —— the account-menu row ——
    checkNow: "检查更新",
    checking: "检查中…",
    rowDownloading: (v: string | null, percent: number | null) =>
      `正在下载${v !== null ? ` v${v}` : "更新"}${percent !== null ? ` ${percent}%` : "…"}`,
    rowRestarting: "正在重启…",
    rowUnsupported: "无法在线更新",
    // —— the modal ——
    title: "软件更新",
    currentVersion: (v: string) => `当前版本 v${v}`,
    checkingBody: "正在检查更新…",
    upToDate: "已是最新版本",
    checkFailed: "检查更新失败，请稍后重试",
    checkDisabled: "更新检查已关闭（PENGUIN_UPDATE_CHECK=off）",
    releaseNotes: "更新说明",
    openReleases: "打开 Releases 页面",
    /** What "download and update" does, per backend. */
    availableBodyRelease:
      "将下载最新版本并安装到服务器上的安装目录（数据目录不受影响）。下载期间可以关闭本窗口，安装完成后重启服务即可生效。",
    availableBodyClient:
      "将下载新版本。下载期间可以关闭本窗口继续使用，下载完成后重启应用即可完成更新。",
    /** Shown to non-admins in place of the body above (they can read the notes but cannot run the update). */
    adminOnly: "只有管理员可以在这里执行更新。",
    downloadAndInstall: "下载并更新",
    later: "稍后",
    background: "放到后台",
    downloading: (v: string | null) => (v !== null ? `正在下载 v${v}…` : "正在下载更新…"),
    /** The progress bar's accessible name. */
    downloadProgress: "下载进度",
    /** The server job's stages, shown under the bar while it carries no percentage. */
    phaseResolving: "正在获取版本信息…",
    phaseDownloading: "正在下载安装包…",
    phaseInstalling: "正在校验并安装…",
    ready: (v: string | null) => (v !== null ? `v${v} 已就绪` : "更新已就绪"),
    readyBodyRelease: "重启服务即可运行新版本，正在运行的任务会被打断；服务回来后页面会自动刷新。",
    /** Mirrors the shell's native restart prompt: the interruption warning must not disappear on the web path. */
    readyBodyClient: "PenguinHarness 将重启以完成更新，正在运行的任务会被打断。",
    /** Nothing supervises the server process (not started through penguin web / penguin server), so the restart is the user's. */
    readyBodyManual:
      "新版本已安装。当前服务不是由 penguin web 或 penguin server 托管，无法从这里重启：请在终端重新运行 penguin web（或 penguin server）。",
    restartNow: "重启并更新",
    restarting: "正在重启…",
    restartingBodyRelease: "服务回来后页面会自动刷新。",
    restartingBodyClient: "应用即将重启。",
    failed: "更新失败",
    retry: "重试",
    /** Why this install cannot update itself. */
    unsupportedDev: "开发运行不支持自更新",
    unsupportedNonAppImage: "Linux 上只有 AppImage 版本支持自更新——包安装请通过包管理器更新",
    unsupportedNotViaCli: "当前服务不是通过 penguin web 或 penguin server 启动的，无法从这里更新",
    unsupportedCli: "当前安装方式不支持在线更新",
    // —— toasts: outcomes that land while the modal is closed ——
    foundNew: (v: string) => `发现新版本 v${v}，打开更新入口即可下载`,
    foundNewUnnamed: "发现新版本，打开更新入口即可下载",
    readyToast: (v: string | null) =>
      v !== null ? `v${v} 已就绪，可重启更新` : "更新已就绪，可重启更新",
    failedToast: "更新失败，打开更新入口查看详情",
    unsupportedToast: "当前安装方式不支持在线更新",
    /** The shell's own updater failure text — a failed download or signature check, not only a failed lookup. */
    clientUpdateFailed: (detail: string) => `客户端更新失败：${detail}`,
    /** A download / restart request failed before the backend could act; `detail` is apiErrorText output. */
    requestFailed: (detail: string) => `无法执行更新操作：${detail}`,
    restartTimedOut: "服务迟迟没有回来，请查看终端里 penguin web 的输出后手动刷新页面",
  },

  /**
   * The four DISMISSIBLE badge trails (Agents / Skill library / model library / cost center),
   * the controls that clear them and the control that acts on all of one at once. The tooltip
   * sentences below are what each dot says; the page notice restates the same count in its own
   * `changes*` wording, since a block that can act needs to say what it would act on.
   */
  todo: {
    pluginUpdates: (n: number) => `${n} 个插件有更新`,
    presetUpdates: (n: number) => `${n} 个预置模型可同步`,
    unexpectedErrors: (n: number) => `${n} 条未预期错误`,
    /** Combined anchor whose trails are not all updates — an unexpected error is not one. */
    pending: "有待处理事项",
    /** Clears an update the user has decided not to take now (a later one raises the badge again). */
    dismiss: "忽略",
    /** The cost center's wording: nothing is being updated there, the errors are simply read. */
    markRead: "标记为已读",

    // —— The page notice's own line and its bulk action (components/ui/todo-notice.tsx) ——

    /** The notice line where the trail can separate genuinely new things from upgradable ones (Models only). */
    changesWithAdded: (added: number, updated: number): string =>
      `检测到变更：${added} 个新增，${updated} 个可升级`,
    /** The same line where the trail has only one honest count — no padded zero (Agents, Plugins). */
    changesUpgradable: (updated: number): string => `检测到变更：${updated} 个可升级`,
    /** Updates every object the notice counts, behind the page's own confirmation. */
    updateNow: "现在升级",
    /** Heading of the confirmation's list of exactly what the batch would write to. */
    willTouch: "将影响以下对象：",
    /** Bulk kernel update confirmation; the body reuses agent.kernelUpdateConfirmBody verbatim. */
    agentsConfirmTitle: (n: number): string => `更新 ${n} 个 Agent 的内核`,
    /** Bulk plugin update confirmation. Same warning as the per-plugin confirm, with no single subject. */
    pluginsConfirmTitle: (n: number): string => `更新 ${n} 个插件`,
    pluginsConfirmBody:
      "更新会把库内当前副本重装到各 Agent，覆盖其已安装的技能与钩子文件——本地改动会丢失，如有需要请先导出备份。",
    /** Bulk preset sync confirmation; the body reuses models.syncCatalogHint verbatim. */
    modelsConfirmTitle: (n: number): string => `同步 ${n} 个预置模型`,
    /** Every target of the batch was written. Counted in Agents: both pages that use this
     * send one request per Agent, and the partial-failure line below names Agents too. */
    bulkDone: (ok: number): string => `已更新 ${ok} 个 Agent`,
    /** Some targets were written and some were not — the failed ones are named, never just counted. */
    bulkPartial: (ok: number, failed: string): string =>
      `已更新 ${ok} 个 Agent；以下未成功：${failed}`,
    /** Separator between named targets in the two strings above. */
    listSeparator: "、",
  },

  /** Task-completion notifications (window unfocused; opt-in, see lib/notification-pref). */
  notify: {
    taskCompleteTitle: "任务完成",
    /** `session` is the Session title (defaultSessionTitle when unnamed). */
    taskCompleteBody: (session: string): string => `「${session}」已完成，点击查看`,
  },

  common: {
    save: "保存",
    cancel: "取消",
    close: "关闭",
    create: "创建",
    delete: "删除",
    edit: "编辑",
    settings: "设置",
    confirm: "确认",
    /** Sole button of a dialog that only informs: it has nothing to confirm or cancel, so the label acknowledges rather than agrees (and does not repeat the header X's "close"). */
    gotIt: "知道了",
    loading: "加载中…",
    saved: "已保存",
    saving: "保存中…",
    /** Clicking save with nothing changed: an info toast instead of a silent no-op. */
    noChangesToSave: "当前没有需要保存的修改",
    /** Confirm-before-save dialog shared by the settings forms (writes go to server-side config files). */
    confirmSaveTitle: "保存修改",
    confirmSaveBody: "确定保存这些修改吗？修改将写入服务器上的配置文件。",
    none: "（无）",
    retry: "重试",
    unknownError: "请求失败，请稍后重试",
    requiredField: "此项必填",
    /** A menu row that copies what it acts on (the conversation's selection menu); the confirmation is `copied`. */
    copy: "复制",
    copied: "已复制",
    /** Accessible name of the circled "?" that discloses a section or field explanation. */
    moreInfo: "说明",
    /** The same, named for what it explains — so the trigger never repeats the heading it sits in. */
    moreInfoAbout: (subject: string) => `说明：${subject}`,
    name: "名称",
    username: "用户名",
    role: "角色",
    actions: "操作",
    created: "创建时间",
    cost: "成本",
    time: "时间",
  },

  /**
   * The id field every create dialog with a semantic id wears (features/semantic-id): a Project's,
   * an Agent's, a Benchmark's, an organization's and a channel's.
   */
  semanticId: semanticIdZh,

  auth: {
    usernameHint: "2~32 位：小写字母开头，仅小写字母、数字与下划线",
    password: "密码",
    passwordHint: "至少 8 个字符",
    showPassword: "显示密码",
    hidePassword: "隐藏密码",
    login: "登录",
    logout: "登出",
    /** The sign-out confirmation: dialog name and body. */
    logoutConfirmTitle: "登出？",
    logoutConfirmBody: "将退出当前账号并回到登录页；进行中的对话会在服务端继续运行。",
    admin: "管理员",
    defaultAdminNote:
      "首次使用请打开服务端启动输出中的首次登录链接，认领内置管理员 admin 并设置密码。这里没有可输入的初始密码",
    /** Login footer line 2: the offline rescue for a forgotten admin password (other users ask the admin instead). */
    forgotAdminNote:
      "忘记管理员密码时，停止服务后执行 penguin server reset-admin-password；再次启动时会打印新的首次登录链接，打开它即可设置新密码",
    /** Dialog raised over the login form when the server refused a sign-in link (spent, expired, or never valid). */
    claimFailedTitle: "登录链接已失效",
    /** Desktop deployment: the shell mints a fresh link every time it starts, so restarting it is the way back in. */
    claimFailedDesktop:
      "这个一次性登录链接已被使用或已失效。重启 PenguinHarness 桌面应用即可生成新的登录链接并自动登录；也可以在下方用账号密码登录。",
    /** Everywhere else: nobody at this browser can mint a link, so the way in is the form below or whoever runs the server. */
    claimFailedServer:
      "首次登录链接在服务端设置密码后即失效，重启服务端也会换发新的链接。请在下方用账号密码登录，或向管理员索取新的登录链接。",
  },

  /**
   * The Profile page of Settings, and the avatar/nickname it writes. Visible in every
   * session, the desktop shell's own window included: a profile needs no password to change.
   */
  profile: {
    /** Avatar row: its label, and the two actions beside the preview. */
    avatar: "头像",
    /** Disclosed by the "?" beside that label: when a picked image takes effect. */
    avatarInfo:
      "选择图片后立即生效，无需另行保存；旁边的昵称是输入的文本，因此保留了自己的保存按钮。",
    cropAvatar: "裁剪头像",
    cropAvatarHint: "拖动调整位置，滚轮或滑块缩放",
    cropZoom: "缩放",
    useAvatar: "使用",
    changeAvatar: "更换头像",
    /**
     * Shared label of the two buttons that put a field back to what an account with nothing set
     * shows: the letter tile for the avatar, the username for the nickname. Neither deletes
     * anything the app cannot draw again, which is why it does not say "remove".
     */
    restoreDefault: "恢复默认",
    /** The same, named for what it restores: two of these sit on one page. */
    restoreDefaultOf: (subject: string) => `恢复默认：${subject}`,
    /** The picked image could not be brought under the size limit even as JPEG. */
    avatarTooLarge: "图片过大，请换一张尺寸更小的图片。",
    /** The picked file could not be decoded as an image at all. */
    avatarUnreadable: "无法读取这张图片，请换一个文件。",
    /** Nickname row: the field, and the shape rule that stays on screen while typing. */
    displayName: "昵称",
    displayNameHint: "1–32 个字符，留空即清除",
    displayNamePlaceholder: "留空则显示用户名",
  },

  account: {
    changePassword: "修改密码",
    oldPassword: "当前密码",
    oldPasswordHint: "当前账号登录所用的密码——先校验它，新密码才会生效",
    newPassword: "新密码",
    confirmPassword: "确认新密码",
    passwordMismatch: "两次输入的新密码不一致",
    initialPasswordBanner: "当前账号正在使用初始密码，建议尽快修改",
    changeNow: "去修改",
  },

  admin: adminZh,

  project: {
    switcher: "Project",
    create: "新建 Project",
    createTitle: "新建 Project",
    id: "Project id",
    idHint: "2~64 位：小写字母开头，仅小写字母、数字与下划线；创建后不可修改",
    idPrefixHint: "id 固定以「用户名-」为前缀，后接小写字母、数字或下划线；创建后不可修改",
    displayName: "显示名",
    /** Create dialog only: leaving the name empty falls back to the id. In Project settings the saved name cannot be blanked. */
    displayNameHint: "留空则使用 Project id 作为名称",
    settings: "Project 设置",
    settingsTitle: "Project 设置",
    members: "成员",
    addMember: "添加成员",
    removeMember: "移除",
    /** New-conversation defaults section (Project settings): prefills each new conversation's agent / working directory / approval mode / thinking level / default model. */
    chatDefaultsTitle: "新对话默认值",
    chatDefaultsHint: "新建对话时预填的默认值：Agent、工作目录、审批模式、思考等级与默认模型。",
    chatDefaultsAgent: "Agent",
    chatDefaultsNotSet: "未设置",
    chatDefaultsApprovalNotSet: "未设置（默认全部放行）",
    chatDefaultsThinkingNotSet: "未设置（跟随智能体配置）",
    /** The model default shares its source with the Models page (the same default_model); this is just another entry point. */
    chatDefaultsModelHint: "与模型页的默认模型同步",
    /** Settings dialog tab rail. */
    settingsTabGeneral: "通用",
    settingsTabMembers: "成员",
    settingsTabDefaults: "默认值",
    settingsTabSecurity: "安全策略",
    projectIdLabel: "Project ID",
    deleteProjectDesc: "项目目录将被递归删除，不可恢复。",
    /** Security-policy page (Project settings): disclosed by the "?" beside the tab heading. */
    commandPolicyInfo:
      "命令文本经空白与引号归一化后逐条匹配已启用规则的正则表达式，命中即拒绝执行，不受审批模式影响。这是防事故的护栏：运行期才拼出的命令不在覆盖范围内。",
    commandPolicyEnable: "启用策略",
    commandPolicyEnableDesc: "关闭后所有规则都不再拦截。",
    commandPolicyRules: "规则",
    commandPolicyRestore: "恢复默认",
    commandPolicyAddRule: "添加规则",
    commandPolicyEditRule: "编辑",
    commandPolicyApplyRule: "确定",
    commandPolicyEmpty: "没有规则。",
    commandPolicyOn: "已启用",
    commandPolicyOff: "已停用",
    commandPolicyRuleName: "名称",
    commandPolicyRulePattern: "正则表达式",
    commandPolicyRuleDesc: "描述",
    commandPolicyInvalidPattern: "正则表达式无效",
    deleteProject: "删除 Project",
    deleteConfirm: "确认删除该 Project？项目目录将被递归删除，不可恢复。",
    deleteDefaultForbidden: "default_project 与 CLI 共用，不允许在 Web 端删除",
    deleteLastForbidden:
      "这是当前账号最后一个 Project，删除后将无 Project 可用；请先创建新的 Project",
    noCredentialTitle: "尚未配置模型 credential",
    noCredentialBody: "当前 Project 的默认模型尚未配置 API key，发起对话前请先前往模型页配置。",
    goToModels: "前往模型页",
    later: "稍后再说",
  },

  /** The "Create with AI" kit (features/ai-create): the pair of create buttons, the prompt panel and the bridge into a new conversation with the Project's default agent. */
  aiCreate: aiCreateZh,

  agent: agentZh,

  models: modelsZh,

  memory: {
    desc: "跨 Session 的长期记忆（存于 agent_state/memory/）：agent 会在对话中自行记下值得保留的信息，你也可以直接让它记住某件事。用户记忆对本 Agent 的所有会话生效，工作区记忆按工作区隔离；记忆修改在对话中由 agent 完成。关闭开关只停止使用记忆，不删除任何文件。",
    enable: "启用记忆",
    userScope: "用户记忆",
    templateMissing: "提示词模板中没有 {{MEMORY}} 占位符，记忆不会进入上下文。",
    insertPlaceholder: "插入 {{MEMORY}} 占位符",
    insertPlaceholderDone: "已插入",
    promptSection: "记忆提示词",
    promptSectionHint:
      "注入模板 {{MEMORY}} 占位符的内容。主提示词每个会话都注入；工作区附加段仅在持久工作区的会话中追加。",
    promptLabel: "主提示词",
    workspacePromptLabel: "工作区附加段",
    /**
     * Memory-prompt placeholder reference; a chip inserts into whichever field was focused
     * last. The two indexes plus the workspace directory — the user directory stays a literal
     * pattern in the prompt, resolvable from the Environment section.
     */
    promptPlaceholders: [
      [
        "{{USER_MEMORY_INDEX}}",
        "用户记忆索引 MEMORY.md 的内容（最多注入 200 行、总计 25000 字符）",
      ],
      [
        "{{WORKSPACE_MEMORY_INDEX}}",
        "当前工作区记忆索引的内容（最多注入 200 行、总计 25000 字符）；仅在工作区附加段生效",
      ],
      ["{{WORKSPACE_MEMORY_DIR}}", "当前工作区记忆目录的绝对路径；仅在工作区附加段生效"],
    ],
    insertToken: "插入到光标处",
    itemCount: (n: number): string => `${n} 条`,
    emptyScope: "这个工作区还没有记忆——agent 会在会话中自行记下值得保留的信息",
    emptyUserScope: "还没有用户记忆——在对话里说「记住……」即可让 agent 保存",
    add: "添加",
    /** Accessible name for the group header's add entry, which drops its visible label on a narrow row. */
    addScopeLabel: (scope: string): string => `向${scope}添加`,
    addTitle: "添加记忆",
    addWhy: "记忆整理由 agent 在对话中完成：填写内容后打开新对话，由 agent 整理保存。",
    addContentLabel: "要记住的内容或来源",
    addContentPlaceholder: "粘贴要记住的内容，或文件路径 / 链接",
    /** Prefilled draft for the add-via-chat flow, per scope kind; the required content follows on the next line. */
    addPromptLead: {
      user: "请把下面的内容整理成记忆，存入用户记忆：",
      workspace: "请把下面的内容整理成记忆，存入这个工作区的记忆：",
    },
    view: "查看",
    edit: "编辑",
    editTitle: "编辑记忆",
    editWhy:
      "内容修改由 agent 在对话中完成：确认引导语后打开新对话，agent 会同步更新记忆文件与 MEMORY.md 索引。",
    editRequirementLabel: "修改要求",
    editRequirementPlaceholder: "描述要怎么改，跳转后可在对话中补充",
    editPromptLabel: "引导语预览",
    editCopyPrompt: "复制 Prompt",
    editOpenChat: "打开新对话",
    delete: "删除",
    deleteTitle: "删除这条记忆？",
    deleteConfirm: (name: string): string =>
      `将删除「${name}」并移除 MEMORY.md 中对应的索引行。此操作不可恢复。`,
    deleteDone: "已删除",
    /** Prefilled draft for the edit-via-chat flow; the user completes the trailing requirement line before sending. */
    editPromptLead: (title: string): string => `请帮我更新一条记忆：${title}`,
    editPromptTail: "修改要求：",
    exportScope: "导出",
    exportScopeHint: "将该组全部记忆下载为一份 JSON 文档",
    exportScopeLabel: (scope: string): string => `导出${scope}`,
    importScope: "导入",
    importScopeHint: "从导出的 JSON 文档恢复记忆到该组",
    importScopeLabel: (scope: string): string => `导入到${scope}`,
    importTitle: "导入记忆",
    importWhy:
      "读取从本 agent 或其他 agent 导出的一组记忆：一个 JSON 文件，含这组记忆与它的 MEMORY.md 索引。",
    importFile: (name: string, count: number): string => `${name} —— ${count} 条记忆`,
    importModeLabel: "当这一组里已有同名记忆时",
    importModeSkip: "保留现有的这条",
    importModeSkipHint: "只添加这一组还没有的记忆，不会丢失任何现有内容。",
    importModeOverwrite: "改用文件里的版本",
    importModeOverwriteHint: "文件中没有的记忆保持不变。",
    importModeReplace: "整组替换",
    importModeReplaceHint: "文件中没有的记忆将被删除。",
    importAction: "导入",
    importInvalidFile: "这个文件不是记忆导出文件。",
    importEmptyFile: "这个文件里没有记忆。",
    importConfirmTitle: "确认导入",
    importWillOverwrite: (names: string[]): string =>
      `将覆盖 ${names.length} 条记忆：${names.join("、")}`,
    importWillRemove: (names: string[]): string =>
      `将删除 ${names.length} 条记忆：${names.join("、")}`,
    importWillReplaceIndex: "这一组的 MEMORY.md 索引将被替换。",
    importIrreversible: "此操作不可恢复。",
    importDone: (added: number, overwritten: number, removed: number): string =>
      `已导入：新增 ${added} 条，覆盖 ${overwritten} 条，删除 ${removed} 条`,
    importNothingNew: "没有可导入的内容——文件里的记忆这一组都已经有了",
  },

  vault: {
    desc: "本 Agent 专属的环境变量（存于 agent_state/.vault.toml）：键值对注入其 shell 命令（exec_command）的子进程环境；键名会告知模型，值不进入模型上下文。子 Agent 使用各自的保险柜，不继承。保存后自下一个任务起生效（进行中的任务不受影响）。",
    key: "键名",
    value: "值",
    valueMasked: "值（掩码）",
    add: "添加",
    addTitle: "添加环境变量",
    remove: "删除",
    deleteTitle: "删除环境变量",
    deleteConfirm: (key: string): string => `确认删除环境变量「${key}」？值不可恢复。`,
    overwriteTitle: "覆盖已有环境变量",
    overwriteConfirm: (key: string): string => `「${key}」已存在，保存将覆盖原值且不可恢复。`,
    empty: "尚未配置任何环境变量",
    readOnlyHint: "member 只读；Vault 修改仅 owner 可执行",
    keyHint: "字母、数字与下划线，不能以数字开头",
    keyInvalid: "键名不合法：仅字母、数字与下划线，且不能以数字开头",
    valueRequired: "值不能为空",
    /**
     * The tab's "add with AI" entry: the dialog's title and lead (an honest warning — a value
     * typed into the prompt reaches the provider, the Trace and the agent's own command line),
     * the prompt box's placeholder, the examples and the fixed instruction tail. The examples obey
     * that lead: the key-names-only ask comes first and none of them puts a secret in the prompt,
     * both pinned by create-with-ai-surfaces.test.ts. The tail is fed the target agent and Project
     * because the prompt goes to the Project's default agent, which is not necessarily the agent
     * whose vault this is; it names the data root for the same reason the models tail does.
     */
    aiAddTitle: "让 AI 添加密钥",
    aiAddIntro:
      "写进提示词的密钥值会发给模型服务商、写入对话记录（Trace），还会出现在智能体执行的命令里。更稳妥的做法是让 AI 只创建键名并告诉你用途，值在保险柜里手动填写。",
    aiAddPlaceholder: "让它检查这个智能体需要哪些 API key，或说明要建哪些键名…",
    aiAddExamples: [
      {
        key: "audit",
        label: "盘点这个智能体需要的 key",
        description: "先建键名，值稍后手动填",
        prompt:
          "检查这个智能体已安装的技能需要哪些 API key，先把键名建好，并逐个告诉我用途和申请地址——值我自己在保险柜里填。",
      },
      {
        key: "rotate",
        label: "重置一个过期 token",
        description: "把值清成占位符，新值手动填",
        prompt:
          "GH_TOKEN 已经过期，把它重置为占位值，并告诉我去哪里申请新的——新 token 我自己在保险柜里填。",
      },
      {
        key: "endpoint",
        label: "接入一个内部服务",
        description: "地址直接写入，token 留给你填",
        prompt:
          "这个智能体要访问我们内部的 Gitea（https://git.example.com）。把 GITEA_BASE_URL 设为该地址，GITEA_TOKEN 先用占位值创建，并告诉我去哪里签发 token。",
      },
    ],
    aiAddTail: (agentId: string, projectId: string): string =>
      [
        `请使用 penguin-config 技能，把上面的密钥写进智能体 ${agentId} 的保险柜（Project ${projectId}）：`,
        "- 下面每条命令都要带 `--root <数据根目录>`，即环境信息中 App Data Dir 的上级目录。命令的环境里没有这个值，不带 `--root` 会写到另一个数据根目录，这个智能体的保险柜仍然是空的。",
        `- 每个密钥执行一次 \`penguin config vault set --key <键名> --value <值> --agent-id ${agentId} --project-id ${projectId} --root <数据根目录>\`；只需创建键名时，值先填占位符 TODO，并告诉我该键的用途与申请地址。`,
        "- 不要在回复里复述任何值，不要读取 .vault.toml。",
        `- 最后运行 \`penguin config vault list --agent-id ${agentId} --project-id ${projectId} --root <数据根目录>\` 列出键名。`,
      ].join("\n"),
    /** Prompt-injection controls (toggle card / template alert / prompt editor), mirroring the memory tab's set. */
    injection: {
      enable: "启用密钥保险柜",
      templateMissing: "提示词模板中没有 {{VAULT}} 占位符，保险柜小节不会进入上下文。",
      legacyTemplate:
        "模板仍是旧版硬编码的 # Vault 段落：一键迁移会将该段落原位替换为 {{VAULT}} 占位符，措辞不变，此后可在下方编辑。",
      insertPlaceholder: "插入 {{VAULT}} 占位符",
      migrate: "迁移为 {{VAULT}} 占位符",
      promptSection: "保险柜提示词",
      promptSectionHint: "注入模板 {{VAULT}} 占位符的内容；开关关闭或模板无占位符时不注入。",
      promptLabel: "提示词",
      promptPlaceholders: [
        ["{{VAULT_KEYS}}", "保险柜键名列表（每键一行「- KEY」，仅键名，值永不注入；无键时为空）"],
      ] as ReadonlyArray<readonly [string, string]>,
    },
  },

  schedule: scheduleZh,

  /** Plugin library page (features/plugins/plugins-page.tsx): one card per library plugin, installed on Agents as a whole. */
  plugins: pluginsZh,

  /** Agent settings "Hooks" tab (features/agents/hooks-tab.tsx): the hook packages installed on one Agent — the list with its enable switch, the import modal (chat import / zip upload) and the export. The hook-point chips carry the bare point name (`stop`, `user_prompt`) and need no string. */
  hooks: {
    agentTabDesc:
      "该 Agent 已安装的钩子包（agent_state/hooks/）：harness 在循环的钩子点运行的脚本，例如每个 Task 结束后。卸载会删除整个钩子包目录。",
    agentTabEmpty: "尚未安装任何钩子包",
    /** Members see the switch state but cannot flip it (appended to the tab description). */
    readOnlyHint: "启用钩子的开关仅 Project owner 可用。",
    /** The agents page's hook-count stat (hover title / accessible name). */
    hookCount: (n: number): string => `${n} 个钩子包`,
    exportHook: "打包导出",
    importHook: "导入钩子",
    importChatTitle: "推荐：让 Agent 在对话中导入",
    importChatWhy:
      "Agent 会通读来源、逐个审查脚本，再把钩子包安装到该 Agent 上，比直接上传更可靠。",
    importSourceLabel: "钩子来源",
    importSourceHint:
      "支持 URL / GitHub 仓库 / 本地路径 / 一段描述，或其他工具的钩子配置（如 Claude Code settings.json 的 hooks 块）",
    importSourcePlaceholder: "https://…、/path/to/hooks，或「写一个 stop 钩子：每次任务结束后…」",
    /** Preview placeholder shown in the generated prompt before a source is entered. */
    importSourceToken: "<来源>",
    importPromptLabel: "发送给 Agent 的 Prompt（预览）",
    /** Lead sentence for a URL / repo / path source; free text (a description, a pasted hooks config) is used verbatim as the lead instead. Composed with importPromptTail by buildHookImportPrompt (features/agents/hook-import.ts). */
    importPromptLead: (s: string): string => `把 ${s} 导入为钩子包。`,
    importCopyPrompt: "复制 Prompt",
    importOpenChat: "打开新对话",
    importUploadTitle: "上传钩子包 zip",
    importUploadDesc:
      "zip 根目录为 hooks.json 与脚本，或仅含一个内含它们的顶层目录。导入即生效：只要该 Agent 启用了钩子，其脚本就会在本机的钩子点运行，请只导入可信的包。",
    importUploadAction: "选择 zip 文件",
    importUploading: "上传中…",
    importDoneToast: "钩子包已安装",
    importOverwriteTitle: "覆盖已安装钩子包",
    importOverwriteBody: (name: string): string =>
      `钩子包「${name}」已存在，覆盖安装将替换其全部文件（含本地改动），不可恢复。确认继续？`,
    importOverwriteAction: "覆盖安装",
    /** The fixed tail joined after the lead (features/agents/hook-import.ts): the review step, the package format, the script contract and the install target, named by Project and Agent id. */
    importPromptTail: (projectId: string, agentId: string): string =>
      [
        "先完整阅读来源，逐个审查脚本有没有恶意行为（外传数据、改动来源之外的文件、执行来路不明的命令等），确认安全后再继续。",
        '然后产出一个 PenguinHarness 钩子包：一份 hooks.json（name、description、description_zh、version（格式 YYYY.MM.DD.N），以及各钩子点的命令列表 stop / pre_tool_use / user_prompt，每项为 { "command": "<脚本相对路径>", "timeout": <秒> }）加上纯 Node 的 .mjs 脚本（只用内置模块）。',
        '脚本契约：stdin 收到一份 JSON——stop 点为 { "hook": "stop", "session_id", "trace_path" }（trace_path 是 Session 正在写入的 Trace 文件，无 Trace 时缺省），pre_tool_use 点另有 tool_name、tool_call_id、arguments（原始参数 JSON 串），user_prompt 点则是 scratchpad_dir 与 prompt；stdout 为空即无意见，否则一份 JSON 回答——stop 点 { "decision": "continue" | "stop", "input", "reason", "output", "subagent"? }，pre_tool_use 点 { "decision": "allow" | "deny", "reason", "output" }，user_prompt 点 { "context" }；退出码非零、stdout 不是 JSON 或超时都按失败记录、不采纳。',
        `把它安装到 Project「${projectId}」中 Agent「${agentId}」的 agent_state/hooks/<name>/ 目录（目录名即包名，须匹配 ^[A-Za-z0-9_-]+$），最后向我说明它做什么、在哪个钩子点触发。`,
      ].join("\n"),
    uninstallConfirmTitle: (name: string): string => `卸载 ${name}`,
    uninstallConfirmBody: (name: string, agent: string): string =>
      `确定从 ${agent} 卸载钩子包 ${name} 吗？其全部脚本（含本地改动）将被删除。`,
    uninstalledToast: (name: string, agent: string): string => `已从 ${agent} 卸载钩子包 ${name}`,
    /** The Agent-level switch card at the top of the tab (usePromptInjection); hooks have no prompt half. */
    injection: {
      enable: "启用钩子",
      enableHint:
        "开启后，该 Agent 新建的 Session 会在钩子点运行全部已安装的钩子包；关闭后新建的 Session 不运行任何钩子，已安装的包仍保留在磁盘上。进行中的 Task 保持开始时的设置。",
      savedToast: "已保存，自下一轮对话起生效",
    },
  },

  pluginRegistry: {
    pageTitle: "插件市场",
    empty: "暂无插件",
    /** Card metadata: the entry's package specifier doubles as the install string. */
    specifierHint: "包名，即 Project 插件列表里写的那串",
    back: "返回插件市场",
    readme: "说明文档",
    noReadme: "该插件暂无说明文档。",
    notFound: "找不到这个插件。",
    /** Shown above the list when a source answered with nothing, so a short list is not read as a complete one. */
    sourceUnavailable: (count: number): string =>
      count === 1
        ? "有 1 个插件来源无法访问，下面的列表可能不完整。"
        : `有 ${count} 个插件来源无法访问，下面的列表可能不完整。`,
    repository: "源码仓库",
    homepage: "主页",
    authors: "作者",
    license: "许可证",
    copySpecifier: "复制包名",
    installHint: "在插件市场页安装：该行的「安装」按钮会为当前 Project 要求它。",
  },

  skills: skillsZh,

  chat: chatZh,

  /** Feishu-channel strings of the messaging binding editor (channel-neutral ones live under `messaging`). */
  feishu: {
    /** The what-binding-does FAQ fold's body (this channel's flavor). */
    intro:
      "绑定后，发给飞书机器人的消息会进入本对话，AI 的回复会以纯文本发回飞书。需要一个开通了机器人能力、订阅了接收消息事件（长连接方式）的飞书自建应用。",
    appId: "App ID",
    appSecret: "App Secret",
    /** Shown while a saved secret exists: submitting an empty field keeps it. */
    appSecretKeepHint: "留空保持已保存的 App Secret 不变",
    /** The stored-secret row's clear checkbox (the models-page clear idiom). */
    clearSecret: "清除已存 App Secret",
    baseDomain: "API 域名",
    baseDomainHint: "飞书为 https://open.feishu.cn，Lark 为 https://open.larksuite.com",
    invalidDomain: "域名需为 http(s):// 地址",
    /** Why "send test message" is disabled before the bot has ever been messaged. */
    testMessageNoChat: "先在飞书中给机器人发一条消息，机器人才知道要发到哪个会话",
    /** The setup FAQ fold's steps. */
    setupSteps: [
      "在飞书开发者后台创建一个企业自建应用",
      "为应用开通机器人能力",
      "订阅「接收消息」事件，事件订阅方式选择「长连接」",
      "在「凭证与基础信息」页取得 App ID 与 App Secret，填入上方表单",
      "发布应用版本并通过审核，然后在飞书中给机器人发一条消息",
    ],
  },

  /** Telegram-channel strings of the messaging binding editor (channel-neutral ones live under `messaging`). */
  telegram: {
    /** The what-binding-does FAQ fold's body (this channel's flavor). */
    intro:
      "绑定后，发给 Telegram 机器人的消息会进入本对话，AI 的回复会以纯文本发回 Telegram。用 @BotFather 创建机器人并粘贴其 Bot Token 即可，无需公网地址。",
    botToken: "Bot Token",
    /** Shown while a saved token exists: submitting an empty field keeps it. */
    botTokenKeepHint: "留空保持已保存的 Bot Token 不变",
    /** The stored-token row's clear checkbox (the models-page clear idiom). */
    clearToken: "清除已存 Bot Token",
    /**
     * The Bot Token field's corner link. Telegram has no developer console — the token is
     * issued by @BotFather inside the app — so this channel names the destination instead
     * of borrowing the shared "open developer console" label.
     */
    openBotFather: "打开 @BotFather",
    invalidToken: "Bot Token 形如「数字:密钥」，由 @BotFather 签发",
    /** Why "send test message" is disabled before the bot has ever been messaged. */
    testMessageNoChat: "先在 Telegram 中给机器人发一条消息，机器人才知道要发到哪个会话",
    /** The setup FAQ fold's steps. */
    setupSteps: [
      "在 Telegram 中打开 @BotFather，发送 /newbot 创建机器人",
      "按提示取名后，复制 @BotFather 返回的 Bot Token，填入上方表单",
      "在 Telegram 中找到这个机器人，给它发一条消息",
    ],
  },

  /** QQ-channel strings of the messaging binding editor (channel-neutral ones live under `messaging`). */
  qq: {
    /** The what-binding-does FAQ fold's body (this channel's flavor). */
    intro:
      "绑定后，在 QQ 中发给机器人的消息会进入本对话，AI 的回复会发回 QQ。需要在 QQ 开放平台创建一个机器人，事件订阅方式选择 WebSocket，无需公网地址。",
    appId: "App ID",
    appSecret: "App Secret",
    /** Shown while a saved secret exists: submitting an empty field keeps it. */
    appSecretKeepHint: "留空保持已保存的 App Secret 不变",
    /** The stored-secret row's clear checkbox (the models-page clear idiom). */
    clearSecret: "清除已存 App Secret",
    /** Why "send test message" is disabled before the bot has ever been messaged. */
    testMessageNoChat: "先在 QQ 中给机器人发一条消息，机器人才知道要发到哪个会话",
    /**
     * The rule that shapes this whole channel, stated where it is first needed rather than
     * left for the user to infer from a reply that never arrives.
     */
    repliesOnly:
      "QQ 只允许机器人回复你刚发出的消息，不允许主动发消息。因此：在网页端发起的对话不会同步到 QQ；距离你上一条 QQ 消息过去几分钟后，回复也发不出去。想继续对话，在 QQ 里再发一条消息即可。",
    /** The passive-reply budget, in the terms a user experiences it. */
    replyBudget:
      "同一条 QQ 消息最多能收到 4 条回复（群聊 5 条）。一次运行产生的消息更多时，最后一条会把余下内容合并发出——内容不会丢失，只是合并成一条。",
    /** Scan-to-connect: the button, and the states it moves through. */
    scanStart: "扫码连接",
    scanStarting: "生成二维码…",
    /** In the setup fold: what scanning saves the user, in one line. */
    scanHint: "也可以扫码连接：用 QQ 扫码授权，无需手动填写 App ID 与 App Secret。",
    scanQrLabel: "QQ 机器人授权二维码",
    scanWaiting: "等待在 QQ 中扫码…",
    scanSteps: "用手机 QQ 扫描二维码，在打开的页面里选择要授权的机器人并确认。",
    /** Shown only after a code has actually lapsed and been replaced. */
    scanRefreshed: "上一个二维码已过期，这是新的。",
    /** Why the secret is safe to obtain this way — the question a careful user will ask. */
    scanPrivacy: "凭据由服务端直接接收并保存，解密密钥不会进入浏览器。",
    scanDone: (appId: string): string => `已保存机器人 ${appId} 的凭据，可以启用连接了`,
    scanFailed: (reason: string): string => `扫码连接失败：${reason}`,
    /** Shown when replacing lapsed codes stopped being worth another round trip. */
    scanExpiredRepeatedly: "二维码多次在扫描前就已过期。请稍后重新发起扫码。",
    /** Why the scan button is gated while this channel holds the connection. */
    scanDisableFirst: "先停用连接，再重新扫码绑定",
    /** Separates the scan path from the manual one; the fields below are the fallback, not the default. */
    scanOrManual: "或手动填写",
    /** The setup FAQ fold's steps. */
    setupSteps: [
      "在 QQ 开放平台注册开发者，创建一个机器人",
      "在「开发设置」页取得 App ID 与 App Secret，填入上方表单",
      "在「开发配置」中把事件订阅方式设为 WebSocket，无需填写回调地址",
      "在沙箱配置中把自己的 QQ 号或测试群加入白名单",
      "在 QQ 中找到这个机器人，给它发一条消息",
    ],
  },

  /** WeChat-channel strings of the messaging binding editor (channel-neutral ones live under `messaging`). */
  wechat: {
    /** The what-binding-does FAQ fold's body (this channel's flavor). */
    intro:
      "绑定后，在微信中发给机器人的消息会进入本对话，AI 的回复会发回微信。用微信扫码授权即可完成绑定，无需公网地址，也无需在任何后台申请凭据。",
    /** The stored-token row's clear checkbox (the models-page clear idiom). */
    clearToken: "清除已存 Bot Token",
    /** Why this channel's form has no credential fields at all. */
    scanOnly: "微信机器人的凭据只能通过扫码授权获得，没有可手动填写的 App ID 或密钥。",
    /** Why "send test message" is disabled before the bot has ever been messaged. */
    testMessageNoChat: "先在微信中给机器人发一条消息，机器人才知道要发到哪个会话",
    /**
     * The channel's shape, stated below its controls rather than left in a collapsed fold:
     * a user who binds it and then writes in a group sees nothing arrive.
     */
    directOnly: "这个渠道只支持与机器人的单聊，收不到群聊消息。",
    /** What travels, and the one inbound kind that does not. */
    media:
      "文字、图片和文件都能双向传输。语音消息按微信自带的语音转文字结果进入对话，微信没能转写的语音则无法处理。",
    /** Scan-to-connect: the button, and the states it moves through. */
    scanStart: "扫码连接",
    /** The same control once a binding exists: scanning again replaces the stored credential. */
    scanRescan: "重新扫码",
    scanStarting: "生成二维码…",
    scanQrLabel: "微信机器人授权二维码",
    scanWaiting: "等待在微信中扫码…",
    scanSteps: "用手机微信扫描二维码，然后在手机上确认授权。",
    /** Scanned but not yet confirmed: the phone is waiting, not this panel. */
    scanScanned: "已扫码，请在手机上确认授权。",
    /** Shown only after a code has actually lapsed and been replaced. */
    scanRefreshed: "上一个二维码已过期，这是新的。",
    /** Why the credential is safe to obtain this way — the question a careful user will ask. */
    scanPrivacy: "凭据由服务端直接接收并保存，不会经过浏览器。",
    scanDone: (botId: string): string => `已保存机器人 ${botId} 的凭据，可以启用连接了`,
    scanFailed: (reason: string): string => `扫码连接失败：${reason}`,
    /** Shown when replacing lapsed codes stopped being worth another round trip. */
    scanExpiredRepeatedly: "二维码多次在扫描前就已过期。请稍后重新发起扫码。",
    /** The platform stopped accepting pairing codes for this scan. */
    scanBlocked: "配对码输入错误次数过多，本次扫码已作废。请稍后重新发起扫码。",
    /** Not a failure: the bot is already bound here, so no new credential was issued. */
    scanAlreadyBound:
      "这个机器人已经被绑定——可能在本服务，也可能在别处，因此没有签发新的凭据。如果该由本会话持有它，请先在正在使用它的地方解绑，再重新扫码。",
    /** Why the scan button is gated while this channel holds the connection. */
    scanDisableFirst: "先停用连接，再重新扫码绑定",
    /** The pairing-code step: WeChat shows digits on the phone that must be typed here. */
    verifyPrompt: "手机上显示了一组数字，输入它以继续连接：",
    verifyLabel: "配对码",
    verifySubmit: "确认",
    verifySubmitting: "提交中…",
    /** The setup FAQ fold's steps. */
    setupSteps: [
      "点击上方的「扫码连接」，生成授权二维码",
      "用手机微信扫描这个二维码",
      "如果手机上显示了一组数字，把它输入到面板中",
      "在手机上确认授权，凭据会自动保存",
      "在微信中找到这个机器人，给它发一条消息",
    ],
  },

  /** Discord-channel strings of the messaging binding editor (channel-neutral ones live under `messaging`). */
  discord: {
    /** The what-binding-does FAQ fold's body (this channel's flavor). */
    intro:
      "绑定后，私聊 Discord 机器人的消息、以及在服务器频道或子区里 @ 它的消息会进入本对话，AI 的回复会发回同一个频道。在 Discord 开发者后台创建应用、添加机器人并粘贴其 Token 即可，无需公网地址。",
    botToken: "Bot Token",
    /** Shown while a saved token exists: submitting an empty field keeps it. */
    botTokenKeepHint: "留空保持已保存的 Bot Token 不变",
    /** The stored-token row's clear checkbox (the models-page clear idiom). */
    clearToken: "清除已存 Bot Token",
    /** The Bot Token field's corner link: the developer portal's application list. */
    openPortal: "前往开发者后台",
    invalidToken: "Bot Token 形如三段以点分隔的字符串，从开发者后台的 Bot 页复制",
    /** Why "send test message" is disabled before the bot has ever been messaged. */
    testMessageNoChat: "先在 Discord 中给机器人发一条消息，机器人才知道要发到哪个频道",
    /**
     * The rule that cannot wait for a collapsed fold: a server channel delivers only messages
     * that @-mention the bot, so a user who writes without the mention sees nothing arrive.
     */
    mentionOnly: "在服务器频道或子区里，机器人只读取 @ 它的消息；私聊消息则原样送达。",
    /** The setup FAQ fold's steps. */
    setupSteps: [
      "打开 Discord 开发者后台，创建应用，在其 Bot 页重置并复制 Token，填入上方表单",
      "在 OAuth2 → URL Generator 中勾选 bot 范围与 Send Messages、Read Message History、Attach Files 权限，打开生成的链接把机器人加入你的服务器",
      "在频道里 @ 这个机器人，或直接私聊它",
    ],
  },

  /**
   * Session ↔ messaging-bot binding: the dock panel, the row action + dialog, and the
   * channel-neutral editor strings (per-channel fields live under `feishu` / `telegram` /
   * `qq` / `wechat` / `discord`).
   */
  messaging: messagingZh,

  /** Subagents side panel: call-graph of the latest Task + the selected child conversation. */
  subagentPanel: {
    topologyLabel: "调用关系",
    mainSessionNote: "主会话请在对话区查看",
    empty: "本次任务尚未派生子智能体",
    nodeRunning: "运行中",
    nodeDone: "已完成",
    /** Identity-strip jump: opens the selected subagent's own Session in the chat area. */
    openAsSession: "跳转到该会话",
    /** The child's session record no longer exists and could not be revived. */
    subagentGone: "该子会话已不存在，无法恢复",
  },

  files: {
    title: "文件",
    upload: "上传",
    download: "下载",
    /** Desktop shell's own window only: opens the previewed file's directory in the OS file manager. */
    revealInFolder: "在文件夹中显示",
    /** Row / preview context menu: the two entries both kinds carry, then the kind-specific one. */
    copyPath: "复制相对路径",
    addToChat: "添加到对话",
    addSelectionToChat: "将选中内容添加到对话",
    uploadHere: "上传到此文件夹",
    openInNewTab: "新页面打开",
    previewNotIsolatedHint:
      "当前访问地址无法提供独立预览源，页面将以沙箱模式打开：localStorage、Cookie 与第三方 embed 不可用。经 127.0.0.1 或 localhost 访问，或配置 PENGUIN_PREVIEW_ORIGIN 即可解除。",
    refresh: "刷新",
    /** The Workspace root, as the breadcrumbs and the drop overlay name it. "." is what a
     *  shell calls the working directory, so it needs no translation. */
    root: ".",
    empty: "空目录",
    previewUnsupported: "该类型不支持预览，请下载查看",
    uploadedCount: (n: number): string => `已上传 ${n} 个文件`,
    uploading: (done: number, total: number): string => `正在上传 ${done}/${total}…`,
    /** Oversize picks are named and skipped before anything is read. */
    uploadTooLarge: (names: string, mb: number): string =>
      `超过 ${mb}MB 上传上限，已跳过：${names}`,
    /** A dropped folder is not a file the upload endpoint can take; it is named and skipped. */
    folderDropSkipped: (names: string): string => `不支持上传文件夹，已跳过：${names}`,
    /** Upload-overwrite confirmation: same-name files in the target directory will be replaced. */
    overwriteTitle: "覆盖同名文件",
    overwriteConfirm: (n: number): string => `目标目录已存在以下 ${n} 个同名文件，上传将覆盖：`,
    loadFailed: "加载失败",
    previewTruncated: "内容过大，预览已截断，请下载查看完整文件",
    htmlRendered: "预览",
    htmlSource: "源码",
    backToList: "返回列表",
    /** The tree pane: its accessible name and the toolbar toggle's two states. */
    treeLabel: "文件树",
    showTree: "显示文件树",
    hideTree: "隐藏文件树",
    /** The divider between the tree and the preview: drag, or nudge with the arrow keys. */
    treeWidth: "调整文件树宽度",
    /** The search box above the tree; it reaches only as far as the lazy tree has been loaded. */
    searchPlaceholder: "搜索文件",
    searchClear: "清除搜索",
    searchNoMatch: "Workspace 中没有匹配项",
    /** The walk is server-side and covers the whole Workspace, so it is not instant on a large one. */
    searching: "搜索中…",
    /** The server stopped at its cap: what is listed is the shallowest matches, not all of them. */
    searchTruncated: (n: number): string => `匹配项过多，仅显示最靠前的 ${n} 条`,
    selectFile: "选择一个文件以预览",
    /** Drop overlay label; `dir` is the directory the files will land in (the root's display name for the root). */
    dropToUpload: (dir: string): string => `松开即上传到 ${dir}`,
    /** In-place text editing. */
    editorLabel: (name: string): string => `编辑 ${name}`,
    /** Soft-wrap toggle, shared by the source view and the editor: off means long lines scroll sideways. */
    wrapLines: "自动换行",
    unsaved: "有未保存的修改",
    saveTitle: "保存（Ctrl+S / ⌘S）",
    saveConfirmTitle: "保存文件",
    saveConfirm: (name: string): string => `保存对 ${name} 的修改？Workspace 中的该文件将被覆盖。`,
    editTooLarge: (kb: number): string => `文件超过 ${kb}KB，无法在此编辑，请下载后编辑`,
    saveTooLarge: (mb: number): string => `内容超过 ${mb}MB 写入上限，未保存`,
    discardTitle: "放弃未保存的修改",
    discardBody: (name: string): string => `${name} 有未保存的修改，放弃这些修改？`,
    discard: "放弃",
    unsavedRestored: (name: string): string => `已恢复 ${name} 的未保存修改`,
    /** The file was rewritten (by the Agent, most likely) while the editor was open on it. */
    changedOnDisk: "磁盘上已变更",
    changedOnDiskHint: "该文件在你打开之后已被重写，保存会用你的版本覆盖它。",
    /** Rename and move are one action: both write the file to a new Workspace-relative path. */
    /** The composer chip's remove button, for whatever the Files panel staged there. */
    removeReference: "移除引用",
    renameTitle: "重命名 / 移动",
    renameLabel: "新的路径",
    renameHint: "相对 Workspace 根目录；路径中不存在的目录会自动创建",
    renameConfirm: "移动",
    renameTargetExists: (path: string): string => `${path} 已存在，未做改动。`,
    renamed: (name: string): string => `已移动到 ${name}`,
    deleteTitle: "删除文件",
    deleteBody: (name: string): string => `删除 ${name}？该文件不会进入回收站。`,
    deleted: (name: string): string => `已删除 ${name}`,
    /** Both actions read the file's current version first; until it lands there is nothing to refuse an overwrite with. */
    actionVersionReading: "正在读取该文件的当前版本…",
    actionVersionFailed: "读不到该文件的当前版本，因此不执行此操作。",
    /** The version precondition refused it: the Agent wrote the file while the question was on screen. */
    changedBeforeAction: (name: string): string =>
      `${name} 在你决定期间被改写（多半是 Agent 在本轮写入的），因此未做任何改动。刷新后可重试。`,
    conflictTitle: "文件在磁盘上已变更",
    conflictBody: (name: string): string =>
      `${name} 在你打开之后被重写（多半是 Agent 本轮写的），本次没有保存任何内容。可以用你的版本覆盖它，也可以继续编辑、先把需要的内容取出来——两种选择都会保留你的文本。`,
    overwriteAnyway: "仍然覆盖",
  },

  usage: usageZh,

  /** The Trace panel's own view of a Trace file (trace-file-view / timeline-chart); the standalone browsing page these once also served is gone. */
  traces: tracesZh,

  benchmark: benchmarkZh,

  // Server error code → localized copy (the server's message is hardcoded Chinese; this is only a fallback for unknown codes).
  /** Company mode: the organization switcher and dialogs, and the six organization pages. */
  company: companyZh,
  errors: {
    networkError: "网络错误，请检查连接",
    modelCredentialMissing: (modelId: string) =>
      `模型 ${modelId} 还没有可用的 API key，请先在「模型」页为它配置`,
    noDefaultModel: "该 Project 还没有默认模型，请先在「模型」页添加模型并设为默认",
    /** Localized text for the common server error codes (server error messages are English-only); looked up by ApiError.code in apiErrorText, falling back to the raw message for unmapped codes. */
    byCode: {
      invalid_credentials: "用户名或密码错误。",
      too_many_attempts: "登录失败次数过多，请稍后重试。",
      password_mismatch: "当前密码不正确。",
      invalid_password: "密码至少 8 位。",
      admin_required: "仅管理员可执行此操作。",
      desktop_single_user: "桌面应用为单用户模式，用户管理不可用。",
      not_found: "资源不存在，或你没有访问权限。",
      internal: "服务器内部错误，请稍后重试。",
      agent_not_found: "该 Agent 已不存在。",
      unknown_agent: "该 Agent 不存在于本 Project。",
      agent_exists: "该 Agent id 已被占用。",
      agent_deleting: "该 Agent 正在删除中。",
      project_exists: "该 Project id 已被占用。",
      project_not_found: "该 Project 已不存在，或你没有访问权限。",
      modelscope_refresh_failed: "魔搭授权连续自动续期失败，请在「模型」页重新授权。",
      cannot_delete_last_project: "这是最后一个 Project，不能删除。",
      user_exists: "该用户名已被占用。",
      user_not_found: "该用户已不存在。",
      cannot_delete_admin: "内置 admin 不可删除。",
      member_not_found: "该用户不是本 Project 的成员。",
      already_member: "该用户已是本 Project 的成员。",
      already_owner: "该用户已是本 Project 的所有者。",
      memory_import_confirm_required: "本次导入会覆盖或删除已有记忆，请确认后继续。",
      schedule_exists: "已存在同名定时任务。",
      schedule_not_found: "该定时任务已不存在。",
      unknown_skill: "所选目录下没有这个技能。",
      unknown_plugin: "该插件不在插件库中。",
      goal_plugin_not_installed:
        "目标模式需要 goal 插件——请先在插件库中为该 Agent 安装，并确认其钩子包已启用。",
      skill_too_large: "该技能目录过大，超出了导入限制。",
      hook_too_large: "该钩子包过大，超出了导入限制。",
      file_not_found: "该文件已不存在。",
      not_pending: "该插话已随本轮送达模型，无法撤回。",
      follow_up_started: "该跟进消息已开始发送，无法撤回。",
      file_too_large: "文件过大。",
      too_many_files: "一条消息附加的文件过多。",
      payload_too_large: "请求体过大。",
      image_too_large: "图片过大，无法随对话发送。",
      dir_not_absolute: "目录必须是绝对路径。",
      dir_not_found: "该目录不存在或不可访问。",
      not_a_dir: "该路径不是目录。",
      path_not_found: "该路径不存在。",
      reveal_failed: "无法打开文件夹。",
      workspace_missing: "该 Session 的 Workspace 已不存在。",
      workspace_not_found: "该 Workspace 不存在或不是目录。",
      session_not_found: "该 Session 已不存在，或你没有访问权限。",
      session_deleting: "该 Session 正在删除中。",
      approval_not_found: "该授权请求已处理或已失效。",
      process_not_found: "该后台进程已结束或已被移除。",
      process_running: "该后台进程仍在运行，请先结束再移除。",
      memory_file_not_found: "该记忆文件已不存在。",
      memory_scope_not_found: "该记忆范围已不存在。",
      task_in_progress: "该 Session 已有任务在运行。",
      compacting: "该 Session 正在压缩上下文，暂不接受新的输入。",
      shutting_down: "服务正在关闭，请稍后重试。",
      platform_rate_limited: "平台授权请求过于频繁，请等待倒计时结束后重试。",
      // The three "cannot compact" reasons each have their own server code, so each keeps its
      // own explanation here — collapsing them into one sentence would tell a user who just
      // compacted that they have never spoken.
      compaction_not_configured: "该 Agent 没有配置上下文压缩。",
      nothing_to_compact: "当前上下文还没有可压缩的内容（尚未完成一轮对话）。",
      already_compacted: "刚刚压缩过，之后还没有新的对话，无需重复压缩。",
      version_conflict: "快照版本不高于当前版本。",
      invalid_title: "标题无效。",
      invalid_proxy_url: "代理地址无效：应为 http(s):// 或 socks5:// 代理 URL，或 主机[:端口]。",
      invalid_attachment_limit: "上传限制无效：请填写允许范围内的整数 MB，且合计不低于单个上限。",
      invalid_trace: "该文件不是有效的 Trace 文件。",
      trace_not_found: "该 Trace 文件已不存在。",
      trace_session_exists: "该 Agent 已存在同名 Session，无法导入重复的 Trace。",
      feishu_secret_required: "需要填写 App Secret。",
      feishu_not_bound: "该 Session 尚未绑定飞书。",
      feishu_no_chat: "尚未收到飞书消息：先在飞书中给机器人发一条消息。",
      feishu_send_failed: "飞书消息发送失败。",
      telegram_token_required: "需要填写 Bot Token。",
      telegram_token_invalid: "Bot Token 格式不正确：应形如「数字:密钥」。",
      telegram_not_bound: "该 Session 尚未绑定 Telegram。",
      telegram_no_chat: "尚未收到 Telegram 消息：先在 Telegram 中给机器人发一条消息。",
      telegram_send_failed: "Telegram 消息发送失败。",
      discord_token_required: "需要填写 Bot Token。",
      discord_token_invalid: "Bot Token 格式不正确：应为三段以点分隔的字符串，从开发者后台复制。",
      discord_not_bound: "该 Session 尚未绑定 Discord。",
      discord_no_chat: "尚未收到 Discord 消息：先在 Discord 中给机器人发一条消息。",
      discord_send_failed: "Discord 消息发送失败。",
      another_channel_enabled: "该会话已启用另一渠道的连接：先停用它，再启用当前渠道。",
      // Deliberately names nothing about the other conversation: it may live in a Project
      // this user cannot see, and the remedy does not depend on knowing which one it is.
      account_enabled_elsewhere: "该机器人的连接已在另一个会话中启用：先在那边停用，再在此启用。",
      messaging_disable_before_clear: "先停用该渠道的连接，才能清除其凭证。",
      messaging_disable_before_scan: "先停用该渠道的连接，才能重新扫码绑定。",
      company_mode_off: "本服务器已关闭公司模式。",
      org_not_found: "该组织已不存在。",
      org_exists: "该组织 id 已被占用。",
      org_invalid: "该组织的配置文件需要修复，修好前不接受改动。",
      invalid_org_id: "组织 id 无效：2~64 位，小写字母开头，仅小写字母、数字与下划线。",
      employee_not_found: "该 Agent 不是本组织的员工。",
      employee_exists: "该 Agent 已是本组织的员工。",
      calendar_event_exists: "已存在同名日程。",
      calendar_event_not_found: "该日程已不存在。",
      desk_unavailable: "无法打开工位会话。",
      ticket_not_found: "该工单已不存在。",
      ticket_invalid: "该工单文件需要修复，修好前不接受改动。",
      ticket_session_failed: "无法发起工单会话。",
      handbook_file_not_found: "该文档已不存在。",
      handbook_index_required: "手册索引（README.md）不能删除。",
    },
  },
};

/** Dictionary shape (constrains the English dictionary so keys and function signatures line up). */
export type Strings = typeof zh;

/**
 * Runtime active dictionary (live binding): the locale Provider calls setActiveStrings
 * to switch before render, and remounts the whole tree keyed by locale so every `S.x`
 * read reflects the current language.
 */
export let S: Strings = zh;

export function setActiveStrings(next: Strings): void {
  S = next;
}
