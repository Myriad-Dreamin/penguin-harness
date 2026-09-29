/**
 * The agents module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `agent` section. A new string is added here, to both fragments, and
 * nowhere else — `AgentStrings` makes a key missing from `agentEn` a type error.
 */
export const agentZh = {
  /**
   * Toast after a save on this page: when the change reaches a Session. Core assembles the
   * Agent State into each model context, so a running conversation sees it only after its
   * next compaction; a new conversation starts with it.
   */
  savedTakesEffect: "已保存。新对话立即生效；进行中的对话在下一次压缩后生效。",
  /** Save feedback when the change touched compaction settings only: the engine re-reads them at every compaction checkpoint, so a running conversation does not have to reach one first. */
  savedTakesEffectNow: "已保存，立即生效（包括进行中的对话）。",
  /** Appended to an action's own toast (skill install / uninstall) — same timing statement. */
  takesEffectSuffix: "；新对话立即生效，进行中的对话在下一次压缩后生效",
  listTitle: "Agents",
  searchPlaceholder: "搜索 Agent：id / 名称 / 描述",
  searchEmpty: "没有匹配的 Agent",
  create: "创建 Agent",
  createTitle: "创建 Agent",
  id: "Agent id",
  idHint: "2~64 位：小写字母开头，仅小写字母、数字与下划线；创建后不可修改",
  /** The id field's generation clause: the create dialog's name field is labelled Name, not display name. */
  idGenerateHint: "；也可以从名称生成",
  nameHint: "留空则使用 Agent id 作为名称",
  description: "描述",
  /** Create dialog's skill picker: the library skills installed into the new Agent. */
  createPlugins: "插件",
  createPluginsPlaceholder: "未选择插件",
  createPluginsPicked: (n: number): string => `已选 ${n} 个插件`,
  createPluginsHint: "创建时安装到该 Agent（技能与钩子包），之后可在其「技能」「钩子」标签页增删",
  createPluginsEmpty: "插件库暂无可安装的插件",
  /** The directory-skills picker's trigger (the field's own label is createDirSkills). */
  createSkillsPlaceholder: "未选择技能",
  createSkillsPicked: (n: number): string => `已选 ${n} 个技能`,
  createDirSkills: "从项目目录导入技能",
  createDirSkillsPick: "未选择目录",
  createDirSkillsHint: "选择一个项目目录，读取其 .agents/skills 与 .claude/skills 下的技能",
  createDirSkillsEmpty: "该目录下没有可安装的技能",
  createDirSkillsFound: (n: number): string => `该目录下找到 ${n} 个技能`,
  createDirSkillsClear: "清除已选目录",
  /** Create dialog's optional snapshot seed: the new Agent starts from an exported package. */
  createSnapshot: "从快照初始化",
  createSnapshotPick: "选择快照包",
  createSnapshotHint:
    "选择导出的 Agent State 快照包（.tar.gz），新 Agent 以包内状态创建；名称与描述留空则沿用包内值",
  createSnapshotSkillsOff: "快照包自带技能与钩子，与插件选择互斥",
  createSnapshotClear: "移除已选快照包",
  /**
   * The "Create with AI" dialog, a separate surface from the create form above: its title, the
   * lead line, the prompt box's placeholder, the clickable examples and the fixed instruction
   * tail joined after the draft (composeAiPrompt). The tail follows the agent-initialization
   * skill's contract — a new agent under the current Project, only the skills it needs, no
   * other agent touched, the id reported at the end.
   */
  aiCreateTitle: "用 AI 创建 Agent",
  aiCreateIntro:
    "描述这个智能体要做什么、面向谁、产出什么；执行的智能体会用 agent-initialization 技能在当前 Project 里创建它。",
  aiCreatePlaceholder: "例如：创建一个帮我把会议录音整理成待办清单的智能体…",
  aiExamples: [
    {
      key: "jotting",
      label: "随记智能体",
      description: "零碎想法整理成一套 Markdown 文件体系",
      prompt:
        "创建一个随记智能体：我会不断向它发送零碎的想法和只言片语，它要在工作区里把这些内容整理成一套 Markdown 文件体系（按主题建文件、维护一个索引文件、合并重复内容、保留时间线），每次收到内容后回复归档到了哪个文件。",
    },
    {
      key: "finance",
      label: "金融 Copilot",
      description: "财报、行情与新闻的基本面与估值分析",
      prompt:
        "创建一个金融 Copilot 智能体：能读取我提供的财报、行情数据与新闻链接，做基本面与估值分析，用表格与要点输出结论，标注不确定性与数据来源，不给出直接的买卖建议。",
    },
    {
      key: "rag",
      label: "文档 RAG 智能体",
      description: "先给 docs/ 建索引，回答时引用出处",
      prompt:
        "创建一个文档问答智能体：我会把资料放进工作区的 docs/ 目录，它要先建立索引（按文件与章节写摘要），回答问题时引用具体文件与段落，没有依据时明确说不知道。",
    },
    {
      key: "research",
      label: "深度研究报告智能体",
      description: "提纲、多轮检索与交叉验证，产出带引用的报告",
      prompt:
        "创建一个深度研究报告智能体：给定一个课题，它要先制定研究提纲，多轮检索与阅读资料并交叉验证事实，最后在工作区生成一份带目录、引用与附录的 Markdown 报告。",
    },
    {
      key: "report-writer",
      label: "报告写作智能体",
      description: "零散材料整理成结构化报告；id 为 report-writer",
      prompt:
        "创建一个报告写作智能体，agent id 用 report-writer：擅长把零散材料整理成结构化的商业或技术报告（摘要、背景、分析、结论与建议），产出 Markdown 文件，并附一份写作检查清单。",
    },
  ],
  aiCreateTail: [
    "请使用 agent-initialization 技能，在当前 Project 中按上面的描述新建一个智能体：",
    "- 上面给了 agent id 就用它，否则取一个简短的语义 id（小写字母开头，可含数字、下划线或连字符）；目标目录已存在时停下来告诉我，不要覆盖。",
    "- 以 default_agent 的 system_config.yaml 为底，设置它的 name、description 与 version，把角色与行为规则写进它的 agent_state/AGENTS.md。",
    "- 只从插件库（default_agent 已安装的技能目录）复制它真正需要的技能，不要多装。",
    "- 不要改动其他智能体；完成后按技能要求做校验。",
    "最后告诉我：新智能体的 id、安装了哪些技能，以及怎样开始和它对话（Agents 页该智能体卡片上的「新建对话」）。",
  ].join("\n"),
  /** The list's call to action while the Project has no agent beyond the built-in default. */
  firstAgentTitle: "还没有自己的智能体",
  firstAgentDesc: "描述你想要的智能体，让 AI 帮你创建；也可以手动配置。",
  installFromGist: "安装 Agent",
  installTitle: "安装 Agent",
  installDesc: "粘贴来源，先读取并检查，再选择新 Agent 的 id 安装。安装的是定义，不带任何状态。",
  installGist: "来源",
  installSourceHint:
    "支持：gist 链接或 id；npm:<包名>[@版本]；GitHub 仓库链接（默认分支，或 /tree/<分支>）；GitHub release 链接；git 地址（git+…、git@…、以 .git 结尾）；指向 tar.gz 的 http(s) 链接。仓库本身是一个 Agent 目录（有 agent_state/、workflows/）即可，不必带清单。",
  installKind: "来源类型",
  installKindAuto: "自动识别",
  installKindGithub: "GitHub 仓库",
  installKindRelease: "GitHub release",
  installKindUrl: "tar.gz 链接",
  installRead: "读取",
  installReading: "读取中…",
  installChangeGist: "换一个来源",
  install: "安装",
  installing: "安装中…",
  installed: (agentId: string) => `已安装 Agent ${agentId}`,
  packageSummary: (files: number, size: string) => `${files} 个文件 · ${size}`,
  packagedBy: (version: string) => `由 PenguinHarness ${version} 打包`,
  packageExcludes: "不包含：记忆、工作区、工作流的 state.json、版本历史、密钥库。",
  publishToGist: "发布到 gist",
  publishTitle: "发布到 GitHub gist",
  publishDesc:
    "把这个 Agent 的定义作为一组可读的文本文件发布到 gist；别人（或另一台机器）可以从它安装出一个干净的同款 Agent。",
  publishNoToken:
    "服务器还没有 GitHub 身份，无法发布：在服务器上用 `gh auth login`（需要 gist 权限）登录，或由管理员在 设置 → 分享 里存一个 token。",
  publishGistId: "改发布到另一个 gist",
  publishGistIdPlaceholder: "留空即可",
  publishGistIdHint:
    "留空时：内容有变化才更新这个 Agent 自己的 gist，没变化则不发请求；从未发布过则新建。填入链接或 id 会改用那个 gist，并强制发布一次（gist 被删或被手改时用它）。",
  publishPublic: "公开 gist",
  publishViaGh: "将以服务器上 gh CLI 已登录的身份发布。",
  publishViaToken: "将以服务器保存的 GitHub token 发布。",
  publishUpdates: "将更新：",
  publishUnchanged: "gist 已经是这个内容，未做改动（也没有调用 API）。",
  publish: "发布",
  publishUpdate: "更新 gist",
  publishing: "发布中…",
  published: (files: number, size: string) => `已发布 ${files} 个文件（${size}）。`,
  sessionCount: (n: number): string => `${n} 个 Session`,
  toolCount: (n: number): string => `${n} 个工具`,
  vaultKeyCount: (n: number): string => `${n} 个密钥`,
  scheduleCount: (n: number): string => `${n} 个定时任务`,
  memoryCount: (n: number): string => `${n} 条记忆`,
  updatedAt: "最后修改",
  activity: (days: number): string => `近 ${days} 天 Session 活跃度`,
  settings: "Agent 设置",
  backToList: "返回 Agents",
  tabOverview: "概览",
  tabPrompt: "系统提示词",
  tabMemory: "记忆",
  tabRuntime: "运行参数",
  tabTools: "工具",
  tabSkills: "技能",
  tabHooks: "钩子",
  tabVault: "密钥保险柜",
  tabSchedules: "定时任务",
  stateDir: "State 路径",
  copyStateDir: "复制 State 路径",
  agentsMd: "AGENTS.md",
  systemPrompt: "system_prompt 模板",
  placeholdersTitle: "可用占位符（点击插入）",
  insertPlaceholder: "插入到 system_prompt 光标处",
  /** Order must match the default system prompt (core default-config.ts DEFAULT_SYSTEM_PROMPT). Inner tokens ({{VAULT_KEYS}} 等) live in each feature tab's promptPlaceholders instead. */
  placeholders: [
    ["{{AGENTS_MD}}", "注入 AGENTS.md 内容"],
    ["{{VAULT}}", "注入保险柜区块（vault.prompt，含键名清单）；开关关闭时为空"],
    ["{{SKILLS}}", "注入技能区块（skills.prompt，含已安装技能元数据）；开关关闭时为空"],
    [
      "{{MEMORY}}",
      "注入记忆区块：memory.prompt 加 memory.workspace_prompt（仅持久工作区）；关闭记忆时为空",
    ],
    ["{{SCHEDULES}}", "注入定时任务区块（schedules.prompt，含任务名清单）；开关关闭时为空"],
    ["{{PLATFORM}}", "运行平台"],
    ["{{OS_VERSION}}", "操作系统版本"],
    ["{{SHELL}}", "命令执行使用的 Shell"],
    ["{{DATE}}", "当前日期"],
    [
      "{{PROJECT_DIR}}",
      "PenguinHarness 应用数据根目录（存放全部 Agent 数据与 Project 级数据；不是本次任务的工作目录）",
    ],
    ["{{AGENT_ID}}", "当前 Agent id"],
    ["{{CWD}}", "Workspace 绝对路径"],
    ["{{PROVIDER}}", "模型 provider 分组"],
    ["{{MODEL_ID}}", "上游模型 id"],
    ["{{SESSION_ID}}", "当前 Session id"],
  ] as ReadonlyArray<readonly [string, string]>,
  maxTurns: "max_turns（单 Task 最大轮次，-1 不限制）",
  maxTokens: "model.max_tokens",
  thinkingLevel: "model.thinking_level",
  /** Selectable tiers exclude `none` (many models cannot disable thinking); a stored `none` still displays — see `thinkingLevelNoneKept`. */
  thinkingLevelOptions: [
    ["", "不提交覆盖值，沿用当前生效的配置。"],
    ["low", "开启较低强度的扩展推理。"],
    ["medium", "开启中等强度的扩展推理（新建 Agent 的缺省档位）。"],
    ["high", "开启较高强度的扩展推理，响应更慢。"],
    ["xhigh", "在 high 之上再进一步的扩展推理，部分模型上效果与 high 相同。"],
    ["max", "开启最高强度的扩展推理，最慢，部分模型上效果与 xhigh 相同。"],
  ] as ReadonlyArray<readonly [string, string]>,
  /** Row description shown only while the stored config is `none`: displayed as-is, never rewritten, and no longer offered as a choice. */
  thinkingLevelNoneKept: "已存的历史档位：新选择不再提供关闭档（多数模型不支持关闭思考）。",
  timeoutMs: "model.timeoutMs",
  timeoutMsHint: "等待上游下一个事件的空闲上限，毫秒；不是整次请求的总时长上限",
  compaction: "上下文压缩（compaction）",
  maxContextLength: "max_context_length",
  maxContextLengthHint: "触发压缩的上下文阈值",
  maxSessionTurns: "max_session_turns",
  maxSessionTurnsHint: "触发压缩的轮数阈值",
  compactionMode: "mode（压缩方式）",
  compactionModeOptions: [
    ["", "不提交覆盖值，沿用当前生效的配置。"],
    ["summarize", "先让模型为旧上下文生成摘要，再从摘要续接新的上下文窗口（缺省）。"],
    ["discard", "不生成摘要，直接丢弃旧上下文，下一轮从新窗口重新开始。"],
  ] as ReadonlyArray<readonly [string, string]>,
  compactionPrompt: "prompt（摘要提示词）",
  maxTurnsInvalid: "max_turns 必须 > 0 或为 -1",
  timeoutInvalid: "timeoutMs 必须 > 0 或为 -1",
  toolFieldInvalid: (name: string, field: string) => `${name}: ${field} 必须是 > 0 的整数或 -1`,
  toolPermission: "permission",
  permissionReadLabel: "Read-only",
  permissionReadDescription: "仅读取。审批模式为 read-only 时自动放行，无需确认。",
  permissionReadWriteLabel: "Read & write",
  permissionReadWriteDescription: "可修改。审批模式为 read-only 时需人工确认。",
  toolTimeout: "timeoutMs",
  toolMaxOutput: "maxOutputLength",
  toolCallDescription: "call_description",
  callDescriptionHint:
    "call_description：开启（缺省）时该工具的 schema 保留可选的 description 参数——模型为每次调用写一句说明，运行期间展示给用户；关闭则装配时从 schema 滤除该参数。仅参数中定义了 description 属性的工具可切换。",
  mcpServers: "MCP Server",
  mcpDesc:
    "连接外部 MCP Server：其工具以 mcp__<name>__<tool> 并入本 Agent 的工具列表。此区块的改动即时保存。",
  mcpEmpty: "尚未配置 MCP Server",
  mcpAdd: "添加 MCP Server",
  mcpEditTitle: "编辑 MCP Server",
  mcpRemove: "删除",
  mcpName: "name",
  mcpNameHint: "工具名前缀：mcp__<name>__<tool>；限字母、数字、_ 和 -",
  mcpTransport: "transport",
  mcpTransportStdio: "本地进程：启动 command 后经 stdin/stdout 通信",
  mcpTransportHttp: "Streamable HTTP：当前规范的远程 transport",
  mcpTransportSse: "旧版 HTTP+SSE：仅为未迁移的服务保留",
  mcpTarget: "command / url",
  mcpCommand: "command",
  mcpArgs: "args",
  mcpArgsHint: "每行一个参数",
  mcpEnv: "env",
  mcpEnvHint: "每行一条 KEY=value；Agent vault 不注入 MCP Server 进程",
  mcpCwd: "cwd",
  mcpCwdHint: "留空则使用本次 Session 的 Workspace",
  mcpUrl: "url",
  mcpHeaders: "headers",
  mcpHeadersHint: "每行一条 Header-Name: value（如 Authorization 等认证头）",
  mcpPermission: "permission",
  mcpPermissionAuto: "auto",
  mcpPermissionAutoLabel: "Auto（readOnlyHint）",
  mcpPermissionAutoDescription:
    "每个工具按自己的 readOnlyHint 注解取值：声明了就是只读，否则为读写。",
  mcpPermissionReadDescription:
    "该 Server 的全部工具一律视为只读，无论其自身声明。审批模式为 read-only 时自动放行。",
  mcpPermissionReadWriteDescription:
    "该 Server 的全部工具一律视为读写，无论其自身声明。审批模式为 read-only 时需人工确认。",
  mcpPermissionHint:
    "只有 read-only 审批模式会读这个等级，allow-all / deny-all / always-ask 一律不看。它不限制 Server 本身能做什么——把并非只读的 Server 标为只读，只是撤掉了 read-only 模式本会索要的那次确认。",
  mcpConnectTimeout: "connectTimeoutMs",
  mcpBudgetsHint:
    "留空使用默认值：connectTimeoutMs 是连接与工具发现预算（默认 10000）；timeoutMs / maxOutputLength 作用于该 Server 的全部工具。",
  mcpNameInvalid: "限字母、数字、_ 和 -，且以字母或数字开头",
  mcpUrlInvalid: "必须是合法的 http(s) URL",
  mcpLineInvalid: (line: number): string => `第 ${line} 行格式无效`,
  mcpNumberInvalid: "必须是 > 0 的整数",
  mcpDuplicateName: "同名 Server 已存在",
  mcpTest: "测试连接",
  mcpTesting: "测试中…",
  mcpTestOk: (toolCount: number, latencyMs?: number): string => {
    const timing = latencyMs !== undefined ? `（${(latencyMs / 1000).toFixed(1)}s）` : "";
    return toolCount === 0
      ? `连接成功，但该 Server 未暴露任何工具${timing}`
      : `连接成功，发现 ${toolCount} 个工具${timing}`;
  },
  mcpTestFail: (detail: string): string => `连接失败：${detail}`,
  mcpTestAllConfirm: (n: number): string =>
    `将逐一连接已配置的 ${n} 个 MCP Server 并做工具发现（真实连接，不保存任何改动），结果显示在各行上。`,
  mcpTestAllStart: "开始测试",
  mcpTestPending: "测试中…",
  mcpTestBadge: (toolCount: number, latencyMs?: number): string =>
    `${toolCount} 个工具${latencyMs !== undefined ? ` · ${(latencyMs / 1000).toFixed(1)}s` : ""}`,
  mcpTestBadgeFail: "连接失败",
  mcpDeleteTitle: "删除 MCP Server",
  mcpDeleteConfirm: (name: string): string =>
    `确认删除 MCP Server「${name}」？其工具自下次 Session 起不再可用。`,
  defaultValue: "（缺省）",
  /** Reset link next to the runtime dropdowns: rewinds the local pick back to "not overridden" (the menus offer no inherit row). */
  /** An Agent whose state directory is on a machine: what this server cannot act on, and where it can be. */
  livesOnMachine: (machine: string) => `该 Agent 在 ${machine} 上，请到那台机器上管理`,
  deleteAgent: "删除 Agent",
  builtinUndeletable: "内置 Agent 不可被删除",
  deleteConfirm: (name: string): string =>
    `确认删除 Agent「${name}」？其目录（含全部 Trace）将被递归删除，不可恢复。`,
  /** Agent State section: the State version with the snapshot transfer actions, plus the copyable State path. */
  stateTitle: "Agent State",
  stateVersion: "Agent State 版本",
  transferDesc: "导出当前 Agent State 快照包（tar.gz）；导入整目录覆盖，并以包内版本为准。",
  exportSnapshot: "导出快照",
  importSnapshot: "导入快照",
  importing: "导入中…",
  importDone: (v: number): string => `导入完成，Agent State 版本 v${v}`,
  importConflictTitle: "版本冲突",
  importConflictBody: "快照包版本不高于当前版本，导入将覆盖现有 Agent State。确认继续？",
  resetConfigTitle: "还原为默认配置",
  resetConfigAction: "还原为默认配置",
  resetConfigConfirmBody:
    "此操作会用当前默认值覆盖该 Agent 的现有配置：自定义系统提示词、工具列表、模型/压缩参数与 MCP Server 全部被替换，仅保留名称与描述。与 Skill 更新一样不可撤销，确认继续？",
  resetConfigDone: "配置已还原为当前默认值",
  /** Kernel section: which defaults generation the config is based on (dates; unrelated to the optimization counter shown as stateVersion), with the update / restore actions. */
  kernelTitle: "内核",
  kernelLegacy: "早于内核版本机制",
  kernelOutdatedHint: "内核有更新",
  /** The Agents-list card's dark-red capsule on an outdated Agent — a control, not a label: it opens the settings overview where the update runs. */
  kernelUpdateNeeded: "内核需要更新",
  kernelUpToDate: "已是最新",
  kernelUpdateTitle: "更新内核",
  /** Inline labels around the outdated line's two generation values (the values themselves render dark and semibold). */
  kernelCurrent: "当前",
  kernelLatest: "最新",
  kernelUpdateAction: "更新内核",
  kernelUpdateConfirmBody:
    "将把未自定义的设置页更新为当前内置默认值；改动过的设置页整页保持不变，并在结果中列出。名称、描述、版本号与 MCP Server 不受影响。确认继续？",
  kernelUpdateDone: (version: string, advanced: number): string =>
    advanced > 0
      ? `内核已更新至 ${version}，${advanced} 个设置页跟进新默认`
      : `内核已更新至 ${version}，设置页均已是当前默认或保持自定义`,
  kernelUpdateKeptIntro: "以下设置页因自定义被整体保留：",
  kernelListSeparator: "、",
};

