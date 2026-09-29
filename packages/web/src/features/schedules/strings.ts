/**
 * The schedules module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `schedule` section. A new string is added here, to both fragments, and
 * nowhere else — `ScheduleStrings` makes a key missing from `scheduleEn` a type error.
 */
export const scheduleZh = {
  desc: "定时任务（agent_state/schedule/*.toml）：到点自动向目标 Session 发送 prompt；文件亦可手工编辑，Web 端修改后即时生效。",
  readOnlyHint: "member 只读；定时任务修改仅 owner 可执行",
  colStatus: "状态",
  colPeriod: "周期",
  colTarget: "目标",
  colFireTimes: "下次 / 最近触发",
  colQueued: "排队",
  statusNames: {
    active: "生效",
    disabled: "停用",
    expired: "已过期",
    done: "已完成",
    missed: "已错过",
    invalid: "无效",
  } as Record<string, string>,
  queued: "排队中",
  once: "一次性",
  newSession: "新建会话",
  invalidFiles: "解析失败的文件（已跳过调度）",
  empty: "尚未配置定时任务",
  enable: "启用",
  disable: "停用",
  addTitle: "新建定时任务",
  editTitle: (name: string): string => `编辑定时任务「${name}」`,
  nameHint: "即文件名（不含 .toml），创建后不可改",
  prompt: "Prompt",
  enabled: "启用",
  startAt: "开始时间",
  endAt: "结束时间",
  period: "周期",
  periodPlaceholder: "30m / 12h / 7d，留空为一次性",
  target: "目标",
  targetNew: "每次新建会话",
  targetSession: "绑定 Session",
  sessionId: "Session",
  /** Bind-Session picker (searchable dropdown): trigger placeholder, search box, and empty states. */
  chooseSession: "选择要绑定的 Session",
  sessionSearch: "搜索标题或 Session id…",
  sessionNoMatch: "无匹配的 Session",
  sessionEmpty: "该 Agent 暂无 Session",
  workspace: "Workspace",
  model: "Model",
  modelDefault: "Project 默认",
  deleteTitle: "删除定时任务",
  deleteConfirm: (name: string): string => `确认删除定时任务「${name}」？`,
  /** Toasts after a write. A schedule fires on its own clock, so none of them mentions when a conversation picks the change up: there is nothing to pick up. */
  toastSaved: "已保存定时任务",
  toastEnabled: "已启用定时任务",
  toastDisabled: "已停用定时任务",
  /** The form's target line when it is pinned to one Session (the chat dock panel). */
  targetThisSession: "本对话",
  /** The chat dock's scheduled-tasks panel (features/schedules/schedule-panel.tsx): the current Session's tasks. */
  panelTitle: "定时任务",
  panelSubtitle: "让智能体按计划替你执行任务、发送提醒或监控更新",
  panelSearchPlaceholder: "搜索定时任务",
  filterAll: "全部",
  filterActive: "生效中",
  filterPaused: "已暂停",
  filterCompleted: "已完成",
  panelEmpty: "这段对话还没有定时任务",
  panelNoMatch: "没有匹配的定时任务",
  /** The panel's body on the draft page, where no Session exists yet. */
  panelDraftEmpty: "发送第一条消息后即可为这段对话安排定时任务",
  /** Accessible name of a row's overflow menu (edit / delete). */
  rowActions: "更多操作",
  /** The human schedule line under a task's name (schedule-describe.ts). */
  human: {
    everyDay: (time: string): string => `每天 ${time}`,
    /** `weekday` is the locale's short weekday name (周一 / Monday). */
    everyWeek: (weekday: string, time: string): string => `每${weekday} ${time}`,
    everyDays: (n: number, time: string): string => `每 ${n} 天 ${time}`,
    everyHours: (n: number): string => (n === 1 ? "每小时" : `每 ${n} 小时`),
    everyMinutes: (n: number): string => `每 ${n} 分钟`,
    /** A one-off task and when it fires. */
    once: (when: string): string => `一次性 · ${when}`,
    next: (when: string): string => `下次 ${when}`,
    today: (time: string): string => `今天 ${time}`,
    tomorrow: (time: string): string => `明天 ${time}`,
    /** `monthDay` is formatMonthDay's output (9月3日 / Sep 3). */
    onDate: (monthDay: string, time: string): string => `${monthDay} ${time}`,
    onDateWithYear: (year: number, monthDay: string, time: string): string =>
      `${year} 年 ${monthDay} ${time}`,
  },
  /** The "Create with AI" surfaces: the dock panel prefills this conversation's composer, the settings tab a new conversation's. */
  aiCreateTitle: "用 AI 创建定时任务",
  aiCreateInSessionDesc: "描述要安排的事，智能体会在这段对话里创建它，并确认设定的时间。",
  aiCreateDesc: "描述要安排的事，智能体会在新对话里为该 Agent 创建它，并确认设定的时间。",
  /** The in-Session dialog's lead line (replaces the kit's "in a new conversation" wording). */
  byAgentInSession: (name: string): string => `将由「${name}」在本对话中完成`,
  /** The in-Session dialog's one exit (the kit's aiCreate.editInChat opens a NEW conversation; this one fills the composer already on screen). */
  editInSession: "在本对话中编辑",
  /** Instruction tail appended to the in-Session dialog's draft (composeAiPrompt); the model binds the task to this Session. */
  aiCreateInSessionTail:
    "请把上面的请求创建为绑定到本对话的定时任务：在 agent_state/schedule/ 下写一个 TOML 文件，`session_id` 取本对话的 Session ID（见 Environment 段），文件名取有意义的英文名，设置 `start_at`；需要重复执行时写 `period`，请求有自然终点时写 `end_at`。创建后用一行确认你设定的时间安排。",
  /**
   * Instruction tail of the settings tab's dialog: the task is created for one agent, in a
   * new Session unless the user names one. The CLI form spells every flag, `--agent-id`
   * above all: the prompt runs in a conversation with the Project's default agent, so the
   * server injects THAT agent into PENGUIN_AGENT_ID, and an `add` without the flag writes
   * the task into the wrong agent's schedule directory. The TOML keys are named only in
   * the file branch, so they are never read as flags of the command beside them.
   */
  aiCreateTail: (agentId: string): string =>
    `请为 Agent「${agentId}」创建这个定时任务。可以执行 \`penguin schedule add <名称> --agent-id ${agentId} --prompt "<请求内容>" --start-at <ISO 8601 或 now>\`，需要重复执行时加 \`--period <30m | 12h | 7d>\`，请求有自然终点时加 \`--end-at <ISO 8601>\`——不写 \`--agent-id\` 时任务会落到运行本对话的那个 Agent 上，而不是它；也可以直接在该 Agent 的 agent_state/schedule/ 下写 TOML 文件，文件名取有意义的英文名，用 \`start_at\`、\`period\`、\`end_at\` 这几个键。除非用户指定了 Session，否则采用每次新建 Session 的模式。创建后用一行确认你设定的时间安排。`,
  /** The suggestion rows (name / schedule hint / one-line description) and the prompt each prefills — one phrased for this conversation, one for an agent as a whole. */
  suggestionsTitle: "建议",
  suggestions: {
    dailyBrief: {
      name: "每日简报",
      hint: "每个工作日 08:00",
      description: "汇总昨天的进展与今天的待办",
      prompt: "每个工作日早上 8 点给我一份简报：昨天这段对话里的进展与今天的待办",
      agentPrompt: "每个工作日早上 8 点生成一份简报：昨天的进展与今天的待办",
    },
    weeklyReview: {
      name: "每周回顾",
      hint: "每周五 16:00",
      description: "把本周的工作整理成一份状态更新",
      prompt: "每周五 16:00 把本周的工作整理成一份状态更新",
      agentPrompt: "每周五 16:00 把本周的工作整理成一份状态更新",
    },
    followUp: {
      name: "跟进提醒",
      hint: "一次性",
      description: "到点提醒你跟进某件事",
      prompt: "明天 10:00 提醒我跟进 X",
      agentPrompt: "明天 10:00 提醒我跟进 X",
    },
    monitor: {
      name: "监控更新",
      hint: "每 6 小时",
      description: "定期检查一个页面或数据源的变化",
      prompt: "每 6 小时检查 <url> 是否有更新并告诉我变化",
      agentPrompt: "每 6 小时检查 <url> 是否有更新，有变化时告诉我",
    },
  },
  /** Prompt-injection controls (toggle card / template alert / prompt editor), mirroring the memory tab's set. */
  injection: {
    enable: "启用定时任务",
    templateMissing: "提示词模板中没有 {{SCHEDULES}} 占位符，定时任务小节不会进入上下文。",
    insertPlaceholder: "插入 {{SCHEDULES}} 占位符",
    promptSection: "定时任务提示词",
    promptSectionHint:
      "注入模板 {{SCHEDULES}} 占位符的内容，教模型用文件工具管理定时任务；开关关闭或模板无占位符时不注入。",
    promptLabel: "提示词",
    promptPlaceholders: [
      ["{{SCHEDULE_LIST}}", "现有任务名列表（每任务一行「- 名称」；无任务时注入空清单说明）"],
    ] as ReadonlyArray<readonly [string, string]>,
  },
};

