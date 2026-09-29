/**
 * The chat module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `chat` section. A new string is added here, to both fragments, and
 * nowhere else — `ChatStrings` makes a key missing from `chatEn` a type error.
 */
export const chatZh = {
  /** Footnote of the session picker's menu — the pre-pick reminder: a change applies right away but costs the model's cached context, so compacting first is recommended. */
  thinkingLevelChangeNote: "立即生效。更换思考等级会使模型缓存失效，建议先压缩上下文。",
  /** A surface Session (a plugin renders it — see state/contributions.tsx): the draft page's open card and the page around the surface. */
  surface: {
    /** The kind picker on the New chat page: the built-in conversation. */
    conversation: "对话",
    chooseKind: "选择要打开什么",
    open: "打开",
    opening: "正在打开…",
    promptPlaceholder: "第一条提示",
    exited: "程序已退出。",
    restart: "重新打开",
    close: "关闭",
    unavailable: "渲染这个对话的插件没有加载。",
    noRenderer: "这个构建没有画它的渲染器。",
    noTerminal: "这个表面没有给出终端。",
  },
  newSessionMenu: "新建对话",
  chooseAgent: "选择 Agent",
  chooseModel: "选择模型",
  thinkingLevel: "思考等级",
  /** Tier names for every surface that DISPLAYS an already-chosen level — the composer picker's trigger and tooltip, the mid-chat switch dialog and its toasts, the Project chat-defaults control and its read-only row. Chinese only, no wire value (per maintainer request): once the tier is picked, the English spelling is noise on a control this narrow, and it reads badly inside the 「…」 of the switch prose. `none` exists purely to display a stored legacy value — it is never offered as a choice (many models cannot disable thinking). */
  thinkingLevelNames: {
    none: "无",
    low: "低",
    medium: "中",
    high: "高",
    xhigh: "极高",
    max: "最高",
  } as Readonly<Record<string, string>>,
  /** Dropdown-row variant of the name above: choosing is where the wire value earns its place, so a menu row annotates the Chinese name with the value the pick will send. Only the composer's own dropdown uses it — a native `<select>` renders the picked option's text on the collapsed control too, which would put the annotation straight back onto a trigger. */
  thinkingLevelMenuName: (name: string, level: string): string => `${name} (${level})`,
  /** Mid-chat switch guard (issue #310): confirm before a level change that costs prompt-cache hits over the existing history. Title is the dialog's accessible name only. */
  thinkingSwitchTitle: "切换思考等级",
  thinkingSwitchBody: (to: string): string =>
    `将思考等级切换为「${to}」？会话中途切换会降低提示词缓存命中率、增加成本，先压缩上下文再切换更省。`,
  /** Shown under the body when the session isn't idle — compaction can only start on an idle session. */
  thinkingSwitchBusyHint: "会话正在运行，压缩要等空闲后才能开始。",
  /** Primary (recommended) choice: compact first, then apply the switch. */
  thinkingSwitchCompactFirst: "压缩后切换",
  thinkingSwitchConfirm: "仍要切换",
  /** Toast when the compaction starts: the switch is applied once it ends. */
  thinkingSwitchCompacting: "正在压缩上下文，压缩结束后切换思考等级。",
  thinkingSwitchApplied: (to: string): string => `上下文已压缩，思考等级已切换为「${to}」。`,
  /** Compaction ended without completing — the switch still applies, so say both. */
  thinkingSwitchCompactFailed: "压缩未成功完成，思考等级已照常切换。",
  /** The machine a workspace lives on; the row only shows when more than one is reachable. */
  workspaceMachine: "机器",
  workspaceHere: "本机",
  /** Why a listed machine cannot be picked — shown ON its row, where the question is asked. */
  workspaceMachineWhy: {
    "no-identity": "待识别",
  },
  workspaceUseThis: "使用此目录",
  workspaceUp: "上级目录",
  workspaceNoSubdirs: "无子目录",
  workspaceAuto: "临时工作区",
  workspaceClear: "改用临时工作区",
  workspaceDirInvalid: "目录不存在或无法访问，已回退",
  /** Grouping toggle of the sidebar conversation list (workspace grouping is the default) and the workspace groups. */
  groupByWorkspace: "按工作区分组",
  groupByAgent: "按智能体分组",
  groupByTime: "按时间分组",
  /** Time-mode bucket names (last day / last month / older), by last activity. */
  timeGroups: {
    day: "近一天",
    month: "近一月",
    earlier: "更早",
  },
  /** Session-list section header controls: search / list settings / mode-dependent create (具体新建的对象按分组方式决定). */
  searchSessions: "搜索会话",
  searchSessionsPlaceholder: "搜索会话…",
  searchClear: "清除搜索",
  /** Zero hits: the filter only sees already-loaded conversations, so the copy says so rather than claiming none exist. */
  searchNoMatches: "已加载的会话中无匹配",
  listSettings: "列表选项",
  groupModeSection: "分组方式",
  sortModeSection: "排序方式",
  sortManual: "手动排序",
  sortRecent: "最近更新",
  newWorkspaceEntity: "新建工作区",
  /** Registry-backed workspace group's overflow (… right of the header "+"): alias rename + sidebar-only removal. */
  workspaceMenu: "工作区选项",
  renameWorkspace: "重命名工作区",
  renameWorkspaceLabel: "名称",
  renameWorkspaceHint: "留空则使用目录名",
  deleteWorkspace: "删除工作区",
  deleteWorkspaceConfirm: (name: string) =>
    `确定移除「${name}」？仅从侧边栏移除该工作区分组，不影响磁盘目录与已有会话，可随时重新添加。`,
  tempWorkspaces: "临时工作区",
  /** A name that only means something on another machine, written with the ssh alias that reaches it. */
  onMachine: (name: string, machine: string) => `${name} [SSH: ${machine}]`,
  /** The same mark on its own, for a row that is attributed to a machine rather than named after one. */
  machineTag: (machine: string) => `[SSH: ${machine}]`,
  newSessionInWorkspace: "在此工作区新建对话",
  draftSubtitle: "最擅长 AI 开发任务的自进化 Agent",
  /** Collapsed group names for the home-page examples (bookmark style; only one open at a time). */
  exampleFolders: {
    webapps: "搭建网页应用",
    agents: "搭建和优化智能体",
    schedules: "创建定时任务",
  },
  /** Second tooltip line on an example row: the click fills the composer, it does not send. */
  exampleFillHint: "点击填入输入框，可修改后自行发送",
  /** The examples block's last folder: prompts the user wrote and saved, stored per user on the server. */
  shortcuts: {
    folder: "我的快捷指令",
    new: "新建快捷指令",
    /**
     * Tooltip on the new-shortcut row. Unconditional, and worded to hold either way: the
     * editor opens on whatever the composer holds, which is a blank draft when it holds
     * nothing — saving what was just typed is the path this folder exists to shorten.
     */
    newFromComposer: "以输入框中的内容作为起点",
    createTitle: "新建快捷指令",
    editTitle: "编辑快捷指令",
    titleLabel: "名称",
    titleHint: (max: number) => `最多 ${max} 个字符`,
    promptLabel: "提示词",
    promptHint: (max: number) => `最多 ${max} 个字符`,
    /** Semantics behind the prompt field's "?": what the saved text does when clicked. */
    promptInfo:
      "点击这条快捷指令时，这段文字会原样填入输入框，不会自动发送；需要的 Skill 仍在输入框里自行勾选。",
    titleTooLong: (max: number) => `名称最多 ${max} 个字符`,
    promptTooLong: (max: number) => `提示词最多 ${max} 个字符`,
    deleteTitle: "删除快捷指令",
    deleteConfirm: (title: string) => `确定删除「${title}」？该快捷指令会从你的所有设备上消失。`,
  },
  /**
   * Example task cards on the draft screen: one click fills the composer with the canned
   * prompt, which the user reads, edits and sends. That is why a prompt is SHORT — a short
   * paragraph, around 100 Chinese characters, carrying what to build plus the constraints the
   * result would be wrong without. File layouts, field lists, step-by-step headings and
   * self-test instructions are what the Agent works out or asks about, so they stay out; the
   * older briefs below are still far longer and are being trimmed to match.
   */
  exampleTasks: {
    game: {
      label: "2D 企鹅雪橇越野小游戏",
      desc: "可爱南极企鹅滑雪橇跳石头，难度由易到难的 2D 纯前端小游戏",
      prompt:
        "做一个可爱的南极企鹅滑雪橇越野 2D 小游戏：按空格键起跳，跃过冰面上迎面而来的石头；" +
        "开局要足够简单、上手无压力，滑行速度与障碍密度随时间平滑、循序渐进地上升，避免突然变难，" +
        "实时计分，撞上石头即结束并可一键重新开始。" +
        "2D 横版画面、可爱卡通风，纯前端实现（单个 HTML 文件即可），界面遵循 web-design 技能。" +
        "完成后在浏览器里自测一次，确认开局能轻松玩过几秒，并告诉我怎么打开和怎么玩。",
    },
    gamecenter: {
      label: "多智能体搭建小游戏中心",
      desc: "并行产出 10 个玩法互不重复的纯前端小游戏，配一个统一风格的索引首页",
      prompt: `用多智能体并行搭建一个网页小游戏中心：10 个玩法互不重复的纯前端小游戏，外加一个索引首页。

## 分工方式
- 先规划这 10 个游戏（例如贪吃蛇、2048、俄罗斯方块、打砖块、扫雷、记忆翻牌、推箱子、太空射击、跳跃平台、节奏点击），确认玩法确实互不重复，并定好统一的目录结构、配色与交互规范。
- 再把 10 个游戏分派给多个子智能体并行实现，每个子智能体只负责自己的那一个游戏，严格按既定规范产出，互不改动他人的文件。

## 每个游戏
- 独立的 \`games/<slug>/index.html\`，纯前端单文件、file:// 直接打开即可运行，不依赖后端与任何 CDN 资源。
- 具备开始 / 重新开始、实时计分或计时、失败或通关结算，并同时支持键盘与触摸操作，页面内写明玩法说明。
- 提供返回索引首页的入口。

## 索引首页
- 根目录 \`index.html\`：卡片网格列出全部 10 个游戏（名称 + 一句话玩法 + 操作方式），点击进入对应游戏。
- 与所有游戏共用一套设计语言，遵循 web-design 技能。

## 收尾
- 统一验收：10 个游戏玩法确实不重复、风格一致，索引页的链接全部可达。
- 在浏览器里逐个自测，确认都能开始、能结束、能重开，然后告诉我怎么打开。`,
    },
    lol: {
      label: "英雄联盟音乐播放器",
      desc: "用 SoundCloud Widget API 播放历届 Worlds 主题曲，单文件即开即用",
      prompt: `用 SoundCloud Widget API（见 https://developers.soundcloud.com/docs/api/html5-widget）做一个英雄联盟 Worlds 主题曲播放器，单文件 index.html，file:// 打开即用。

## 技术约束
- 使用 SC.Widget JS API（widget.load / widget.toggle / widget.setVolume / widget.seekTo），引入 https://w.soundcloud.com/player/api.js
- iframe 必须可见（180px 高），visual=true color=f0b90b single_active=true
- 仅包含以下 8 首已确认可播曲目（oEmbed 验证通过），不要添加未经 oEmbed 验证的曲目：
- Warriors (S4) — soundcloud.com/leagueoflegends/warriors
- Worlds Collide (S5) — soundcloud.com/leagueoflegends/worlds-collide
- Legends Never Die (S7) — soundcloud.com/leagueoflegends/legends-never-die
- Phoenix (S9) — soundcloud.com/leagueoflegends/phoenix
- Burn It All Down (S11) — soundcloud.com/leagueoflegends/burn-it-all-down
- GODS (S13) — soundcloud.com/leagueoflegends/gods
- Heavy Is The Crown (S14) — soundcloud.com/linkinpark/heavy-is-the-crown
- Sacrifice (S15) — soundcloud.com/leagueoflegends/sacrifice

## 布局
- 左侧 260px 粘性侧边栏：曲目列表（S4/S5/… 标签 + emoji + 曲名 + 年份），点击高亮金色边框，SC.Widget.load() 切歌 + auto_play
- 右侧主区域：Hero 标题 + 桌面时钟（80px 等宽金色 HH:MM:SS，每秒刷新，冒号闪烁）+ 心情标签
- 播放器卡片：SoundCloud iframe + 自定义控制栏（⏮ ▶/⏸ ⏭ + 曲目信息 + 音量滑块，点击喇叭图标静音切换）
- 心情波动区：15 根金色动画柱，切歌时重新随机生成
- 键盘快捷键：空格播放暂停、← → 切歌、↑ ↓ 调音量

## 设计
Penguin 视觉风格（见 web-design 技能），默认深色。手机端侧边栏变为顶部横向滚动。

完成后在浏览器打开 index.html 自测一次。`,
    },
    rhythmRunner: {
      label: "音乐节奏跑酷小游戏",
      desc: "喵斯快跑式的音乐节奏跑酷：企鹅主角，音符踩着节拍飞来，判定分 Perfect / Great / Miss",
      prompt:
        "做一个喵斯快跑（Muse Dash）式的音乐节奏跑酷小游戏：主角是一只企鹅，自动向前跑；" +
        "音符画成音符图标，严格踩着节拍飞来，玩家按键击打，判定显示 Perfect / Great / Miss 三档，" +
        "连击计分，难度随曲子推进。纯前端单文件，file:// 直接打开即玩。",
    },
    investmentCopilot: {
      label: "对话式投资分析助理",
      desc: "用 Penguin SDK 做对话式看盘 Copilot：首页列出近期走势较好的股票，每个判断都说清市场因素",
      prompt:
        "用 Penguin SDK 做一个对话式的股市 Copilot，形态参考 perplexity.ai/finance：启动后每 5 分钟实时抓取大盘行情，" +
        "首页直接列出近期走势较好的股票和板块强弱，每个判断都要说清背后的市场因素——政策、行业消息、" +
        "资金流向、财报或宏观数据，而不是技术指标，" +
        "只做分析不是投资建议。它的查股工具要能答「帮我查一下智谱的股票」这类问题：" +
        "按公司名（中文也行）自己对应到股票代码，查不到或没上市就直说，不要编。",
    },
    missionControl: {
      label: "搭建自定义工作流界面：Agent 指挥台",
      desc: "聊天旁的 Workflow 标签页：把一个任务同时派给多个 Agent，实时看每个 Session 的状态",
      prompt:
        "给你自己做一个 Workflow：聊天旁边的一张「指挥台」标签页。我输入一个任务、勾选本 Project 里的一个或多个 Agent，" +
        "它就为每个 Agent 开一个 Session 并行跑起来。每次运行是一张卡片，带实时的动态状态（排队、运行中、完成）和耗时，" +
        "刷新页面后看板仍在。再加第二张标签页放统计——各 Agent 的运行次数与平均耗时——以及一个占满整个应用的按钮，当作大屏来用。" +
        "颜色一律取自主题变量，明暗两种主题下都要好看。",
    },
    agentBenchmarkBuild: {
      label: "构建通用决策智能体和评测基准",
      desc: "创建一个通用决策 Agent，并用足球、售后和投资任务检验它",
      prompt: `请依次使用 \`agent-initialization\` 和 \`benchmark-design\`，创建决策 Agent，并产出 Frozen Benchmark 与 Formal Baseline。

Agent：
- id：\`finite_choice_agent\`
- 能力：面对有限选项，在公开信息不足或冲突时仍能给出稳定、可解释的选择
- installed_skills：\`[]\`

Benchmark：
- id：\`contextual-choice-adaptation\`
- capability：从公开规则、历史案例和当前事实中形成并迁移稳定的有限选择决策过程
- desired_baseline_score：\`<75\`
- pilot_iteration_limit：\`5\`

场景：
1. 根据历史比赛与当前信息进行足球投注决策。
2. 根据售后政策与工单事实选择处置动作。
3. 根据投资策略、历史市场与当前指标选择投资动作。`,
    },
    agentOptimization: {
      label: "优化通用决策智能体的准确率",
      desc: "根据已有评测结果改进 Agent，并验证新版本是否真正提升",
      prompt: `请使用 \`agent-optimization\`，根据 Frozen Benchmark 优化决策 Agent。

- test_agent_id：\`finite_choice_agent\`
- benchmark_id：\`contextual-choice-adaptation\`
- capability_direction：提高信息不完整、规则冲突和有限选项决策中的稳定性
- runs：\`3\`
- desired_score：\`>=95\`
- candidate_round_limit：\`5\``,
    },
    dailyPlan: {
      label: "每天早 9 点的计划对话",
      desc: "每天 09:00 在同一个会话里聊当天计划，并回顾昨天的进展",
      prompt:
        "建一个定时任务：每天早上 9 点在这个会话里和我聊今天的计划。" +
        "先回看上文说清昨天定的事做完了多少、哪些卡住，再给我一份排好序的今日候选、每条一句理由，" +
        "我确认后写成清单。",
    },
    githubDigest: {
      label: "每天汇总 GitHub 项目状态",
      desc: "定时跑一遍仓库的 Issue、PR 与 CI，日报结尾给出按优先级排序的建议",
      prompt:
        "建一个定时任务：每天早上用 gh 汇总一个 GitHub 仓库的 Issue、PR 与 CI 状态，" +
        "挑出停滞的、待评审的和挂掉的，结尾给出按优先级排序的建议，每条说清为什么排在这个位置。",
    },
    memoryReview: {
      label: "每周五晚回顾并记录 Memory",
      desc: "周五傍晚一起过一遍这周值得长期记住的事，确认后由你写进 Memory",
      prompt:
        "建一个定时任务：每周五傍晚在这个会话里和我过一遍这周值得长期记住的事。" +
        "先看已有记忆索引避免重复，再逐条问我该记什么、要不要改已有的，我确认后你写进 Memory。",
    },
  },
  sessionList: "Session",
  defaultSessionTitle: "新对话",
  agent: "Agent",
  model: "Model",
  workspace: "Workspace",
  workspaceHint: "留空自动创建临时工作区；指定时必须是服务器上已存在的目录",
  /** The same rule as `workspaceHint`, short enough to sit under a form field. */
  workspaceHintShort: "留空自动创建临时工作区",
  approvalMode: "审批模式",
  /** The composer's permission button: one colored shield for the level, a menu of Fs / Network / More. */
  permission: {
    label: "权限",
    levels: {
      all: "完全访问",
      partial: "部分权限",
      "read-only": "只读",
      off: "关闭",
    } as Record<string, string>,
    fs: "文件系统",
    fsModes: {
      "read-only": "只读",
      "workspace-write": "仅工作区可写",
      "danger-full-access": "完全访问",
    } as Record<string, string>,
    network: "网络",
    networkModes: {
      open: "完全访问",
      local: "本地网络（仅 localhost）",
      none: "无网络",
    } as Record<string, string>,
    unsupported: "不支持",
    localUnsupported: "本机的沙盒后端不支持只允许 localhost",
    more: "更多…",
    approval: "审批",
  },
  /** Short description (the trigger button shows only the description, not the mode id). */
  approvalModeNames: {
    "allow-all": "全部放行",
    "deny-all": "全部拒绝",
    "read-only": "放行只读",
    "always-ask": "总是询问",
  } as Record<string, string>,
  approvalModes: {
    "allow-all": "全部放行（allow-all）",
    "deny-all": "全部拒绝（deny-all）",
    "read-only": "放行只读（read-only）",
    "always-ask": "总是询问（always-ask）",
  } as Record<string, string>,
  statusRunning: "运行中",
  statusCompacting: "压缩中",
  /** Settled Session that finished since the user last opened it (the unread dot; a Session already read shows no glyph, so it needs no label). */
  statusCompletedUnread: "运行完毕，未读",
  /** The background-task mark on a session row and the chat header's count: background processes plus background subagents still running. */
  backgroundTasks: (n: number) => `${n} 个后台任务`,
  /** The session row's alarm clock: at least one enabled scheduled task is bound to this conversation (a paused one draws no mark). */
  sessionScheduled: "有待触发的定时任务",
  /** The tool row's marker for the ONE call whose work went to the background — launched with `run_in_background`, or moved there by the user — rather than for a count. Bracketed, like the row's other outcome markers. */
  backgroundCall: "[后台任务]",
  /** The tool row's inline text action, shown while the call is executing (also its accessible name). */
  sendToBackground: "转入后台执行",
  /** Its tooltip: what the click does to the call and to the conversation. */
  sendToBackgroundHint: "把这次调用转入后台执行，对话继续进行；它结束时会以后台任务通知送回。",
  pendingApprovals: (n: number) => `${n} 个待审批`,
  jumpToLatest: "回到最新消息",
  /** Top-of-stream affordance while the previous history window is being fetched (scroll-up backfill). */
  loadingEarlier: "正在加载更早的对话…",
  /** Top-of-stream affordance after a backfill failure: click to retry fetching the previous window. */
  loadEarlierRetry: "更早的对话加载失败，点击重试",
  /** Top-of-stream marker once the loaded history reaches the very beginning (shown only after a backfill happened). */
  historyBeginning: "已是对话开头",
  /** Bottom-of-stream affordance while the loaded range has left the live tail behind (see stream-controller's window eviction). */
  loadingLater: "正在加载更新的对话…",
  loadLaterRetry: "更新的对话加载失败，点击重试",
  /** Toast when a jump to a turn that is not loaded could not fetch its window. */
  outlineOpenFailed: "无法打开该轮对话",
  /** Conversation minimap (tick rail over the stream's left gutter): rail aria-label. */
  outlineTitle: "对话索引",
  /** Tick accessible name: turn number + the question (or the no-text placeholder). */
  outlineTickLabel: (n: number, question: string) => `第 ${n} 轮：${question}`,
  /** Entry label when the prompt had no text body (image / attachment-only message). */
  outlineNoText: "（图片或附件）",
  /** Answer-preview placeholder while the latest turn is still running with no reply text yet. */
  outlineAnswering: "回答生成中…",
  inputPlaceholder: "输入消息，Enter 发送，Shift+Enter 换行，可粘贴图片",
  inputPlaceholderShort: "输入消息…",
  /** Placeholder while a Task is running (mid-run steering): the message is delivered between turns with the next request. */
  steerPlaceholder: "给运行中的 Agent 留言，随下一轮对话送达",
  steerPlaceholderShort: "给运行中的 Agent 留言…",
  steerSend: "发送给运行中的 Agent",
  /** Queued hint shown after a successful steer, until the steering message appears in the stream. */
  steerQueuedIndicator: "插话已排队，将随下一轮送达",
  /** Same hint, with the queued message's content (from the server's undelivered-steering mirror; survives reloads). */
  steerQueuedItem: (content: string) => `插话已排队，将随下一轮送达：${content}`,
  /** Label of the [user_steering] chip (a mid-run user message delivered between turns). */
  userSteering: "用户插话",
  /** Mid-run send-mode setting: steer (delivered mid-run) vs follow-up (queued until the run ends). */
  steerModeLabel: "运行中发送方式",
  steerModeSteer: "插话",
  steerModeSteerHint: "立即插话：随下一轮对话送达运行中的 Agent",
  steerModeFollowUp: "排队",
  steerModeFollowUpHint: "排队跟进：本轮结束后自动作为新消息发送",
  followUpPlaceholder: "排队为下一条消息，本轮结束后自动发送",
  followUpPlaceholderShort: "排队为下一条消息…",
  followUpSend: "排队为下一条消息",
  /** Server-side queued follow-up count (auto-sent once the current run finishes). */
  followUpQueuedChip: (n: number) => `${n} 条跟进消息已排队，本轮结束后自动发送`,
  /** One queued follow-up's hint line, with its content (per-entry variant of followUpQueuedChip). */
  followUpQueuedItem: (content: string) => `跟进消息已排队，本轮结束后自动发送：${content}`,
  /** Accessible name of the recall control on a queued steering / follow-up line — it is icon-only (a curved-back arrow), so this is what names it for screen readers (#287). */
  recallQueued: "撤回",
  /** Its tooltip: what the icon does, spelled out. */
  recallQueuedTitle: "撤回到输入框，编辑后重新发送",
  send: "发送",
  stop: "停止",
  compact: "压缩上下文",
  approve: "允许",
  deny: "拒绝",
  decisionAllow: "已批准",
  decisionDeny: "已拒绝",
  decisionManual: "手动",
  decisionAuto: "自动",
  decisionPolicy: "策略",
  thinking: "思考",
  subagent: "子会话",
  subagentRunning: "运行中",
  /**
   * Abort banner (user interruptions only). The cause localizes from `errorCode`;
   * `errorMessage` (raw, untranslatable) rides verbatim. A legacy Trace without a code
   * renders its English `reason` prose as-is.
   */
  aborted: (item?: { errorCode?: string; errorMessage?: string; reason?: string }) => {
    const cause =
      item?.errorCode === "user_abort"
        ? "用户中断"
        : item?.errorCode === "backoff_interrupted"
          ? "重试等待中被中断"
          : item?.errorCode === "compaction_interrupted"
            ? "压缩过程中被中断"
            : (item?.errorCode ?? item?.reason ?? "");
    const text = cause ? `${cause}${item?.errorMessage ? `：${item.errorMessage}` : ""}` : "";
    return `[已中断]${text ? `：${text}` : ""}`;
  },
  /**
   * Reconnect hint line; `secondsLeft` (waiting state only) switches to the live-countdown
   * wording. `retryable` is the live status; the finer spellings only appear when
   * replaying Traces written before the stop-reason convergence.
   */
  reconnect: (
    status: "retryable" | "failed" | "timeout" | "malformed",
    state: "waiting" | "retried" | "gaveUp",
    attempt: number,
    secondsLeft?: number,
    errorMessage?: string,
    errorCode?: string,
  ) => {
    // The live protocol carries the classified cause on error_code; the legacy status
    // spellings (failed/timeout/malformed) say the same thing for pre-convergence Traces.
    const kind = errorCode ?? status;
    const cause =
      kind === "timeout"
        ? "连接超时或网络中断"
        : kind === "malformed"
          ? "响应不完整或无法解析"
          : kind === "network"
            ? "网络或服务暂时不可用"
            : kind === "failed"
              ? "模型服务返回错误"
              : "请求失败";
    const action =
      state === "gaveUp"
        ? `第 ${attempt} 次尝试后放弃${errorMessage ? `：${errorMessage}` : ""}`
        : state === "retried"
          ? `已发起第 ${attempt} 次重试`
          : secondsLeft !== undefined
            ? `第 ${attempt} 次重试，${secondsLeft} 秒后发起…`
            : `正在发起第 ${attempt} 次重试…`;
    return `[重试] ${cause}，${action}`;
  },
  /** Run-ending LLM failure banner (request_end status fatal); the provider's error text rides verbatim. */
  llmError: (errorMessage?: string) =>
    `[错误]：模型请求错误${errorMessage ? `：${errorMessage}` : ""}`,
  /** "Retry now" on the reconnect countdown (skips the remaining backoff wait). */
  reconnectRetryNow: "立即重试",
  /** "Give up" on the reconnect countdown (the ordinary session abort). */
  reconnectGiveUp: "放弃",
  imageAlt: "用户上传的图片",
  toolImageAlt: "工具输出的图片",
  imagesAsPathHint:
    "当前模型不支持直接查看图片：发送时图片将保存到会话临时目录，以文件路径转交（模型经 read_file 查看）",
  infoPanel: "Session 信息",
  sessionStats: "统计",
  /** Info-dropdown Session id row: the id itself is a click-to-copy button. */
  sessionIdLabel: "Session id",
  copySessionId: "复制 Session ID",
  /** Info-dropdown list of background processes the conversation started, and its per-row actions (Stop on running rows, Remove on exited ones). */
  processList: "会话进程",
  processStop: "停止",
  processExited: "已退出",
  processRemove: "移除",
  /** Remove button tooltip: removal also drops the output captured from that process. */
  processRemoveHint: "移除该条目——该进程已捕获的输出也会一并丢弃",
  /** The list heading's text action: removes every exited entry at once; its hint says the captured output goes too. */
  processClearExited: "清除已退出",
  processClearExitedHint: "清除所有已退出的进程——它们已捕获的输出也会一并丢弃",
  statTokens: "Token 累计",
  /** Info-dropdown stats list: the tokens bullet's label and its cache-hit-rate parenthetical (rate = cacheRead ÷ all input, e.g. "68%"). */
  statTotalTokens: "总 Token",
  statCacheHit: (pct: string) => `缓存命中率 ${pct}`,
  statElapsed: "用时",
  /**
   * The elapsed time's two measured components, shown in parentheses after it. They may
   * overlap (a background tool runs while the model decodes) and may leave a remainder
   * (approval waits, harness overhead), so this reads as two measurements, never as a split.
   */
  statElapsedSplit: (apiMs: string, toolMs: string): string => `API ${apiMs}，工具 ${toolMs}`,
  statInput: "输入 tokens",
  statCached: "已缓存",
  statOutput: "输出 tokens",
  statTps: "输出 TPS",
  /** Copied-stats-line parenthesis wrappers around the cached amount (fullwidth for zh typography). */
  statParenOpen: "（",
  statParenClose: "）",
  noSessions: "还没有 Session",
  /** The routed conversation is on a machine with no connection held: not gone, just out of reach from here. */
  sessionOnOfflineMachine: (machine: string) => `这个对话在 ${machine} 上，当前没有连接。`,
  sessionOnOfflineMachineUnknown: "这个对话在某台机器上，当前没有连接。",
  sessionOfflineHint: "连接恢复后会自动打开。",
  emptyStream: "发送一条消息开始对话",
  historyLoadFailed: "历史消息加载失败",
  statsLabel: "统计信息",
  removeImage: "移除图片",
  openAgents: "智能体面板",
  workspacePanel: "文件浏览",
  /** File summary card at the end of a message (Codex-style): title, inline preview action, and collapsed row. */
  filesInMessage: (n: number) => `${n} 个文件`,
  imagesInMessage: (n: number) => `${n} 张图片`,
  openPreview: "点击预览",
  showMoreFiles: (n: number) => `显示其余 ${n} 个文件`,
  showLess: "收起",
  /** Memory-change card below the file summary and the Memory side panel: titles, scope/op tooltips, collapsed row. */
  memoryChangesTitle: (n: number) => `${n} 条记忆更新`,
  memoryScopeWorkspace: (key: string) => `工作区记忆（${key}）`,
  memoryOpWrite: "写入",
  memoryOpEdit: "编辑",
  memoryViewTitle: "记忆",
  memoryChangedMark: "本次对话已更改",
  memoryContentUnavailable: "无法加载内容（文件可能已被移动或删除）",
  memoryRowOpen: "查看内容",
  /** The memory-change card header's text action: opens the Memory panel on its list (a visible label rather than a second brain glyph beside the card's own). */
  memoryOpenList: "打开记忆列表",
  memoryBack: "返回列表",
  memoryEmptyAll: "还没有任何记忆——在对话里说「记住……」即可让 agent 保存",
  /** Visible label on the Memory panel's header link (not a tooltip-only glyph): says what the click does and where it lands. */
  openAgentMemory: "在 Agent 设置中管理",
  memoryShowMore: (n: number) => `显示其余 ${n} 条`,
  /** Sidebar group pagination (#139): the pager's step buttons and the "2/5" readout's accessible name. */
  prevGroupPage: "上一页分组",
  nextGroupPage: "下一页分组",
  groupPagePosition: (page: number, total: number) => `第 ${page} 页，共 ${total} 页`,
  contextUsage: "上下文占用",
  contextUnknown: "上下文占用：压缩后待下次请求回报",
  /** Context ring -> composition panel: the trigger's accessible name, the six part labels, the tool ranking, and the panel's empty / failed states. */
  contextComposition: "上下文构成",
  contextPartSystemPrompt: "系统提示词",
  contextPartToolDefs: "工具定义",
  contextPartUserMessages: "用户消息",
  contextPartAssistantMessages: "模型消息",
  contextPartToolRequests: "工具请求",
  contextPartToolResults: "工具结果",
  contextTopTools: "工具用量 Top 5",
  /** Under the bar: the model window the bar is scaled to. */
  contextWindowIs: (n: string): string => `最大上下文 ${n}`,
  contextTopToolsHint: "按每个工具的调用与结果所占上下文排序（工具定义计入「工具定义」一项）",
  contextTopFiles: "文件用量 Top 5",
  contextTopFilesHint:
    "按每个文件经 read_file / edit_file / write_file 的调用与结果所占上下文排序（悬停显示完整路径）",
  /** The ranking switch: the group's accessible name, its two buttons, and the Files view's empty state. */
  contextRankLabel: "切换排行",
  contextRankTools: "工具",
  contextRankFiles: "文件",
  contextNoFileTraffic: "本轮上下文没有文件读写",
  contextUnknownHint: "刚压缩过，占用待下次请求回报，届时才能给出构成",
  contextBreakdownEmpty: "当前上下文还没有可统计的内容",
  contextBreakdownFailed: "读取上下文构成失败",
  /** The dashed cutter on the panel's bar: its accessible name, and its tooltip naming the threshold it stands on. */
  contextThresholdCutter: "压缩阈值",
  contextThresholdHover: (n: string): string => `压缩阈值 ${n}（拖动可调整）`,
  /** Tooltip of the hatched stretch of the bar past the cutter: room the model has, unusable before compaction fires. */
  contextBeyondThreshold: "压缩阈值之上的空间：压缩会先触发，这部分暂时用不到",
  /** Confirmation for a dragged (or arrowed) threshold: dialog name, body (agent name + the threshold being replaced), the editable field and its rejection, the note when the model window will cut the typed value down, and the toast on success. */
  contextThresholdTitle: "修改压缩阈值",
  contextThresholdBody: (agentName: string, old: string): string =>
    `把 ${agentName} 的压缩阈值从 ${old} 改为下面的值？立即生效，包括正在进行的对话。`,
  contextThresholdField: "压缩阈值（token）",
  contextThresholdInvalid: "必须是大于 0 的整数",
  contextThresholdCapped: (n: string): string => `超出模型窗口，实际生效的阈值是 ${n}`,
  contextThresholdSaved: (n: string): string => `压缩阈值已改为 ${n}，立即生效`,
  /** Composer notice: the model's window is below the Agent's configured compaction threshold; n = window, m = threshold. */
  contextWindowUnderThreshold: (n: string, m: string): string =>
    `当前模型的上下文窗口 ${n} 小于本 Agent 的压缩阈值 ${m}，压缩实际会在窗口边缘触发。拖动上下文面板里的虚线或在 Agent 设置中把阈值调到窗口以下，立即生效。`,
  contextWindowUnderThresholdAction: "打开 Agent 设置",
  contextWindowUnderThresholdDismiss: "忽略",
  slashHint: "输入 / 使用命令",
  /** `/agent` handoff: command description, picker title, search box, no-match hint, and the staged target's description and remove button. */
  switchAgent: "交给其他 Agent，发送时开启新会话",
  switchAgentTitle: "选择 Agent",
  agentSearchPlaceholder: "搜索 Agent：id / 名称",
  agentsNoMatch: "没有匹配的 Agent",
  handoffTargetTitle: (agent: string) => `发送后交接给 ${agent}`,
  handoffRemove: "移除交接目标",
  /** Skill multi-select dropdown (input toolbar): button text, search box, empty state, and no-match hint. */
  skillsSelect: "技能",
  skillRemove: "移除技能",
  skillsSearchPlaceholder: "搜索技能",
  skillsNoMatch: "没有匹配的技能",
  skillsEmptyHint: "暂无已装技能，去技能库添加",
  /** Auto-generated invocation text when skills are selected and the body is empty (wrapped in [use_skills] before sending). */
  skillsAutoMessage: (names: string[]): string => `使用 ${names.join("、")} 技能`,
  handoffFrom: (agent: string) => `由 ${agent} 的对话交接而来`,
  handoffBack: (title?: string) => (title ? `回到原对话：${title}` : "回到原对话"),
  /** `/model` switch: command description, picker title, the staged target's description and remove button, the switch-origin banner, and the empty-body auto message. */
  switchModel: "切换模型，发送时开启新会话延续本对话",
  switchModelTitle: "切换模型",
  modelSwitchTargetTitle: (model: string) => `发送后换用 ${model} 延续本对话`,
  modelSwitchRemove: "移除切换模型",
  /** Why Send is disabled with a model switch staged: the fork branches off a Trace this Session is still writing. */
  modelSwitchBusyHint: "本轮结束后才能切换模型：新会话要从当前会话的记录接续",
  modelSwitchFrom: (prevModel?: string) =>
    prevModel ? `已切换模型（原为 ${prevModel}），延续原会话` : "已切换模型，延续原会话",
  /** First message body auto-sent when `/model` is staged and the composer is empty (same convention as skillsAutoMessage). */
  modelSwitchAutoMessage: "换用新模型继续这段对话",
  /** Toast when the session-state (locked) model display is clicked: points at the `/model` command. */
  modelLockedHint: "输入 /model 切换模型",
  scheduledFrom: (name: string) => `由定时任务「${name}」触发`,
  /** `[org_trigger]` banner: what the organization scheduler sent this desk or ticket session, folded into one line. */
  orgTriggerFrom: (org: string): string => `由组织「${org}」触发`,
  orgTriggerKinds: {
    init: "初始化",
    event: "日程",
    mention: "频道 @",
    ticket_notice: "工单通知",
    ticket_work: "工单任务",
  } as Record<string, string>,
  orgTriggerBudget: (budget: string): string => `预算 ${budget}`,
  /** One-line notice of a `[background_task_done]` harness message (run_in_background completion): the collapsed row's whole label. */
  backgroundDone: (
    kind: "command" | "subagent",
    status: "completed" | "failed" | "stopped",
  ): string => {
    const what = kind === "command" ? "后台命令" : "后台任务";
    if (status === "stopped") return `${what}已停止`;
    return status === "completed" ? `${what}完成` : `${what}失败`;
  },
  emptyGreeting: "开始一段新对话",
  /** Unified step-row titles (same header idiom as workRunning/workDone). */
  mcpConnectTitle: "MCP 连接",
  mcpServerList: (servers: string[]): string => servers.join("、"),
  /** One-line result detail: tool count, plus the NAMES of failed servers (reasons live in the expanded server groups). */
  mcpConnectResult: (toolCount: number, failed: string[]): string => {
    const parts: string[] = [];
    if (toolCount > 0 || failed.length === 0) parts.push(`发现 ${toolCount} 个工具`);
    if (failed.length > 0) parts.push(`不可用：${failed.join("、")}`);
    return parts.join("；");
  },
  /** Per-server group row meta inside the expanded connect row. */
  mcpToolsCount: (n: number): string => `${n} 个工具`,
  mcpServerFailed: "连接失败",
  mcpConnectAborted: "已中断，下次发送时重新连接",
  /** The bare mode word — the Trace view's round badge, the failed row's title, and the stem of the two state titles below — so a `discard` is never announced as compaction: it clears the context rather than compacting it. */
  compactionTitle: (mode: string): string => (mode === "discard" ? "清空" : "压缩"),
  /** The row's title doubles as its status, the work-group header's idiom (`workRunning` / `workDone`): 压缩中 / 清空中 while the step runs, 压缩完毕 / 清空完毕 once it settles. With mode and state both in the title nothing is left for a detail line on either side — a `summarize` shows its summary in its own expandable body — so only `compactionFailed` keeps the detail slot, carrying the one thing a title cannot. */
  compactionRunning: (mode: string): string => (mode === "discard" ? "清空中" : "压缩中"),
  compactionDone: (mode: string): string => (mode === "discard" ? "清空完毕" : "压缩完毕"),
  /** The summarize row's second body section (the first reuses `thinking`): the summary the compaction request wrote. */
  compactionResult: "压缩结果",
  compactionFailed: (status: string, errorMessage?: string): string => {
    if (status === "aborted") return "已中断，保留当前上下文";
    const detail = errorMessage !== undefined ? `（${errorMessage}）` : "";
    // retryable = 本次放弃、下次触发自动重试；fatal = 需先修复模型配置或凭据。旧 Trace 两者都拼作 "failed"。
    if (status === "retryable") return `失败${detail}，保留当前上下文，下次触发时重试`;
    if (status === "fatal") return `失败${detail}，保留当前上下文，需修复模型配置后重试`;
    return `失败${detail}，保留当前上下文`;
  },
  unknownTool: "（未知工具）",
  /**
   * Short display names for the built-in tools, keyed by the name the model calls them
   * by. The tool-call card shows these while the Appearance switch is on; a tool absent
   * from this table (MCP tools, names only older Traces carry) renders as itself.
   */
  toolAliases: {
    read_file: "读取",
    write_file: "写入",
    edit_file: "编辑",
    exec_command: "执行命令",
    input_command: "跟进命令",
    run_subagent: "子智能体",
    input_subagent: "交流",
  } as Record<string, string>,
  workRunning: "运行中",
  workDone: "运行完毕",
  workGroupSteps: (n: number) => `${n} 步`,
  approvalWaiting: "待审批",
  copyCode: "复制代码",
  copyReply: "复制回复",
  forkSession: "从这里分叉对话",
  forkSessionConfirmBody: "将把这段对话（截至这条回复）复制为一个新对话，原对话保持不变。",
  forkSessionConfirmAction: "分叉",
  forkSessionFailed: "无法定位这条回复，请刷新后重试。",
  copyMessage: "复制消息",
  deleteSession: "删除对话",
  renameSession: "重命名对话",
  renameSessionLabel: "标题",
  deleteSessionConfirm: (title: string) =>
    `确定删除「${title}」？该对话的消息与 Trace 将被移除，且不可恢复。`,
  /** Parked draft conversations (unsent new chats living in the sidebar list — see draft-sessions.ts). */
  draftGroup: "草稿",
  draftUntitled: "（无标题草稿）",
  deleteDraft: "删除草稿",
  deleteDraftConfirm: (title: string) => `确定删除草稿「${title}」？未发送的内容将被丢弃。`,
  archiveSession: "归档",
  unarchiveSession: "取消归档",
  /** Per-row ellipsis overflow menu (pin / rename / archive / delete live inside it) and the row-level pin. */
  pinSession: "置顶",
  unpinSession: "取消置顶",
  pinnedSession: "已置顶",
  /** The hover ellipsis button that opens the row's full context menu. */
  moreActions: "更多",
  /** Sidebar group "reveal/load next page" row (display cap + server paging). */
  loadMore: "更多",
  /** Per-group reveal row: n = conversations THIS group still hides (one click reveals/loads one page more). */
  expandRestSessions: (n: number) => `展开其余 ${n} 个对话`,
  /** Time mode's whole-list paging row: its buckets span every Agent, so one row below them fetches the next page rather than each bucket claiming to. */
  loadMoreSessions: "加载更多会话",
  /** Collapsed sidebar folders inside a group (lazy-loaded); the count is the group's exact server share. */
  folderGroups: {
    subagent: (n: number) => `子智能体（${n}）`,
    schedule: (n: number) => `定时任务（${n}）`,
    benchmark: (n: number) => `评估任务（${n}）`,
    archived: (n: number) => `已归档（${n}）`,
  },
  /**
   * Tooltip of a folder-only group's header — a group with no active conversation of its
   * own, only rows inside its folders (it renders collapsed and sorts last). `n` is what
   * those folders hold, which is also the count the dimmed header shows; the Workspace path
   * follows where the header has one, since this sentence replaces the tooltip that carried it.
   */
  folderOnlyGroup: (n: number, path?: string) =>
    `仅有折叠任务：${n} 个会话${path ? `（${path}）` : ""}`,
  skillsBanner: (names: string[]): string => `使用技能：${names.join("、")}`,
  /** Attached-file notice above a user message (file names only; the paths stay in the Trace). */
  attachedFilesBanner: (names: string[]): string => `附加文件：${names.join("、")}`,
  /** Composer "+" extension menu (image upload, file attachment, goal mode) and the goal chip. */
  plusMenu: "更多输入方式",
  uploadImage: "上传图片",
  uploadImageDesc: "为本条消息附加图片",
  uploadFile: "上传文件",
  uploadFileDesc: "文件存入会话临时目录，模型按路径读取",
  removeFile: "移除文件",
  /**
   * Toast for a picked file rejected before reading. The limit is admin-settable and differs
   * between file attachments and inline images, so it is passed in rather than written here.
   */
  attachmentTooLarge: (name: string, limitMb: number): string =>
    `${name} 超过 ${limitMb}MB 上限，未添加。`,
  /** Overlay covering the chat area while files are dragged over it (drag-and-drop upload). */
  dropFilesTitle: "松开以添加附件",
  dropFilesDesc: "图片与文件将添加到输入框",
  /** Toast when non-image files are dropped in goal mode (the objective carries images only). */
  dropFilesGoalHint: "目标模式仅支持附加图片，文件未添加。",
  goalMode: "目标模式",
  goalModeDesc: "循环运行直至目标完成",
  goalBudgetLabel: "Token 预算",
  goalBudgetUnlimited: "预算不限",
  goalBudgetValue: (value: string): string => `预算 ${value}`,
  goalBudgetPlaceholder: "例如 500k",
  goalBudgetHint: "支持 k/m 后缀；留空表示预算不限",
  goalBudgetInvalid: "无效预算：应为正数，可带 k/m 后缀（500k、2m）",
  goalBudgetSave: "保存预算",
  goalRemove: "退出目标模式",
  /** Label of the collapsed card a harness-injected user message renders as (a stop hook's continue, a goal round's protocol, a user_prompt hook's expansion). */
  harnessInjected: "由 harness 注入",
  goalProgress: (rounds: number, tokens: string): string => `第 ${rounds} 轮 · tokens ${tokens}`,
  goalStatus: {
    active: "进行中",
    complete: "已完成",
    blocked: "受阻",
    budget_limited: "预算耗尽",
    aborted: "已中断",
  } as Record<string, string>,
};