export type AgentStrings = typeof agentZh;

export const agentEn: AgentStrings = {
  savedTakesEffect:
    "Saved. New conversations pick it up right away; running ones after their next compaction.",
  savedTakesEffectNow: "Saved. It takes effect immediately, including running conversations.",
  takesEffectSuffix:
    " — new conversations pick it up right away, running ones after their next compaction",
  listTitle: "Agents",
  searchPlaceholder: "Search agents: id / name / description",
  searchEmpty: "No agent matches that.",
  create: "Create agent",
  createTitle: "Create agent",
  id: "Agent id",
  idHint:
    "2–64 chars: starts with a lowercase letter; lowercase letters, digits and underscores only; cannot be changed later",
  /** The id field's generation clause: the create dialog's name field is labelled Name, not display name. */
  idGenerateHint: "; you can also generate one from the name",
  nameHint: "Leave empty to use the agent id as the name",
  description: "Description",
  createPlugins: "Plugins",
  createPluginsPlaceholder: "No plugins selected",
  createPluginsPicked: (n: number): string => `${n} plugin${n === 1 ? "" : "s"} selected`,
  createPluginsHint:
    "Installed into the agent at creation (skills and hook packages); add or remove them later in its Skills and Hooks tabs.",
  createPluginsEmpty: "The plugin library has nothing to install.",
  /** The directory-skills picker's trigger (the field's own label is createDirSkills). */
  createSkillsPlaceholder: "No skills selected",
  createSkillsPicked: (n: number): string => `${n} skill${n === 1 ? "" : "s"} selected`,
  createDirSkills: "Import Skills from a project directory",
  createDirSkillsPick: "No directory selected",
  createDirSkillsHint:
    "Pick a project directory to read the Skills under its .agents/skills and .claude/skills",
  createDirSkillsEmpty: "This directory carries no installable Skills",
  createDirSkillsFound: (n: number): string =>
    `${n} skill${n === 1 ? "" : "s"} found in this directory`,
  createDirSkillsClear: "Clear the selected directory",
  createSnapshot: "Initialize from a snapshot",
  createSnapshotPick: "Choose a snapshot package",
  createSnapshotHint:
    "Pick an exported Agent State snapshot package (.tar.gz) to start the new agent from its state; name and description left empty keep the package's values.",
  createSnapshotSkillsOff:
    "The snapshot package carries its own skills and hooks, so plugin seeding is unavailable.",
  createSnapshotClear: "Remove the selected package",
  aiCreateTitle: "Create an agent with AI",
  aiCreateIntro:
    "Describe what the agent does, for whom, and what it produces; the agent doing the work uses the agent-initialization skill to create it in the current Project.",
  aiCreatePlaceholder: "e.g. Create an agent that turns my meeting recordings into to-do lists…",
  aiExamples: [
    {
      key: "jotting",
      label: "Jotting agent",
      description: "Fragments of thought filed into a Markdown file system",
      prompt:
        "Create a jotting agent: I will keep sending it fragments of thoughts and half-sentences, and it organizes them into a Markdown file system in the Workspace (one file per topic, an index file it maintains, duplicates merged, a timeline kept), replying after each message with where it filed the content.",
    },
    {
      key: "finance",
      label: "Financial Copilot",
      description: "Fundamentals and valuation from filings, quotes and news",
      prompt:
        "Create a financial Copilot agent: it reads the filings, market data and news links I give it, does fundamental and valuation analysis, presents conclusions as tables and bullet points, flags uncertainty and cites data sources, and never gives direct buy or sell advice.",
    },
    {
      key: "rag",
      label: "Document RAG agent",
      description: "Indexes docs/ first, then answers with citations",
      prompt:
        "Create a document Q&A agent: I will put material into the Workspace's docs/ directory; it first builds an index (a summary per file and section), cites the specific file and passage in every answer, and says plainly that it does not know when the material gives no basis for an answer.",
    },
    {
      key: "research",
      label: "Deep research report agent",
      description: "Outline, multi-round search, cross-checked, a cited report",
      prompt:
        "Create a deep research report agent: given a topic, it first drafts a research outline, then searches and reads sources over several rounds and cross-checks the facts, and finally writes a Markdown report in the Workspace with a table of contents, citations and appendices.",
    },
    {
      key: "report-writer",
      label: "Report-writing agent",
      description: "Structured reports from loose material; id report-writer",
      prompt:
        "Create a report-writing agent with the agent id report-writer: it turns loose material into structured business or technical reports (summary, background, analysis, conclusions and recommendations), produces Markdown files, and attaches a writing checklist.",
    },
  ],
  aiCreateTail: [
    "Use the agent-initialization skill to create a new agent in the current Project from the description above:",
    "- Use the agent id given above if there is one; otherwise pick a short semantic id (starting with a lowercase letter; letters, digits, underscores or hyphens). If the target directory already exists, stop and tell me instead of overwriting it.",
    "- Start from default_agent's system_config.yaml, set its name, description and version, and write the role and rules into its agent_state/AGENTS.md.",
    "- Copy only the skills it really needs from the plugin library (the skill directories default_agent carries); do not over-equip it.",
    "- Do not touch any other agent; run the skill's validation when done.",
    "Finish by telling me the new agent's id, the skills you installed, and how to start a conversation with it (the New chat button on its card on the Agents page).",
  ].join("\n"),
  firstAgentTitle: "No agent of your own yet",
  firstAgentDesc: "Describe the agent you want and let AI create it — or set one up manually.",
  installFromGist: "Install an Agent",
  installTitle: "Install an Agent",
  installDesc:
    "Paste a source; it is read and checked first, then choose the new Agent's id and install. What installs is the definition, with no state.",
  installGist: "Source",
  installSourceHint:
    "Accepted: a gist link or id; npm:<name>[@version]; a GitHub repository link (default branch, or /tree/<branch>); a GitHub release link; a git URL (git+…, git@…, ending in .git); an http(s) link to a tar.gz. A repository that is an Agent directory (agent_state/, workflows/) needs no manifest.",
  installKind: "Source kind",
  installKindAuto: "Detect",
  installKindGithub: "GitHub repository",
  installKindRelease: "GitHub release",
  installKindUrl: "tar.gz link",
  installRead: "Read",
  installReading: "Reading…",
  installChangeGist: "Use another source",
  install: "Install",
  installing: "Installing…",
  installed: (agentId: string) => `Installed Agent ${agentId}`,
  packageSummary: (files: number, size: string) => `${files} files · ${size}`,
  packagedBy: (version: string) => `packaged by PenguinHarness ${version}`,
  packageExcludes:
    "Not included: memory, workspaces, a workflow's state.json, version history, the vault.",
  publishToGist: "Publish to gist",
  publishTitle: "Publish to a GitHub gist",
  publishDesc:
    "Publishes this Agent's definition as a set of readable text files; anyone (or another machine) can install a clean copy of the same Agent from it.",
  publishNoToken:
    "The server has no GitHub identity yet: log in with `gh auth login` (scope `gist`) on the server, or have an admin store a token under Settings → Sharing.",
  publishGistId: "Publish to a different gist",
  publishGistIdPlaceholder: "Leave empty",
  publishGistIdHint:
    "Empty: updates this Agent's own gist when something changed, and spends no request when nothing did; an Agent that was never published gets a new gist. A link or id publishes to that gist instead, and always writes — use it when the gist was deleted or edited on GitHub.",
  publishPublic: "Public gist",
  publishViaGh: "Publishes as the `gh` CLI logged in on the server.",
  publishViaToken: "Publishes with the GitHub token stored on the server.",
  publishUpdates: "Updates:",
  publishUnchanged: "The gist already held exactly this: nothing was written.",
  publish: "Publish",
  publishUpdate: "Update gist",
  publishing: "Publishing…",
  published: (files: number, size: string) => `Published ${files} files (${size}).`,
  sessionCount: (n: number): string => `${n} session${n === 1 ? "" : "s"}`,
  toolCount: (n: number): string => `${n} tool${n === 1 ? "" : "s"}`,
  vaultKeyCount: (n: number): string => `${n} vault key${n === 1 ? "" : "s"}`,
  scheduleCount: (n: number): string => `${n} scheduled task${n === 1 ? "" : "s"}`,
  memoryCount: (n: number): string => (n === 1 ? "1 memory" : `${n} memories`),
  updatedAt: "Last modified",
  activity: (days: number): string => `${days}-day session activity`,
  settings: "Agent settings",
  backToList: "Back to Agents",
  tabOverview: "Overview",
  tabPrompt: "System Prompt",
  tabMemory: "Memory",
  tabRuntime: "Runtime",
  tabTools: "Tools",
  tabSkills: "Skills",
  tabHooks: "Hooks",
  tabVault: "Vault",
  tabSchedules: "Schedules",
  stateDir: "State path",
  copyStateDir: "Copy State path",
  agentsMd: "AGENTS.md",
  systemPrompt: "system_prompt template",
  placeholdersTitle: "Available placeholders (click to insert)",
  insertPlaceholder: "Insert at the system_prompt cursor",
  /** Order must match the default system prompt (core default-config.ts DEFAULT_SYSTEM_PROMPT). Inner tokens ({{VAULT_KEYS}} etc.) live in each feature tab's promptPlaceholders instead. */
  placeholders: [
    ["{{AGENTS_MD}}", "Injects the AGENTS.md content"],
    [
      "{{VAULT}}",
      "Injects the vault block (vault.prompt with the key-name list); empty when its toggle is off",
    ],
    [
      "{{SKILLS}}",
      "Injects the skills block (skills.prompt with installed-skill metadata); empty when its toggle is off",
    ],
    [
      "{{MEMORY}}",
      "Injects the memory block: memory.prompt plus memory.workspace_prompt (persistent workspaces only); empty when memory is off",
    ],
    [
      "{{SCHEDULES}}",
      "Injects the scheduled-tasks block (schedules.prompt with the task-name roster); empty when its toggle is off",
    ],
    ["{{PLATFORM}}", "Runtime platform"],
    ["{{OS_VERSION}}", "Operating system version"],
    ["{{SHELL}}", "Shell used to run commands"],
    ["{{DATE}}", "Current date"],
    [
      "{{PROJECT_DIR}}",
      "PenguinHarness app data root — all agents' data and project-level data; not the task working directory",
    ],
    ["{{AGENT_ID}}", "Current agent id"],
    ["{{CWD}}", "Absolute Workspace path"],
    ["{{PROVIDER}}", "Model provider group"],
    ["{{MODEL_ID}}", "Upstream model id"],
    ["{{SESSION_ID}}", "Current Session id"],
  ] as ReadonlyArray<readonly [string, string]>,
  maxTurns: "max_turns (max turns per Task, -1 = unlimited)",
  maxTokens: "model.max_tokens",
  thinkingLevel: "model.thinking_level",
  thinkingLevelOptions: [
    ["", "Send no override — keep whatever is currently configured."],
    ["low", "Enables a lower tier of extended reasoning."],
    [
      "medium",
      "Enables a medium tier of extended reasoning (the default tier for a newly created agent).",
    ],
    ["high", "Enables a higher tier of extended reasoning; slower responses."],
    [
      "xhigh",
      "Enables an extended tier of reasoning beyond high; identical to high on some models.",
    ],
    [
      "max",
      "Enables the deepest tier of extended reasoning; slowest and identical to xhigh on some models.",
    ],
  ] as ReadonlyArray<readonly [string, string]>,
  thinkingLevelNoneKept:
    "Stored legacy tier: new selections no longer offer the off tier (many models cannot disable thinking).",
  timeoutMs: "model.timeoutMs",
  timeoutMsHint: "Idle budget between upstream events, ms — not a cap on the whole request",
  compaction: "Context compaction",
  maxContextLength: "max_context_length",
  maxContextLengthHint: "Context threshold that triggers compaction",
  maxSessionTurns: "max_session_turns",
  maxSessionTurnsHint: "Turn threshold that triggers compaction",
  compactionMode: "mode (compaction strategy)",
  compactionModeOptions: [
    ["", "Send no override — keep whatever is currently configured."],
    [
      "summarize",
      "Summarizes the old context with the model, then continues from that summary in a fresh window (default).",
    ],
    [
      "discard",
      "Drops the old context without summarizing; the next turn starts fresh in a new window.",
    ],
  ] as ReadonlyArray<readonly [string, string]>,
  compactionPrompt: "prompt (summarization prompt)",
  maxTurnsInvalid: "max_turns must be > 0 or -1",
  timeoutInvalid: "timeoutMs must be > 0 or -1",
  toolFieldInvalid: (name: string, field: string) =>
    `${name}: ${field} must be a positive integer or -1`,
  toolPermission: "permission",
  permissionReadLabel: "Read-only",
  permissionReadDescription: "Only reads. Auto-approved when the approval mode is read-only.",
  permissionReadWriteLabel: "Read & write",
  permissionReadWriteDescription:
    "Can modify things. Needs manual confirmation when the approval mode is read-only.",
  toolTimeout: "timeoutMs",
  toolMaxOutput: "maxOutputLength",
  toolCallDescription: "call_description",
  callDescriptionHint:
    "call_description: when on (the default), the tool's schema keeps the optional description argument — a model-written sentence about each call, shown to the user while it runs; when off, the argument is filtered out of the schema at assembly. Only tools whose parameters declare a description property can be toggled.",
  mcpServers: "MCP Servers",
  mcpDesc:
    "Connect external MCP Servers: their tools join this agent's toolset as mcp__<name>__<tool>. Changes in this block save immediately.",
  mcpEmpty: "No MCP Servers configured yet",
  mcpAdd: "Add MCP Server",
  mcpEditTitle: "Edit MCP Server",
  mcpRemove: "Remove",
  mcpName: "name",
  mcpNameHint: "Tool-name prefix: mcp__<name>__<tool>; letters, digits, _ and - only",
  mcpTransport: "transport",
  mcpTransportStdio: "Local process: spawns command and talks over stdin/stdout",
  mcpTransportHttp: "Streamable HTTP: the current spec's remote transport",
  mcpTransportSse: "Legacy HTTP+SSE: kept for servers that have not migrated",
  mcpTarget: "command / url",
  mcpCommand: "command",
  mcpArgs: "args",
  mcpArgsHint: "One argument per line",
  mcpEnv: "env",
  mcpEnvHint: "One KEY=value per line; the Agent vault is not injected into MCP Server processes",
  mcpCwd: "cwd",
  mcpCwdHint: "Leave empty to use the Session's Workspace",
  mcpUrl: "url",
  mcpHeaders: "headers",
  mcpHeadersHint: "One Header-Name: value per line (auth headers such as Authorization)",
  mcpPermission: "permission",
  mcpPermissionAuto: "auto",
  mcpPermissionAutoLabel: "Auto (readOnlyHint)",
  mcpPermissionAutoDescription:
    "Each tool gets the level its own readOnlyHint annotation implies: read-only when it declares one, read & write otherwise.",
  mcpPermissionReadDescription:
    "Treat every tool of this server as read-only, whatever it declares. Auto-approved when the approval mode is read-only.",
  mcpPermissionReadWriteDescription:
    "Treat every tool of this server as read & write, whatever it declares. Needs manual confirmation when the approval mode is read-only.",
  mcpPermissionHint:
    "Only the read-only approval mode reads this level; allow-all, deny-all and always-ask ignore it. It never restricts what the server itself can do — marking a server read-only that is not one only drops the confirmation read-only mode would have asked for.",
  mcpConnectTimeout: "connectTimeoutMs",
  mcpBudgetsHint:
    "Leave empty for defaults: connectTimeoutMs is the connect + tool-discovery budget (default 10000); timeoutMs / maxOutputLength bound every tool of this Server.",
  mcpNameInvalid: "Letters, digits, _ and - only, starting with a letter or digit",
  mcpUrlInvalid: "Must be a valid http(s) URL",
  mcpLineInvalid: (line: number): string => `Line ${line} is not valid`,
  mcpNumberInvalid: "Must be an integer > 0",
  mcpDuplicateName: "A server with this name already exists",
  mcpTest: "Test connection",
  mcpTesting: "Testing…",
  mcpTestOk: (toolCount: number, latencyMs?: number): string => {
    const timing = latencyMs !== undefined ? ` (${(latencyMs / 1000).toFixed(1)}s)` : "";
    return toolCount === 0
      ? `Connected, but the server exposes no tools${timing}`
      : `Connected — ${toolCount} tool${toolCount === 1 ? "" : "s"}${timing}`;
  },
  mcpTestFail: (detail: string): string => `Connection failed: ${detail}`,
  mcpTestAllConfirm: (n: number): string =>
    `Connects to ${n === 1 ? "the configured MCP server" : `each of the ${n} configured MCP servers`} in turn and runs tool discovery (real connections, nothing is saved); results land on each row.`,
  mcpTestAllStart: "Start test",
  mcpTestPending: "Testing…",
  mcpTestBadge: (toolCount: number, latencyMs?: number): string =>
    `${toolCount} tool${toolCount === 1 ? "" : "s"}${latencyMs !== undefined ? ` · ${(latencyMs / 1000).toFixed(1)}s` : ""}`,
  mcpTestBadgeFail: "Connection failed",
  mcpDeleteTitle: "Delete MCP Server",
  mcpDeleteConfirm: (name: string): string =>
    `Delete MCP Server "${name}"? Its tools stop being available from the next Session on.`,
  defaultValue: "(default)",
  livesOnMachine: (machine: string) => `This Agent lives on ${machine}; manage it there`,
  deleteAgent: "Delete agent",
  builtinUndeletable: "Built-in agents cannot be deleted",
  deleteConfirm: (name: string): string =>
    `Delete agent "${name}"? Its directory (including all Traces) will be removed recursively and cannot be recovered.`,
  stateTitle: "Agent State",
  stateVersion: "Agent State version",
  transferDesc:
    "Export the current Agent State snapshot (tar.gz); importing overwrites the whole directory and adopts the version inside the package.",
  exportSnapshot: "Export snapshot",
  importSnapshot: "Import snapshot",
  importing: "Importing…",
  importDone: (v: number): string => `Import finished, Agent State version v${v}`,
  importConflictTitle: "Version conflict",
  importConflictBody:
    "The snapshot's version is not newer than the current one; importing will overwrite the existing Agent State. Continue?",
  resetConfigTitle: "Restore default configuration",
  resetConfigAction: "Restore default configuration",
  resetConfigConfirmBody:
    "This overwrites the agent's existing configuration with the current defaults: the custom system prompt, tool list, model/compaction settings and MCP servers are all replaced, keeping only name and description. Like a skill update this cannot be undone. Continue?",
  resetConfigDone: "Configuration restored to the current defaults",
  kernelTitle: "Kernel",
  kernelLegacy: "predates kernel versioning",
  kernelOutdatedHint: "Kernel update available",
  kernelUpdateNeeded: "Kernel update needed",
  kernelUpToDate: "Up to date",
  kernelUpdateTitle: "Update kernel",
  kernelCurrent: "current",
  kernelLatest: "latest",
  kernelUpdateAction: "Update kernel",
  kernelUpdateConfirmBody:
    "Settings tabs you have not customized will be updated to the current built-in defaults; a tab you have edited stays unchanged in full and is listed in the result. Name, description, the State version and MCP servers are unaffected. Continue?",
  kernelUpdateDone: (version: string, advanced: number): string =>
    advanced > 0
      ? `Kernel updated to ${version}; ${advanced} tab(s) now follow the new defaults`
      : `Kernel updated to ${version}; every tab was already current or kept as customized`,
  kernelUpdateKeptIntro: "Kept whole because customized:",
  kernelListSeparator: ", ",
};