export type ScheduleStrings = typeof scheduleZh;

export const scheduleEn: ScheduleStrings = {
  desc: "Scheduled tasks (agent_state/schedule/*.toml): the prompt is sent to the target Session on schedule; files can also be edited by hand, and changes made here take effect immediately.",
  readOnlyHint: "Members are read-only; only the owner can modify schedules",
  colStatus: "Status",
  colPeriod: "Period",
  colTarget: "Target",
  colFireTimes: "Next / last fired",
  colQueued: "Queue",
  statusNames: {
    active: "Active",
    disabled: "Disabled",
    expired: "Expired",
    done: "Done",
    missed: "Missed",
    invalid: "Invalid",
  } as Record<string, string>,
  queued: "Queued",
  once: "One-off",
  newSession: "New session",
  invalidFiles: "Files that failed to parse (skipped by the scheduler)",
  empty: "No scheduled tasks yet",
  enable: "Enable",
  disable: "Disable",
  addTitle: "New scheduled task",
  editTitle: (name: string): string => `Edit scheduled task "${name}"`,
  nameHint: "The file name (without .toml); cannot be changed later",
  prompt: "Prompt",
  enabled: "Enabled",
  startAt: "Start at",
  endAt: "End at",
  period: "Period",
  periodPlaceholder: "30m / 12h / 7d; leave empty for a one-off task",
  target: "Target",
  targetNew: "New session each time",
  targetSession: "Bound Session",
  sessionId: "Session",
  /** Bind-Session picker (searchable dropdown): trigger placeholder, search box, and empty states. */
  chooseSession: "Choose a Session to bind",
  sessionSearch: "Search title or Session id…",
  sessionNoMatch: "No matching Session",
  sessionEmpty: "This agent has no Sessions yet",
  workspace: "Workspace",
  model: "Model",
  modelDefault: "Project default",
  deleteTitle: "Delete scheduled task",
  deleteConfirm: (name: string): string => `Delete scheduled task "${name}"?`,
  /** Toasts after a write. A schedule fires on its own clock, so none of them mentions when a conversation picks the change up: there is nothing to pick up. */
  toastSaved: "Scheduled task saved",
  toastEnabled: "Scheduled task enabled",
  toastDisabled: "Scheduled task disabled",
  /** The form's target line when it is pinned to one Session (the chat dock panel). */
  targetThisSession: "This conversation",
  /** The chat dock's scheduled-tasks panel (features/schedules/schedule-panel.tsx): the current Session's tasks. */
  panelTitle: "Scheduled tasks",
  panelSubtitle: "Ask the agent to run tasks, send reminders or monitor for updates on a schedule",
  panelSearchPlaceholder: "Search scheduled tasks",
  filterAll: "All",
  filterActive: "Active",
  filterPaused: "Paused",
  filterCompleted: "Completed",
  panelEmpty: "No scheduled tasks in this conversation yet",
  panelNoMatch: "No matching scheduled tasks",
  /** The panel's body on the draft page, where no Session exists yet. */
  panelDraftEmpty: "Send the first message, then schedule tasks for this conversation",
  /** Accessible name of a row's overflow menu (edit / delete). */
  rowActions: "More actions",
  /** The human schedule line under a task's name (schedule-describe.ts). */
  human: {
    everyDay: (time: string): string => `Every day at ${time}`,
    /** `weekday` is the locale's short weekday name (周一 / Monday). */
    everyWeek: (weekday: string, time: string): string => `Every ${weekday} at ${time}`,
    everyDays: (n: number, time: string): string => `Every ${n} days at ${time}`,
    everyHours: (n: number): string => (n === 1 ? "Every hour" : `Every ${n} hours`),
    everyMinutes: (n: number): string => `Every ${n} minutes`,
    /** A one-off task and when it fires. */
    once: (when: string): string => `One-off · ${when}`,
    next: (when: string): string => `Next: ${when}`,
    today: (time: string): string => `today ${time}`,
    tomorrow: (time: string): string => `tomorrow ${time}`,
    /** `monthDay` is formatMonthDay's output (9月3日 / Sep 3). */
    onDate: (monthDay: string, time: string): string => `${monthDay}, ${time}`,
    onDateWithYear: (year: number, monthDay: string, time: string): string =>
      `${monthDay}, ${year}, ${time}`,
  },
  /** The "Create with AI" surfaces: the dock panel prefills this conversation's composer, the settings tab a new conversation's. */
  aiCreateTitle: "Create a scheduled task with AI",
  aiCreateInSessionDesc:
    "Describe what to schedule; the agent creates it in this conversation and confirms the time it set.",
  aiCreateDesc:
    "Describe what to schedule; the agent creates it for this agent in a new conversation and confirms the time it set.",
  /** The in-Session dialog's lead line (replaces the kit's "in a new conversation" wording). */
  byAgentInSession: (name: string): string => `Done by "${name}" in this conversation`,
  /** The in-Session dialog's one exit (the kit's aiCreate.editInChat opens a NEW conversation; this one fills the composer already on screen). */
  editInSession: "Edit in this conversation",
  /** Instruction tail appended to the in-Session dialog's draft (composeAiPrompt); the model binds the task to this Session. */
  aiCreateInSessionTail:
    "Create the request above as a scheduled task bound to this Session: write a TOML file under agent_state/schedule/ with `session_id` set to this Session's id (see the Environment section), a semantic file name and `start_at`; add `period` when it repeats and `end_at` when the request has a natural end. Then confirm the schedule you set in one line.",
  /**
   * Instruction tail of the settings tab's dialog: the task is created for one agent, in a
   * new Session unless the user names one. The CLI form spells every flag, `--agent-id`
   * above all: the prompt runs in a conversation with the Project's default agent, so the
   * server injects THAT agent into PENGUIN_AGENT_ID, and an `add` without the flag writes
   * the task into the wrong agent's schedule directory. The TOML keys are named only in
   * the file branch, so they are never read as flags of the command beside them.
   */
  aiCreateTail: (agentId: string): string =>
    `Create this scheduled task for agent \`${agentId}\`. Either run \`penguin schedule add <name> --agent-id ${agentId} --prompt "<the request>" --start-at <ISO 8601 or now>\`, adding \`--period <30m | 12h | 7d>\` when it repeats and \`--end-at <ISO 8601>\` when the request has a natural end — without \`--agent-id\` the task lands on whichever agent is running this conversation rather than on that one; or write the TOML file under that agent's agent_state/schedule/ yourself, with a semantic file name and the \`start_at\`, \`period\` and \`end_at\` keys. Use the new-Session mode unless the user names a Session. Then confirm the schedule you set in one line.`,
  /** The suggestion rows (name / schedule hint / one-line description) and the prompt each prefills — one phrased for this conversation, one for an agent as a whole. */
  suggestionsTitle: "Suggestions",
  suggestions: {
    dailyBrief: {
      name: "Daily brief",
      hint: "Weekdays at 08:00",
      description: "Yesterday's progress and today's to-dos, summarized",
      prompt:
        "Every weekday at 8:00 AM, give me a brief: yesterday's progress in this conversation and today's to-dos",
      agentPrompt:
        "Every weekday at 8:00 AM, produce a brief: yesterday's progress and today's to-dos",
    },
    weeklyReview: {
      name: "Weekly review",
      hint: "Fridays at 16:00",
      description: "Turn the week's work into a status update",
      prompt: "Every Friday at 16:00, turn this week's work into a status update",
      agentPrompt: "Every Friday at 16:00, turn this week's work into a status update",
    },
    followUp: {
      name: "Follow-up reminder",
      hint: "One-off",
      description: "A reminder to follow up on something, at the time you name",
      prompt: "Tomorrow at 10:00, remind me to follow up on X",
      agentPrompt: "Tomorrow at 10:00, remind me to follow up on X",
    },
    monitor: {
      name: "Monitor for updates",
      hint: "Every 6 hours",
      description: "Check a page or data source for changes on a schedule",
      prompt: "Every 6 hours, check <url> for updates and tell me what changed",
      agentPrompt: "Every 6 hours, check <url> for updates and report what changed",
    },
  },
  /** Prompt-injection controls (toggle card / template alert / prompt editor), mirroring the memory tab's set. */
  injection: {
    enable: "Enable schedules",
    templateMissing:
      "The prompt template has no {{SCHEDULES}} placeholder, so the scheduled-tasks section never enters the context.",
    insertPlaceholder: "Insert the {{SCHEDULES}} placeholder",
    promptSection: "Schedules prompt",
    promptSectionHint:
      "What the template's {{SCHEDULES}} placeholder expands to — teaches the model to manage scheduled tasks with its file tools; nothing is injected when the toggle is off or the template lacks the placeholder.",
    promptLabel: "Prompt",
    promptPlaceholders: [
      [
        "{{SCHEDULE_LIST}}",
        'Current task-name list (one "- name" line per task; an empty-roster note when none exist)',
      ],
    ] as ReadonlyArray<readonly [string, string]>,
  },
};