export type ChatStrings = typeof chatZh;

export const chatEn: ChatStrings = {
  thinkingLevelChangeNote:
    "Applies right away. Changing it invalidates the model's cached context — compacting first is recommended.",
  surface: {
    conversation: "Conversation",
    chooseKind: "Choose what to open",
    open: "Open",
    opening: "Opening…",
    promptPlaceholder: "First prompt",
    exited: "The program has exited.",
    restart: "Open again",
    close: "Close",
    unavailable: "The plugin that renders this conversation is not loaded.",
    noRenderer: "This build has no renderer for it.",
    noTerminal: "The surface offered no terminal.",
  },
  newSessionMenu: "New chat",
  chooseAgent: "Choose agent",
  chooseModel: "Choose model",
  thinkingLevel: "Thinking level",
  /** Tier names for the thinking-level controls: the wire value itself, so the label names the value actually sent (per maintainer request). `none` exists purely to display a stored legacy value — it is never offered as a choice (many models cannot disable thinking). */
  thinkingLevelNames: {
    none: "none",
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "xhigh",
    max: "max",
  },
  /** English has no trigger/menu split to make: the name above already IS the wire value, so a menu row annotating it would only repeat itself. Taking just the name (the second parameter is dropped) is how this locale says "same text on every surface". */
  thinkingLevelMenuName: (name: string, _level: string): string => name,
  thinkingSwitchTitle: "Switch thinking level",
  thinkingSwitchBody: (to: string): string =>
    `Switch the thinking level to "${to}"? Switching mid-conversation lowers the prompt-cache hit rate and raises cost; compacting the context first is cheaper.`,
  thinkingSwitchBusyHint: "This conversation is still working — compaction has to wait for it.",
  thinkingSwitchCompactFirst: "Compact, then switch",
  thinkingSwitchConfirm: "Switch anyway",
  thinkingSwitchCompacting: "Compacting the context — the thinking level switches when it ends.",
  thinkingSwitchApplied: (to: string): string =>
    `Context compacted; thinking level switched to "${to}".`,
  thinkingSwitchCompactFailed:
    "The compaction did not finish; the thinking level was switched anyway.",
  /** The machine a workspace lives on; the row only shows when more than one is reachable. */
  workspaceMachine: "Machine",
  workspaceHere: "here",
  /** Why a listed machine cannot be picked — shown ON its row, where the question is asked. */
  workspaceMachineWhy: {
    "no-identity": "not identified",
  },
  workspaceUseThis: "Use this dir",
  workspaceUp: "Parent dir",
  workspaceNoSubdirs: "No subdirectories",
  workspaceAuto: "Temporary workspace",
  workspaceClear: "Use a temporary workspace instead",
  workspaceDirInvalid: "Directory does not exist or is inaccessible; reverted",
  /** Sidebar conversation-list grouping toggle (workspace is the default) + workspace groups. */
  groupByWorkspace: "Group by workspace",
  groupByAgent: "Group by agent",
  groupByTime: "Group by time",
  /** Time-mode bucket names (last day / last month / older), by last activity. */
  timeGroups: {
    day: "Past day",
    month: "Past month",
    earlier: "Earlier",
  },
  /** Session-list section header controls: search / list settings / mode-dependent create (the created object follows the grouping mode). */
  searchSessions: "Search chats",
  searchSessionsPlaceholder: "Search chats…",
  searchClear: "Clear search",
  /** Zero hits: the filter only sees already-loaded conversations, so the copy says so rather than claiming none exist. */
  searchNoMatches: "No matches among loaded chats",
  listSettings: "List options",
  groupModeSection: "Group by",
  sortModeSection: "Sort by",
  sortManual: "Manual order",
  sortRecent: "Most recent",
  newWorkspaceEntity: "New workspace",
  /** Registry-backed workspace group's overflow (… right of the header "+"): alias rename + sidebar-only removal. */
  workspaceMenu: "Workspace options",
  renameWorkspace: "Rename workspace",
  renameWorkspaceLabel: "Name",
  renameWorkspaceHint: "Leave empty to use the folder name",
  deleteWorkspace: "Remove workspace",
  deleteWorkspaceConfirm: (name: string) =>
    `Remove "${name}"? This only removes the workspace group from the sidebar — the directory on disk and existing chats are untouched, and it can be re-added anytime.`,
  tempWorkspaces: "Temporary workspaces",
  onMachine: (name: string, machine: string) => `${name} [SSH: ${machine}]`,
  machineTag: (machine: string) => `[SSH: ${machine}]`,
  newSessionInWorkspace: "New chat in this workspace",
  draftSubtitle: "The self-evolving agent that excels at AI development tasks",
  /** Folder names for the draft page's collapsible examples (bookmark-style: exactly one open at a time). */
  exampleFolders: {
    webapps: "Build web apps",
    agents: "Build and optimize agents",
    schedules: "Create scheduled tasks",
  },
  /** Second tooltip line on an example row: the click fills the composer, it does not send. */
  exampleFillHint: "Click to fill the composer — edit it if you like, then send",
  shortcuts: {
    folder: "My shortcuts",
    new: "New shortcut",
    newFromComposer: "Starts from whatever is in the composer",
    createTitle: "New shortcut",
    editTitle: "Edit shortcut",
    titleLabel: "Name",
    titleHint: (max: number) => `At most ${max} characters`,
    promptLabel: "Prompt",
    promptHint: (max: number) => `At most ${max} characters`,
    promptInfo:
      "Clicking this shortcut puts the text into the composer verbatim and sends nothing; Skills stay a separate pick in the composer.",
    titleTooLong: (max: number) => `The name may be at most ${max} characters`,
    promptTooLong: (max: number) => `The prompt may be at most ${max} characters`,
    deleteTitle: "Delete shortcut",
    deleteConfirm: (title: string) =>
      `Delete "${title}"? The shortcut disappears from every device you use.`,
  },
  exampleTasks: {
    game: {
      label: "2D penguin sled game",
      desc: "A cute Antarctic penguin sleds over rocks, easy start with a gentle difficulty ramp — a 2D pure-frontend mini game",
      prompt:
        "Build a cute Antarctic penguin sledding 2D game: press Space to jump over the rocks " +
        "coming up on the ice; start easy and forgiving, with sled speed and obstacle density " +
        "ramping up smoothly and gradually over time (no sudden spikes), live scoring, and " +
        "hitting a rock ending the run with one-click restart. " +
        "A 2D side-scroller with a cute cartoon look, pure frontend (a single HTML file is " +
        "fine), styled per the web-design skill. " +
        "When done, test it in a browser once, confirm the first few seconds are easy to " +
        "clear, and tell me how to open it and how to play.",
    },
    gamecenter: {
      label: "A mini-game center built by multiple agents",
      desc: "Ten pure-frontend games with no repeated mechanics, built in parallel behind one index page",
      prompt: `Build a web mini-game center with multiple agents working in parallel: 10 pure-frontend games with no two sharing the same mechanic, plus an index page.

## How to split the work
- First plan the 10 games (say snake, 2048, tetris, breakout, minesweeper, memory match, sokoban, space shooter, platform jumper, rhythm tap), confirm no two mechanics repeat, and fix a shared directory layout, palette and interaction spec.
- Then hand the 10 games to several subagents to implement in parallel — each subagent owns exactly one game, follows the agreed spec, and never edits another's files.

## Each game
- Its own \`games/<slug>/index.html\`: pure frontend, a single file that runs straight from file://, with no backend and no CDN assets.
- Start / restart, live score or timer, a lose-or-clear summary, both keyboard and touch controls, and the rules written on the page.
- A way back to the index page.

## Index page
- \`index.html\` at the root: a card grid listing all 10 games (name + one-line mechanic + controls), each card opening its game.
- One design language shared with every game, following the web-design skill.

## Wrap-up
- Review as a whole: the 10 mechanics really are distinct, the styling is consistent, and every index link resolves.
- Self-test each game in a browser — it starts, it ends, it restarts — then tell me how to open it.`,
    },
    lol: {
      label: "League of Legends music player",
      desc: "Worlds anthems on the SoundCloud Widget API — a single file that opens from file://",
      prompt: `Build a League of Legends Worlds anthem player with the SoundCloud Widget API (see https://developers.soundcloud.com/docs/api/html5-widget): a single index.html that works when opened from file://.

## Technical constraints
- Use the SC.Widget JS API (widget.load / widget.toggle / widget.setVolume / widget.seekTo), loading https://w.soundcloud.com/player/api.js
- The iframe must stay visible (180px tall), with visual=true color=f0b90b single_active=true
- Include ONLY these 8 tracks confirmed playable (oEmbed-verified); do not add tracks that are not oEmbed-verified:
- Warriors (S4) — soundcloud.com/leagueoflegends/warriors
- Worlds Collide (S5) — soundcloud.com/leagueoflegends/worlds-collide
- Legends Never Die (S7) — soundcloud.com/leagueoflegends/legends-never-die
- Phoenix (S9) — soundcloud.com/leagueoflegends/phoenix
- Burn It All Down (S11) — soundcloud.com/leagueoflegends/burn-it-all-down
- GODS (S13) — soundcloud.com/leagueoflegends/gods
- Heavy Is The Crown (S14) — soundcloud.com/linkinpark/heavy-is-the-crown
- Sacrifice (S15) — soundcloud.com/leagueoflegends/sacrifice

## Layout
- Left 260px sticky sidebar: the track list (S4/S5/… badge + emoji + title + year); clicking highlights with a gold border and switches tracks via SC.Widget.load() with auto_play
- Right main area: hero title + a desktop clock (80px monospace gold HH:MM:SS, refreshed every second, blinking colons) + a mood tag
- Player card: the SoundCloud iframe + a custom control bar (⏮ ▶/⏸ ⏭ + track info + a volume slider; clicking the speaker icon toggles mute)
- Mood-wave section: 15 gold animated bars, re-randomized on every track switch
- Keyboard shortcuts: Space play/pause, ← → previous/next, ↑ ↓ volume

## Design
Penguin visual style (see the web-design skill), dark by default. On phones the sidebar becomes a horizontally scrolling top bar.

When done, open index.html in a browser and self-test once.`,
    },
    rhythmRunner: {
      label: "Rhythm runner mini game",
      desc: "A Muse Dash-style rhythm runner: a penguin lead, notes locked to the beat, graded Perfect / Great / Miss",
      prompt:
        "Build a Muse Dash-style rhythm runner: a penguin runs forward on its own, and notes — " +
        "drawn as music-note icons — fly in locked to the beat for me to hit. Show Perfect / " +
        "Great / Miss for each hit, score combos, and let the difficulty climb as the track goes " +
        "on. Pure front end, one file, playable straight from file://.",
    },
    investmentCopilot: {
      label: "Conversational investment analyst",
      desc: "A conversational market Copilot on the Penguin SDK: the home page lists what is trending, with the market factors behind every call",
      prompt:
        "Build a conversational stock-market Copilot on the Penguin SDK, along the lines of " +
        "perplexity.ai/finance: from startup it pulls live market data every 5 minutes, and the " +
        "home page lists the stocks trending strongest lately alongside how the sectors compare. " +
        "Every call has to name the market factors behind it — policy, sector news, fund flows, " +
        "earnings, macro data — rather than technical indicators. Analysis of public data, not " +
        "investment advice. Its stock-lookup tool has to handle questions like \"look up Zhipu's " +
        'stock for me": resolve a company name to its ticker itself, and when there is no match ' +
        "or the company is not listed, say so rather than inventing a quote.",
    },
    missionControl: {
      label: "Build a custom workflow UI: mission control",
      desc: "A workflow tab beside the chat: dispatch a task to several agents at once and watch every Session's live status",
      prompt:
        "Build yourself a workflow: a mission-control tab beside this chat. I type a task and pick " +
        "one or more of this Project's Agents; it opens a Session for each and runs them in " +
        "parallel. Every run is a card with a live, animated status (queued, running, done) and " +
        "its elapsed time, and the board survives a reload. Add a second tab with the numbers — " +
        "runs per Agent, average duration — and a button that fills the whole app, like a wall " +
        "display. Take every colour from the theme variables so it looks right in light and dark.",
    },
    agentBenchmarkBuild: {
      label: "Build a general-purpose decision agent and its benchmark",
      desc: "Create a general decision Agent and test it on football, after-sales, and investment tasks",
      prompt: `Use \`agent-initialization\` followed by \`benchmark-design\` to create a decision Agent and produce a frozen Benchmark with a Formal Baseline.

Agent:
- id: \`finite_choice_agent\`
- capability: make stable, explainable finite choices when public information is incomplete or conflicting
- installed_skills: \`[]\`

Benchmark:
- id: \`contextual-choice-adaptation\`
- capability: form and transfer a stable finite-choice decision process from public rules, historical examples, and current facts
- desired_baseline_score: \`<75\`
- pilot_iteration_limit: \`5\`

Scenarios:
1. Make football betting decisions from historical matches and current information.
2. Choose after-sales actions from policy and ticket facts.
3. Choose investment actions from a strategy, historical markets, and current indicators.`,
    },
    agentOptimization: {
      label: "Improve the general-purpose decision agent's accuracy",
      desc: "Improve an Agent from existing evaluation results and verify that the new version is better",
      prompt: `Use \`agent-optimization\` to optimize a decision Agent against its frozen Benchmark.

- test_agent_id: \`finite_choice_agent\`
- benchmark_id: \`contextual-choice-adaptation\`
- capability_direction: improve stability under incomplete information, conflicting rules, and finite choices
- runs: \`3\`
- desired_score: \`>=95\`
- candidate_round_limit: \`5\``,
    },
    dailyPlan: {
      label: "A 9am daily planning check-in",
      desc: "09:00 every day: talk through the day's plan in this same chat, and review yesterday's progress",
      prompt:
        "Set up a scheduled task: every day at 9am, in this same conversation, plan today's work " +
        "with me. Read back over the conversation first and say what yesterday's plan got done and " +
        "where it stuck, then offer an ordered shortlist for today with a line of reasoning each, " +
        "and write up what I confirm as a checklist.",
    },
    githubDigest: {
      label: "Daily GitHub project digest",
      desc: "A daily pass over one repo's issues, PRs and CI, ending in prioritized recommendations",
      prompt:
        "Set up a scheduled task: every morning, use gh to digest one GitHub repo's issues, PRs " +
        "and CI — surface what has stalled, what is waiting on review and what is failing — and " +
        "end with recommendations ranked by priority, each saying why it sits where it does.",
    },
    memoryReview: {
      label: "Friday memory review",
      desc: "Friday evening: go through what is worth remembering from the week and write it into Memory",
      prompt:
        "Set up a scheduled task: every Friday evening, in this same conversation, go through " +
        "what is worth remembering from the week with me. Check the existing memory index first so " +
        "nothing is duplicated, then take it item by item — what to record, what to revise — and " +
        "write what I confirm into Memory.",
    },
  },
  sessionList: "Sessions",
  defaultSessionTitle: "New chat",
  agent: "Agent",
  model: "Model",
  workspace: "Workspace",
  workspaceHint:
    "Leave empty for an auto-created temporary workspace; if set, it must be an existing directory on the server",
  /** The same rule as `workspaceHint`, short enough to sit under a form field. */
  workspaceHintShort: "Leave empty for a temporary workspace",
  approvalMode: "Approval mode",
  /** The composer's permission button: one colored shield for the level, a menu of Fs / Network / More. */
  permission: {
    label: "Permissions",
    levels: {
      all: "Full access",
      partial: "Partial",
      "read-only": "Read only",
      off: "Off",
    } as Record<string, string>,
    fs: "Filesystem",
    fsModes: {
      "read-only": "Read only",
      "workspace-write": "Workspace write",
      "danger-full-access": "Full access",
    } as Record<string, string>,
    network: "Network",
    networkModes: {
      open: "Full access",
      local: "Local network (localhost only)",
      none: "No network",
    } as Record<string, string>,
    unsupported: "Not supported",
    localUnsupported: "No sandbox backend on this machine can limit the network to localhost",
    more: "More…",
    approval: "Approval",
  },
  approvalModeNames: {
    "allow-all": "Approve everything",
    "deny-all": "Deny everything",
    "read-only": "Approve read-only",
    "always-ask": "Ask every time",
  } as Record<string, string>,
  approvalModes: {
    "allow-all": "Approve everything (allow-all)",
    "deny-all": "Deny everything (deny-all)",
    "read-only": "Approve read-only (read-only)",
    "always-ask": "Ask every time (always-ask)",
  } as Record<string, string>,
  statusRunning: "Running",
  statusCompacting: "Compacting",
  /** Settled Session that finished since the user last opened it (the unread dot; a Session already read shows no glyph, so it needs no label). */
  statusCompletedUnread: "Done, unread",
  /** The background-task mark on a session row and the chat header's count: background processes plus background subagents still running. */
  backgroundTasks: (n: number) => (n === 1 ? "1 background task" : `${n} background tasks`),
  /** The session row's alarm clock: at least one enabled scheduled task is bound to this conversation (a paused one draws no mark). */
  sessionScheduled: "Has a scheduled task still to fire",
  /** The tool row's marker for the ONE call whose work went to the background — launched with `run_in_background`, or moved there by the user — rather than for a count. Bracketed, like the row's other outcome markers. */
  backgroundCall: "[Background]",
  /** The tool row's inline text action, shown while the call is executing (also its accessible name). */
  sendToBackground: "Send to background",
  /** Its tooltip: what the click does to the call and to the conversation. */
  sendToBackgroundHint:
    "Send this call to the background; the conversation carries on, and its completion arrives as a background notice.",
  pendingApprovals: (n: number) => `${n} pending approval${n > 1 ? "s" : ""}`,
  jumpToLatest: "Jump to latest",
  /** Top-of-stream affordance while the previous history window is being fetched (scroll-up backfill). */
  loadingEarlier: "Loading earlier messages…",
  /** Top-of-stream affordance after a backfill failure: click to retry fetching the previous window. */
  loadEarlierRetry: "Failed to load earlier messages — click to retry",
  /** Top-of-stream marker once the loaded history reaches the very beginning (shown only after a backfill happened). */
  historyBeginning: "Beginning of conversation",
  loadingLater: "Loading later messages…",
  loadLaterRetry: "Failed to load later messages — click to retry",
  outlineOpenFailed: "Could not open that turn",
  /** Conversation minimap (tick rail over the stream's left gutter): rail aria-label. */
  outlineTitle: "Outline",
  /** Tick accessible name: turn number + the question (or the no-text placeholder). */
  outlineTickLabel: (n: number, question: string) => `Turn ${n}: ${question}`,
  /** Entry label when the prompt had no text body (image / attachment-only message). */
  outlineNoText: "(image or attachment)",
  /** Answer-preview placeholder while the latest turn is still running with no reply text yet. */
  outlineAnswering: "Answering…",
  inputPlaceholder: "Type a message. Enter to send, Shift+Enter for newline, paste images",
  inputPlaceholderShort: "Type a message…",
  /** Placeholder while a Task is running (mid-run steering): the message is delivered between turns with the next request. */
  steerPlaceholder: "Message the running agent — delivered with the next turn",
  steerPlaceholderShort: "Message the running agent…",
  steerSend: "Send to the running agent",
  /** Queued hint shown after a successful steer, until the steering message appears in the stream. */
  steerQueuedIndicator: "Steering queued — delivered with the next turn",
  /** Same hint, with the queued message's content (from the server's undelivered-steering mirror; survives reloads). */
  steerQueuedItem: (content: string) =>
    `Steering queued — delivered with the next turn: ${content}`,
  /** Label of the [user_steering] chip (a mid-run user message delivered between turns). */
  userSteering: "User steering",
  /** Mid-run send-mode setting: steer (delivered mid-run) vs follow-up (queued until the run ends). */
  steerModeLabel: "Mid-run send mode",
  steerModeSteer: "Steer",
  steerModeSteerHint: "Steer now: delivered to the running agent with the next turn",
  steerModeFollowUp: "Queue",
  steerModeFollowUpHint:
    "Queue a follow-up: sent automatically as a new message when this run finishes",
  followUpPlaceholder: "Queue as the next message — sent automatically when this run finishes",
  followUpPlaceholderShort: "Queue as the next message…",
  followUpSend: "Queue as the next message",
  /** Server-side queued follow-up count (auto-sent once the current run finishes). */
  followUpQueuedChip: (n: number) =>
    `${n} follow-up ${n === 1 ? "message" : "messages"} queued — sent when this run finishes`,
  /** One queued follow-up's hint line, with its content (per-entry variant of followUpQueuedChip). */
  followUpQueuedItem: (content: string) =>
    `Follow-up queued — sent when this run finishes: ${content}`,
  /** Accessible name of the recall control on a queued steering / follow-up line — it is icon-only (a curved-back arrow), so this is what names it for screen readers (#287). */
  recallQueued: "Recall",
  /** Its tooltip: what the icon does, spelled out. */
  recallQueuedTitle: "Recall to the input box to edit and resend",
  send: "Send",
  stop: "Stop",
  compact: "Compact context",
  approve: "Allow",
  deny: "Deny",
  decisionAllow: "Approved",
  decisionDeny: "Denied",
  decisionManual: "manual",
  decisionAuto: "auto",
  decisionPolicy: "policy",
  thinking: "Thinking",
  subagent: "Subagent",
  subagentRunning: "Running",
  /**
   * Abort banner (user interruptions only). The cause localizes from `errorCode`;
   * `errorMessage` (raw, untranslatable) rides verbatim. A legacy Trace without a code
   * renders its English `reason` prose as-is.
   */
  aborted: (item?: { errorCode?: string; errorMessage?: string; reason?: string }) => {
    const cause =
      item?.errorCode === "user_abort"
        ? "aborted by user"
        : item?.errorCode === "backoff_interrupted"
          ? "aborted during reconnect backoff"
          : item?.errorCode === "compaction_interrupted"
            ? "aborted during compaction"
            : (item?.errorCode ?? item?.reason ?? "");
    const text = cause ? `${cause}${item?.errorMessage ? `: ${item.errorMessage}` : ""}` : "";
    return `[Aborted]${text ? `: ${text}` : ""}`;
  },
  /**
   * Reconnect hint line; `secondsLeft` (waiting state only) switches to the live-countdown
   * wording. `retryable` is the live status; the finer spellings only appear when
   * replaying Traces written before the stop-reason convergence.
   */
  reconnect: (
    status: "retryable" | "failed" | "timeout" | "malformed",
    state: "waiting" | "retried" | "gaveUp",
    attempt: number,
    secondsLeft?: number,
    errorMessage?: string,
    errorCode?: string,
  ) => {
    // The live protocol carries the classified cause on error_code; the legacy status
    // spellings (failed/timeout/malformed) say the same thing for pre-convergence Traces.
    const kind = errorCode ?? status;
    const cause =
      kind === "timeout"
        ? "Connection timed out"
        : kind === "malformed"
          ? "Response incomplete or unparseable"
          : kind === "network"
            ? "Network or service temporarily unavailable"
            : kind === "failed"
              ? "The model provider returned an error"
              : "The request failed";
    const action =
      state === "gaveUp"
        ? `giving up after attempt ${attempt}${errorMessage ? `: ${errorMessage}` : ""}`
        : state === "retried"
          ? `retry #${attempt} sent`
          : secondsLeft !== undefined
            ? `retry #${attempt} in ${secondsLeft}s…`
            : `starting retry #${attempt}…`;
    return `[Retry] ${cause}; ${action}`;
  },
  /** Run-ending LLM failure banner (request_end status fatal); the provider's error text rides verbatim. */
  llmError: (errorMessage?: string) =>
    `[Error]: llm request error${errorMessage ? `: ${errorMessage}` : ""}`,
  /** "Retry now" on the reconnect countdown (skips the remaining backoff wait). */
  reconnectRetryNow: "Retry now",
  /** "Give up" on the reconnect countdown (the ordinary session abort). */
  reconnectGiveUp: "Give up",
  imageAlt: "Image uploaded by user",
  toolImageAlt: "Image from tool output",
  imagesAsPathHint:
    "This model cannot view images directly: on send, images are saved to the session scratchpad and passed as file paths (viewed via read_file)",
  infoPanel: "Session info",
  sessionStats: "Stats",
  /** Info-dropdown Session id row: the id itself is a click-to-copy button. */
  sessionIdLabel: "Session id",
  copySessionId: "Copy Session ID",
  /** Info-dropdown list of background processes the conversation started, and its per-row actions (Stop on running rows, Remove on exited ones). */
  processList: "Processes",
  processStop: "Stop",
  processExited: "exited",
  processRemove: "Remove",
  /** Remove button tooltip: removal also drops the output captured from that process. */
  processRemoveHint: "Remove this entry — the output captured from it is discarded too",
  /** The list heading's text action: removes every exited entry at once; its hint says the captured output goes too. */
  processClearExited: "Clear exited",
  processClearExitedHint:
    "Clear every exited process — the output captured from them is discarded too",
  statTokens: "Total Tokens",
  /** Info-dropdown stats list: the tokens bullet's label and its cache-hit-rate parenthetical (rate = cacheRead ÷ all input, e.g. "68%"). */
  statTotalTokens: "Total Tokens",
  statCacheHit: (pct: string) => `cache hit rate ${pct}`,
  statElapsed: "Elapsed",
  statElapsedSplit: (apiMs: string, toolMs: string): string => `API ${apiMs}, tools ${toolMs}`,
  statInput: "Input tokens",
  statCached: "cached",
  statOutput: "Output tokens",
  statTps: "Output TPS",
  /** Copied-stats-line parenthesis wrappers around the cached amount (ASCII with a leading space for en). */
  statParenOpen: " (",
  statParenClose: ")",
  noSessions: "No Sessions yet",
  /** The routed conversation is on a machine with no connection held: not gone, just out of reach from here. */
  sessionOnOfflineMachine: (machine: string) =>
    `This conversation is on ${machine}, which is not connected right now.`,
  sessionOnOfflineMachineUnknown:
    "This conversation is on a machine that is not connected right now.",
  sessionOfflineHint: "It will open as soon as the connection is back.",
  emptyStream: "Send a message to start the conversation",
  historyLoadFailed: "Failed to load history",
  statsLabel: "Stats",
  removeImage: "Remove image",
  openAgents: "Agents panel",
  /** Panel switcher (chat toolbar top-right): the "create" dropdown and its pin toggles. */
  workspacePanel: "Files",
  filesInMessage: (n: number) => `${n} ${n === 1 ? "file" : "files"}`,
  imagesInMessage: (n: number) => `${n} ${n === 1 ? "image" : "images"}`,
  openPreview: "Click to preview",
  showMoreFiles: (n: number) => `Show ${n} more ${n === 1 ? "file" : "files"}`,
  showLess: "Show less",
  memoryChangesTitle: (n: number) => `${n} memory ${n === 1 ? "update" : "updates"}`,
  memoryScopeWorkspace: (key: string) => `Workspace memory (${key})`,
  memoryOpWrite: "Wrote",
  memoryOpEdit: "Edited",
  memoryViewTitle: "Memory",
  memoryChangedMark: "Changed in this conversation",
  memoryContentUnavailable: "Content unavailable (the file may have been moved or deleted)",
  memoryRowOpen: "View content",
  /** The memory-change card header's text action: opens the Memory panel on its list (a visible label rather than a second brain glyph beside the card's own). */
  memoryOpenList: "Open memory list",
  memoryBack: "Back to the list",
  memoryEmptyAll: "No memory yet — say “remember …” in a chat to have the agent save one",
  /** Visible label on the Memory panel's header link (not a tooltip-only glyph): says what the click does and where it lands. */
  openAgentMemory: "Manage in agent settings",
  memoryShowMore: (n: number) => `Show ${n} more`,
  /** Sidebar group pagination (#139): the pager's step buttons and the "2/5" readout's accessible name. */
  prevGroupPage: "Previous groups",
  nextGroupPage: "Next groups",
  groupPagePosition: (page: number, total: number) => `Page ${page} of ${total}`,
  contextUsage: "Context usage",
  contextUnknown: "Context usage: unknown until the next request reports it",
  contextComposition: "Context composition",
  contextPartSystemPrompt: "System prompt",
  contextPartToolDefs: "Tool definitions",
  contextPartUserMessages: "User messages",
  contextPartAssistantMessages: "Model messages",
  contextPartToolRequests: "Tool requests",
  contextPartToolResults: "Tool results",
  contextTopTools: "Top 5 tools",
  contextWindowIs: (n: string): string => `Max context ${n}`,
  contextTopToolsHint:
    "Ranked by the context each tool's calls and results occupy (definitions count under “Tool definitions”)",
  contextTopFiles: "Top 5 files",
  contextTopFilesHint:
    "Ranked by the context each file's read_file / edit_file / write_file calls and results occupy; hover a row for the full path",
  contextRankLabel: "Ranking",
  contextRankTools: "Tools",
  contextRankFiles: "Files",
  contextNoFileTraffic: "No file traffic in this context",
  contextUnknownHint:
    "Just compacted — the next request reports the usage, and the composition with it",
  contextBreakdownEmpty: "Nothing in the current context to break down yet",
  contextBreakdownFailed: "Could not read the context composition",
  contextThresholdCutter: "Compaction threshold",
  contextThresholdHover: (n: string): string => `Compaction threshold ${n} (drag to adjust)`,
  /** Tooltip of the hatched stretch of the bar past the cutter: room the model has, unusable before compaction fires. */
  contextBeyondThreshold:
    "Room past the compaction threshold: compaction fires first, so this part is not usable yet",
  contextThresholdTitle: "Change the compaction threshold",
  contextThresholdBody: (agentName: string, old: string): string =>
    `Change ${agentName}'s compaction threshold from ${old} to the value below? It takes effect immediately, including the running conversation.`,
  contextThresholdField: "Compaction threshold (tokens)",
  contextThresholdInvalid: "Must be a whole number above 0",
  contextThresholdCapped: (n: string): string =>
    `Above the model window — the threshold in force will be ${n}`,
  contextThresholdSaved: (n: string): string =>
    `Compaction threshold changed to ${n}; it applies immediately`,
  contextWindowUnderThreshold: (n: string, m: string): string =>
    `This model's context window ${n} is smaller than this agent's compaction threshold ${m}, so compaction actually fires at the edge of the window. Drag the dashed mark in the context panel, or set the threshold below the window in the agent settings — it applies immediately.`,
  contextWindowUnderThresholdAction: "Open agent settings",
  contextWindowUnderThresholdDismiss: "Dismiss",
  slashHint: "Type / for commands",
  switchAgent: "Hand off to another agent — opens a new session on send",
  switchAgentTitle: "Choose agent",
  agentSearchPlaceholder: "Search agents: id / name",
  agentsNoMatch: "No matching agents",
  handoffTargetTitle: (agent: string) => `Sending hands this conversation to ${agent}`,
  handoffRemove: "Remove handoff target",
  skillsSelect: "Skills",
  skillRemove: "Remove skill",
  skillsSearchPlaceholder: "Search skills",
  skillsNoMatch: "No matching skills",
  skillsEmptyHint: "No skills installed yet — add some from the skill library",
  skillsAutoMessage: (names: string[]): string =>
    names.length === 1 ? `use the ${names[0]} skill` : `use the ${names.join(", ")} skills`,
  handoffFrom: (agent: string) => `Handed off from ${agent}'s conversation`,
  handoffBack: (title?: string) =>
    title ? `Back to the original conversation: ${title}` : "Back to the original conversation",
  switchModel: "Switch model — on send, continues this conversation in a new session",
  switchModelTitle: "Switch model",
  modelSwitchTargetTitle: (model: string) => `Sending continues this conversation on ${model}`,
  modelSwitchRemove: "Remove model switch",
  modelSwitchBusyHint:
    "The model switch waits for this turn to finish: the new session continues from this session's record",
  modelSwitchFrom: (prevModel?: string) =>
    prevModel
      ? `Switched model (was ${prevModel}) — continued from the earlier conversation`
      : "Switched model — continued from the earlier conversation",
  modelSwitchAutoMessage: "Continue this conversation on the new model",
  /** Toast when the session-state (locked) model display is clicked: points at the `/model` command. */
  modelLockedHint: "Type /model to switch models",
  scheduledFrom: (name: string) => `Triggered by scheduled task "${name}"`,
  /** `[org_trigger]` banner: what the organization scheduler sent this desk or ticket session, folded into one line. */
  orgTriggerFrom: (org: string): string => `Triggered by organization "${org}"`,
  orgTriggerKinds: {
    init: "Initialization",
    event: "Calendar event",
    mention: "Channel mention",
    ticket_notice: "Ticket notice",
    ticket_work: "Ticket work",
  } as Record<string, string>,
  orgTriggerBudget: (budget: string): string => `budget ${budget}`,
  /** One-line notice of a `[background_task_done]` harness message (run_in_background completion): the collapsed row's whole label. */
  backgroundDone: (kind: "command" | "subagent", status: "completed" | "failed" | "stopped") => {
    const what = kind === "command" ? "Background command" : "Background task";
    if (status === "stopped") return `${what} stopped`;
    return status === "completed" ? `${what} finished` : `${what} failed`;
  },
  emptyGreeting: "Start a new conversation",
  /** Unified step-row titles (same header idiom as workRunning/workDone). */
  mcpConnectTitle: "MCP connect",
  mcpServerList: (servers: string[]): string => servers.join(", "),
  /** One-line result detail: tool count, plus the NAMES of failed servers (reasons live in the expanded server groups). */
  mcpConnectResult: (toolCount: number, failed: string[]): string => {
    const parts: string[] = [];
    if (toolCount > 0 || failed.length === 0) {
      parts.push(`${toolCount} tool${toolCount === 1 ? "" : "s"} discovered`);
    }
    if (failed.length > 0) parts.push(`unavailable: ${failed.join(", ")}`);
    return parts.join("; ");
  },
  /** Per-server group row meta inside the expanded connect row. */
  mcpToolsCount: (n: number): string => `${n} tool${n === 1 ? "" : "s"}`,
  mcpServerFailed: "connection failed",
  mcpConnectAborted: "interrupted — reconnects on the next send",
  compactionTitle: (mode: string): string => (mode === "discard" ? "Clear" : "Compaction"),
  compactionRunning: (mode: string): string => (mode === "discard" ? "Clearing" : "Compacting"),
  compactionDone: (mode: string): string => (mode === "discard" ? "Cleared" : "Compacted"),
  compactionResult: "Result",
  compactionFailed: (status: string, errorMessage?: string): string => {
    if (status === "aborted") return "aborted, keeping current context";
    const detail = errorMessage !== undefined ? ` (${errorMessage})` : "";
    // retryable = abandoned this time, the standing trigger retries it; fatal = a config
    // or credential change has to come first. Legacy Traces spell both "failed".
    if (status === "retryable") {
      return `failed${detail}, keeping current context; retries at the next trigger`;
    }
    if (status === "fatal") {
      return `failed${detail}, keeping current context; fix the model configuration to retry`;
    }
    return `failed${detail}, keeping current context`;
  },
  unknownTool: "(unknown tool)",
  /**
   * Short display names for the built-in tools, keyed by the name the model calls them
   * by. The tool-call card shows these while the Appearance switch is on; a tool absent
   * from this table (MCP tools, names only older Traces carry) renders as itself.
   */
  toolAliases: {
    read_file: "read",
    write_file: "write",
    edit_file: "edit",
    exec_command: "exec",
    input_command: "follow",
    run_subagent: "subagent",
    input_subagent: "communicate",
  } as Record<string, string>,
  workRunning: "Running",
  workDone: "Done",
  workGroupSteps: (n: number) => `${n} ${n === 1 ? "step" : "steps"}`,
  approvalWaiting: "awaiting approval",
  copyCode: "Copy code",
  copyReply: "Copy reply",
  forkSession: "Fork chat from here",
  forkSessionConfirmBody:
    "This copies the conversation up to this reply into a new chat. The original chat stays unchanged.",
  forkSessionConfirmAction: "Fork",
  forkSessionFailed: "This reply could not be located. Refresh and try again.",
  copyMessage: "Copy message",
  deleteSession: "Delete chat",
  renameSession: "Rename chat",
  renameSessionLabel: "Title",
  deleteSessionConfirm: (title: string) =>
    `Delete "${title}"? Its messages and Trace will be removed permanently.`,
  /** Parked draft conversations (unsent new chats living in the sidebar list — see draft-sessions.ts). */
  draftGroup: "Drafts",
  draftUntitled: "(untitled draft)",
  deleteDraft: "Delete draft",
  deleteDraftConfirm: (title: string) =>
    `Delete draft "${title}"? Unsent content will be discarded.`,
  archiveSession: "Archive",
  unarchiveSession: "Unarchive",
  /** Per-row ellipsis overflow menu (pin / rename / archive / delete live inside it) and the row-level pin. */
  pinSession: "Pin",
  unpinSession: "Unpin",
  pinnedSession: "Pinned",
  /** The hover ellipsis button that opens the row's full context menu. */
  moreActions: "More",
  /** Sidebar group "reveal/load next page" row (display cap + server paging). */
  loadMore: "More",
  /** Per-group reveal row: n = conversations THIS group still hides (one click reveals/loads one page more). */
  expandRestSessions: (n: number) => `Show ${n} more ${n === 1 ? "chat" : "chats"}`,
  /** Time mode's whole-list paging row: its buckets span every Agent, so one row below them fetches the next page rather than each bucket claiming to. */
  loadMoreSessions: "Load more chats",
  /** Collapsed sidebar folders inside a group (lazy-loaded); the count is the group's exact server share. */
  folderGroups: {
    subagent: (n: number) => `Subagents (${n})`,
    schedule: (n: number) => `Scheduled (${n})`,
    benchmark: (n: number) => `Evaluations (${n})`,
    archived: (n: number) => `Archived (${n})`,
  },
  /** Tooltip of a folder-only group's header (nothing active of its own): what its folders hold, plus the Workspace path where the header has one. */
  folderOnlyGroup: (n: number, path?: string) =>
    `Folded tasks only: ${n} conversation${n === 1 ? "" : "s"}${path ? ` (${path})` : ""}`,
  skillsBanner: (names: string[]): string =>
    `Using skill${names.length === 1 ? "" : "s"}: ${names.join(", ")}`,
  attachedFilesBanner: (names: string[]): string =>
    `Attached file${names.length === 1 ? "" : "s"}: ${names.join(", ")}`,
  /** Composer "+" extension menu (image upload, file attachment, goal mode) and the goal chip. */
  plusMenu: "More input options",
  uploadImage: "Upload image",
  uploadImageDesc: "Attach images to this message",
  uploadFile: "Upload file",
  uploadFileDesc: "Saved to the session scratchpad; the model reads them by path",
  removeFile: "Remove file",
  attachmentTooLarge: (name: string, limitMb: number): string =>
    `${name} exceeds the ${limitMb}MB limit and was not attached.`,
  /** Overlay covering the chat area while files are dragged over it (drag-and-drop upload). */
  dropFilesTitle: "Drop files to attach",
  dropFilesDesc: "Images and files are added to the message draft",
  /** Toast when non-image files are dropped in goal mode (the objective carries images only). */
  dropFilesGoalHint: "Goal mode takes images only; the files were not attached.",
  goalMode: "Goal mode",
  goalModeDesc: "Loop until the goal completes",
  goalBudgetLabel: "Token budget",
  goalBudgetUnlimited: "Budget unlimited",
  goalBudgetValue: (value: string): string => `Budget ${value}`,
  goalBudgetPlaceholder: "e.g. 500k",
  goalBudgetHint: "Use a k/m suffix; leave blank for no budget limit",
  goalBudgetInvalid: "Invalid budget: use a positive number with an optional k/m suffix (500k, 2m)",
  goalBudgetSave: "Save budget",
  goalRemove: "Exit goal mode",
  /** Label of the collapsed card a harness-injected user message renders as (a stop hook's continue, a goal round's protocol, a user_prompt hook's expansion). */
  harnessInjected: "Injected by the harness",
  goalProgress: (rounds: number, tokens: string): string => `round ${rounds} · tokens ${tokens}`,
  goalStatus: {
    active: "running",
    complete: "complete",
    blocked: "blocked",
    budget_limited: "budget exhausted",
    aborted: "interrupted",
  } as Record<string, string>,
};
