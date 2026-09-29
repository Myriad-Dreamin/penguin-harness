/**
 * The benchmark module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `benchmark` section. A new string is added here, to both fragments, and
 * nowhere else — `BenchmarkStrings` makes a key missing from `benchmarkEn` a type error.
 */
export const benchmarkZh = {
  title: "评估中心",
  /** The three step cards under the title: each says where on this page to do that step. */
  guideFlow: [
    {
      title: "出题",
      text: "点右上角「用 AI 创建」，让 AI 为某个智能体出一套题并取得基线分；也可以「手动创建」自己写题。",
    },
    {
      title: "评估",
      text: "选一个 Benchmark，点「使用」→「评估」，选好被测智能体后在新对话中发送，即得到一条带标签的分数。",
    },
    {
      title: "优化",
      text: "选一个 Benchmark，点「使用」→「优化」，设定目标分数后在新对话中发送；分数严格提升才保留新版本。",
    },
  ],
  /** The first step card's text for a Project member: no Create manually, which is the owner's. */
  guideCreateMember: "点右上角「用 AI 创建」，让 AI 为某个智能体出一套题并取得基线分。",
  searchPlaceholder: "搜索标题、描述或被测智能体",
  noMatches: "没有匹配的 Benchmark",
  /** The chip shown when the address filters the list to one Agent's Benchmarks. */
  filterByAgent: (agentId: string): string => `只看评测过 ${agentId} 的 Benchmark`,
  clearFilter: "显示全部",
  emptyTitle: "还没有 Benchmark",
  emptyDescription:
    "先让 AI 为一个智能体出题并取得基线分；之后这里会显示分数曲线与逐题明细，并可一键发起优化。",
  caseCount: (n: number): string => `${n} 题`,
  runsPerCase: (n: number): string => `每题 ${n} 次运行`,
  notEvaluated: "尚未评测",
  /** A draft Benchmark: the agent is still writing its cases, so card and page are masked. */
  building: "构建中",
  buildingHint: "智能体还在出题与校准难度，构建完成后即可使用",
  buildingDetail: "构建完成后，这里会显示题目、分数曲线与评估明细。",
  /** A Benchmark whose calibration never finished: unusable, so the card and page are masked. */
  creationFailed: "创建失败",
  creationFailedHint: "题目难度未能校准完成，请删除后重新创建",
  creationFailedDetail:
    "这套题的难度校准没有完成，无法评估或优化；请删除这个 Benchmark，然后重新创建。",
  /** The two lines above for a Project member: no delete step, since deleting is the owner's. */
  creationFailedHintMember: "题目难度未能校准完成",
  creationFailedDetailMember: "这套题的难度校准没有完成，无法评估或优化。",
  /** The avatars on a card: which Agents this Benchmark has scored so far. */
  testedAgents: "被测过的智能体",
  lastEvaluated: (when: string): string => `最近评估 ${when}`,
  /** Accessible name of the row sparkline. */
  sparklineLabel: (n: number): string => `${n} 次评估的分数走势`,
  latestScoreLabel: "最新分数",
  /** The change column when there is nothing earlier to compare against. */
  firstEvaluation: "首次评估",
  /** Card and Benchmark-page action: opens the Use dialog. */
  use: "使用",
  /** The Use dialog's two tabs. */
  evaluate: "评估",
  optimize: "优化",
  view: "查看",
  copyPath: "复制目录路径",
  deleteBenchmark: "删除 Benchmark",
  deleteConfirm: (title: string): string =>
    `确定删除「${title}」吗？它的全部题目与评估记录都会被删除，无法恢复。`,
  deleted: "Benchmark 已删除",
  backToList: "返回列表",
  /** The Benchmark's own page when the id in the address resolves to nothing. */
  notFound: "找不到这个 Benchmark",
  notFoundHint: "它可能已被删除，或者链接里的 id 不对。",
  /** Score-only chart title. */
  trendTitle: (metric: string): string => `${metric}随时间变化`,
  cases: "题目",
  viewCase: "查看详情",
  taskMaterials: "任务材料",
  rubric: "评分标准",
  agentHidden: "被测 Agent 不可见",
  caseFileUnavailable: "案例文件暂时无法读取",
  evaluations: "评估明细",
  noEvaluations: "暂无评估记录",
  noEvaluationsHint: "取得基线分后，这里会出现分数曲线与评估明细。",
  /** Evaluation notes (scoreboard's summary: score source and notes on this round's changes). */
  summaryLabel: "评估说明",
  /** Chart legend: evaluation records missing the tested Agent or the model (gray series). */
  unlabeled: "未标注",
  agentColumn: "被测 Agent",
  colVersion: "版本",
  colModel: "模型 ID",
  colThinkingLevel: "推理强度",
  colScore: "分数",
  colDuration: "耗时",
  colCase: "题目",
  colRun: "运行",
  colSession: "Session",
  // The evaluation detail dialog, and the Ask AI dialog both detail dialogs open.
  askAi: "问 AI",
  evaluationDetailTitle: (time: string): string => `评估 · ${time}`,
  askEvaluationTitle: "问 AI：这次评估",
  askEvaluationDescription:
    "这次评估的总分、逐题结果与逐次运行的 Session id 会一起交给智能体，它读过记分板与相关 Trace 后作答；提示词可以改。",
  askEvaluationDefault: "解释这次评估的结果。",
  /** The default question leads the examples (it is what the box opens with), so a reader who tried another can bring it back. Keep `explain.prompt` equal to askEvaluationDefault. */
  askEvaluationExamples: {
    explain: {
      label: "解释这次评估的结果",
      prompt: "解释这次评估的结果。",
    },
    whyLow: {
      label: "为什么这次分数低？",
      prompt: "为什么这次评估的分数偏低？请结合逐题分数与运行记录说明主要失分在哪里。",
    },
    weakest: {
      label: "哪些题最弱、该改什么？",
      prompt: "哪几道题分数最低？分别是什么原因，被测智能体改哪一处才有机会提上去？",
    },
    againstPrevious: {
      label: "与上一次评估相比变化在哪？",
      prompt: "与这个系列上一次评估相比，哪些题涨了、哪些题掉了？这些变化最可能来自什么？",
    },
  },
  /** The evaluation dialog's Ask AI tail: this evaluation's facts, and what to read before answering. */
  askEvaluationTail: (p: {
    benchmarkId: string;
    time: string;
    label: string;
    version: number;
    provider: string;
    modelId: string;
    thinkingLevel: string;
    score: string;
    cost: string;
    duration: string;
    summaryTitle: string;
    summary: string;
    cases: { id: string; score: string; cost: string; duration: string; sessionIds: string[] }[];
  }): string =>
    "请解释下面这次 Benchmark 评估的结果。只做阅读与分析：不要修改这套 Benchmark，也不要修改被测智能体。\n\n" +
    `- benchmark_id：\`${p.benchmarkId}\`（Project 的 \`benchmarks/${p.benchmarkId}/\`，记分板为 \`benchmarks/${p.benchmarkId}/scoreboard.yaml\`）\n` +
    `- 评估时间：${p.time}\n` +
    `- 系列标签：${p.label}\n` +
    `- 被测版本：v${p.version}\n` +
    `- 评测 Runtime：provider \`${p.provider}\` / model_id \`${p.modelId}\` / thinking_level \`${p.thinkingLevel}\`\n` +
    `- 总分 ${p.score}；成本 ${p.cost}；耗时 ${p.duration}\n` +
    (p.summaryTitle !== "" ? `- 评估说明标题：${p.summaryTitle}\n` : "") +
    (p.summary !== "" ? `- 评估说明：${p.summary}\n` : "") +
    "- 逐题结果（分数、成本、耗时，以及逐次运行的 Session id）：\n" +
    p.cases
      .map(
        (c) =>
          `  - \`${c.id}\`：${c.score}；${c.cost}；${c.duration}；Session ` +
          (c.sessionIds.length > 0 ? c.sessionIds.map((id) => `\`${id}\``).join("、") : "未记录"),
      )
      .join("\n") +
    "\n\n请读取 scoreboard.yaml 里这条记录，并按需读取上列 Session 的 Trace，然后说明：这些分数是怎么来的、" +
    "哪几道题最薄弱及其具体原因，以及下一步建议（改被测智能体的哪一处，或先补哪一类证据）。",
  askCaseTitle: "问 AI：这道题",
  askCaseDescription:
    "题干与评分细则的路径会交给智能体，请它讲清这道题考什么、怎样才算答好；题目已冻结，它只读不改。",
  askCaseDefault: "解释这道题考什么、怎样才算答好。",
  /** As for the evaluation dialog: the default question leads, equal to askCaseDefault. */
  askCaseExamples: {
    explain: {
      label: "解释这道题考什么、怎样才算答好",
      prompt: "解释这道题考什么、怎样才算答好。",
    },
    rubricRewards: {
      label: "评分细则在奖励什么？",
      prompt: "这道题的评分细则把分数主要放在哪些地方？哪些条目最能把优秀与及格区分开？",
    },
    whyRunLow: {
      label: "为什么有的运行在这道题上分数低？",
      prompt: "最近一次评估在这道题上分数不高，可能是被测智能体在哪一步做丢了？",
    },
    clearerStatement: {
      label: "题干怎样才能更清楚？",
      prompt:
        "这道题的题干有没有含糊或容易误读的地方？题目已冻结不能改，请说明如果下次新建 Benchmark 该怎么写得更清楚。",
    },
  },
  /** The case dialog's Ask AI tail: the two READMEs to read, and this case's latest run results. */
  askCaseTail: (p: {
    benchmarkId: string;
    caseId: string;
    latest: { time: string; score: string; runs: { score: string; sessionId: string }[] } | null;
  }): string =>
    "请解释下面这道 Benchmark 题目考的是什么、怎样才算答好。题目创建即冻结，只做阅读与分析，不要修改这套 Benchmark。\n\n" +
    `- benchmark_id：\`${p.benchmarkId}\`（Project 的 \`benchmarks/${p.benchmarkId}/\`）\n` +
    `- case_id：\`${p.caseId}\`\n` +
    `- 题干：\`benchmarks/${p.benchmarkId}/${p.caseId}/statement/README.md\`\n` +
    `- 评分细则：\`benchmarks/${p.benchmarkId}/${p.caseId}/rubric/README.md\`\n` +
    (p.latest === null
      ? "- 这套 Benchmark 还没有评估记录。\n"
      : `- 最近一次评估（${p.latest.time}）在这道题上的平均分 ${p.latest.score}\n` +
        p.latest.runs
          .map((r, i) => `  - 第 ${i + 1} 次运行：${r.score}；Session \`${r.sessionId}\`\n`)
          .join("")) +
    "\n请读取上面两个 README（以及上列 Session 的 Trace，如果有），然后说明：这道题实际考察什么能力、" +
    "一份好答案长什么样（关键决定与产物），以及评分细则靠哪些条目把优秀与及格区分开。",
  // New Benchmark, AI mode: the target picker, the examples and the fixed tail.
  aiCreateTitle: "让 AI 创建 Benchmark",
  aiCreateDescription:
    "描述要考察的能力与场景，AI 会为被测智能体出题、逐题试测以校准难度，并取得基线分。",
  targetAgent: "被测智能体",
  targetAgentHint: "题目为它而出、分数记在它名下；出题本身由下方所示的智能体在新对话里完成",
  aiCreateExamples: {
    decisionAgent: {
      label: "决策：足球、售后与投资的有限选择",
      description: "公开规则、历史案例与当前事实互相冲突或不完整",
      prompt:
        "为通用决策智能体出题：足球投注、售后处置、投资动作三个场景，各给一组有限选项，公开规则、历史案例与当前事实要么不完整、要么互相冲突，看它能不能给出稳定、可解释的选择，而不是被最近的一条信息带着走。",
    },
    reportWriter: {
      label: "报告写作：材料互相矛盾",
      description: "冲突材料、缺失口径、严格的篇幅与引用",
      prompt:
        "为报告写作智能体出题：材料互相矛盾，币种、时区这类关键口径故意不写全，篇幅和引用格式卡得很严，看它会不会先指出缺口、再做保守假设。",
    },
    customerService: {
      label: "客服：隐藏政策前提的对话题",
      description: "信息不全的用户、藏在附录的政策条件、越权承诺陷阱",
      prompt:
        "为客服智能体出多轮对话题：用户描述模糊、关键事实要追问才给，政策的例外条款藏在附录里，情绪化的表达在诱导越权承诺，看它会不会先核实再答复、守住政策口径。",
    },
    codeReview: {
      label: "代码审查：缺陷藏在约定里",
      description: "未写明的调用与并发前提，误导人的注释与测试",
      prompt:
        "为代码审查智能体出题：每题一个小型多文件仓库，缺陷藏在没写明的调用顺序、时区或编码假设和并发前提里，再配上过时的注释和一份能通过却盖不住缺陷的测试，看它查全、误报和验证步骤。",
    },
  },
  /** The fixed tail after the draft: the `benchmark-design` inputs and the layout it writes. */
  aiCreateTail: (targetAgentId: string): string =>
    "请使用 `benchmark-design` Skill，作为 Builder 为下面的被测智能体设计并校准一套 Benchmark，不要修改被测智能体本身。\n\n" +
    `- test_agent_id：\`${targetAgentId}\`\n` +
    "- benchmark_id：上文已指定则沿用，否则按场景取一个简短的语义化 id（仅字母、数字、`_` 和 `-`）\n" +
    "- 题量：3 道左右——少而难，每题至少有一个能把「照着做」和「真会做」分开的决定点（上文另有要求时以上文为准）\n" +
    "- 出题手法：隐藏的先验条件、模糊或不完整的输入、互相冲突的材料、严格的交付格式；不要靠堆行数、堆规则来加难度\n" +
    "- desired_baseline_score：`<50`（上文另有要求时以上文为准）\n" +
    "- pilot_iteration_limit：`4`（上文另有要求时以上文为准）\n\n" +
    "Benchmark 与 Agent 平级：在 Project 的 `benchmarks/<benchmark_id>/` 下（不在被测智能体目录内）创建 `benchmark_config.toml`" +
    "（title、description、runs = 1；不记录被测智能体）、" +
    "每题一个 `CASE-NNN-<slug>/`（`statement/README.md` 为题干，`rubric/README.md` 为评分细则，每题满分 100 分，细则不得泄露到题干）" +
    "以及 `scoreboard.yaml`（初始为 `evaluations: []`；每条 evaluation 记录被测的 `agent_id`、`version`、成对的 `provider` / `model_id` 与 `thinking_level`）。" +
    "每一次试测都必须通过 `run_subagent` 派发子会话，并在子会话的 prompt 里写明使用 `agent-evaluation` Skill——不要自己打分，也不要绕过这个技能；" +
    "逐题试测以校准难度，定稿后冻结并把 Formal Baseline 追加进 scoreboard.yaml，最后报告 Benchmark id、基线分数与各题分数。",
  // New Benchmark, manual mode: the form.
  manualCreateTitle: "手动创建 Benchmark",
  manualCreateIntro:
    "填好标题、题干与评分细则后，目录结构会按技能约定写入 Project 的 benchmarks/ 下；Benchmark 与 Agent 平级，之后可以用它评测任意智能体。",
  idField: "Benchmark id",
  idHint: "目录名即标识：仅字母、数字、_ 和 -，例如 report-writing-v1",
  /** The id field's generation clause: a Benchmark is named by its title, not a display name. */
  idGenerateHint: "；也可以从标题生成",
  idExists: "已有同名 Benchmark，请换一个 id",
  titleField: "标题",
  descriptionField: "描述",
  descriptionHint: "一句话说明考察什么能力、题目难在哪里",
  runsField: "每题运行次数",
  runsHint: "1–1000 的整数；优化时每道题跑这么多次取平均",
  runsInfo:
    "多次运行能把稳定的能力差距和偶然波动分开，但评测成本按次数倍增。AI 出题校准时固定每题 1 次；这里的值给之后的优化用。",
  casesTitle: "题目",
  casesInfo:
    "每道题分两部分：题干交给被测智能体；评分细则只有评测方能看到，永远不进被测智能体的 Workspace。",
  rubricInfo:
    "有区分度的评分细则：条目可观察、合计 100 分，把分数主要放在「真正做对」和「看起来做对」会产生不同结果的决定或产物上，不要给格式合规太高的保底分。",
  caseHeading: (n: number): string => `第 ${n} 题`,
  caseSlugField: "目录名后缀",
  caseSlugHint: (id: string): string => `目录名 ${id}：仅字母、数字、_ 和 -`,
  caseTitleField: "题目标题",
  caseStatementField: "题干",
  caseStatementHint: "Markdown；写明目标、给定材料、要求的产物与格式，不要暗示解法或评分点",
  caseRubricField: "评分细则",
  caseRubricHint: "Markdown；逐条给分并合计 100 分，如「- 40 分：……」",
  addCase: "添加题目",
  removeCase: "删除此题",
  createSubmit: "创建 Benchmark",
  created: "Benchmark 已创建",
  invalidId: "仅允许字母、数字、_ 和 -",
  invalidRuns: "必须是 1–1000 的整数",
  invalidScore: "必须是 1–100 的整数",
  // Use: one dialog with an Evaluate tab and an Optimize tab, over a single exit.
  useTitle: (title: string): string => `使用：${title}`,
  // Shared by both tabs.
  testedAgent: "被测智能体",
  // Evaluate tab.
  evaluateDescription:
    "AI 会把被测智能体放到这套 Benchmark 上跑完整的 Case × runs 矩阵，并把结果作为一条带标签的评估追加进记分。",
  evaluateTestedAgentHint:
    "评估的是它当下的 Agent State；分数记在它名下，标签含其版本号、模型与思考等级",
  evaluatorAgent: "执行评估的智能体",
  evaluatorAgentHint:
    "派发评测子会话、按评分细则打分并写入记分的一方；需要装有 agent-evaluation 技能",
  evaluatorMissingSkill:
    "该智能体没有安装 agent-evaluation 技能，多半无法完成评估——建议换用默认智能体，或先为它安装 agent-tuning 插件。",
  evaluateSessionModel: "评估会话使用的模型",
  evaluateSessionModelHint:
    "派发与汇总评测的模型，缺省为 Project 默认模型；被测智能体用的是它自己配置的模型，不在这里改",
  evaluateRunsHint: "每道题跑几次取平均；缺省为 Benchmark 配置的次数",
  evaluateNoteField: "说明",
  evaluateNotePlaceholder: "例如：这一轮用来确认上次优化的效果，重点看引用规范那两道题",
  /** The fixed tail: the `agent-evaluation` inputs, the label check and the single append. */
  evaluateTail: (p: { targetAgentId: string; benchmarkId: string; runs: number }): string =>
    "请使用 `agent-evaluation` Skill，在这套已冻结的 Benchmark 上评估被测智能体。\n\n" +
    `- test_agent_id：\`${p.targetAgentId}\`\n` +
    `- benchmark_id：\`${p.benchmarkId}\`（Project 的 \`benchmarks/${p.benchmarkId}/\`，与 Agent 平级）\n` +
    `- runs：\`${p.runs}\`\n\n` +
    "通过 `run_subagent` 按完整的 Case × runs 矩阵评测，每个矩阵单元一个自调用的子会话（省略 `agent_id`），并在每个子会话的 prompt 里写明使用 `agent-evaluation` Skill——不要自己打分，也不要绕过这个技能；" +
    "评测 Runtime 取被测智能体当前配置的模型与思考等级。校验每条返回结果的 `agent_id`、`provider`、`model_id` 与 `thinking_level` 完全一致，" +
    "不一致就停下、不要把不同标签混成一条。按记分契约求各题（runs 平均）与整体（各题平均）的分数，" +
    "然后只向 `scoreboard.yaml` 追加一条 evaluation，记上 `agent_id`、`version`、`provider` / `model_id` 与 `thinking_level` 作为标签。" +
    "不修改被测智能体，也不修改 Benchmark。结束时报告总分、各题分数与本条记录的标签。",
  // Optimize tab.
  optimizeDescription: "AI 会按可证伪的假设修改被测智能体并重新评测，分数严格提升才保留新版本。",
  optimizerAgent: "执行优化的智能体",
  optimizerAgentHint: "读分数与 Trace、修改被测智能体的一方；需要装有 agent-optimization 技能",
  optimizerMissingSkill:
    "该智能体没有安装 agent-optimization 技能，多半无法完成优化——建议换用默认智能体，或先为它安装 agent-tuning 插件。",
  testedAgentHint: "优化改的是它的 Agent State；分数记在它名下，只与它自己同标签的历史分数比较",
  sessionModel: "优化会话使用的模型",
  sessionModelHint:
    "做分析与改动的模型，缺省为 Project 默认模型；评测被测智能体时沿用基线记录的模型，不在这里改",
  optimizeRunsHint: "每个候选版本每道题跑几次取平均",
  roundLimitField: "最多轮数",
  roundLimitHint: "每轮一个改动；评测完整才算一轮",
  targetScoreField: "目标分数",
  targetScoreHint: "达到即提前结束；默认比当前基线高 10 分",
  focusField: "优化重点",
  focusPlaceholder: "例如：重点优化引用规范与格式合规，不要改动写作风格",
  noBaseline:
    "所选被测智能体在这套 Benchmark 上还没有基线分。优化需要一条完整的基线评估作为比较起点——先到「评估」跑一次完整评测取得基线。",
  baselineLine: (score: string, target: number): string => `当前基线 ${score} · 目标 ${target}`,
  /** The fixed tail: the `agent-optimization` inputs, the acceptance rule and the report. */
  optimizeTail: (p: {
    targetAgentId: string;
    benchmarkId: string;
    runs: number;
    roundLimit: number;
    targetScore: number;
  }): string =>
    "请使用 `agent-optimization` Skill，针对已冻结的 Benchmark 优化被测智能体。\n\n" +
    `- test_agent_id：\`${p.targetAgentId}\`\n` +
    `- benchmark_id：\`${p.benchmarkId}\`（Project 的 \`benchmarks/${p.benchmarkId}/\`，与 Agent 平级）\n` +
    `- runs：\`${p.runs}\`\n` +
    `- desired_score：\`>=${p.targetScore}\`\n` +
    `- candidate_round_limit：\`${p.roundLimit}\`\n\n` +
    "每轮从当前 Reference 出发提出一个可证伪的假设、只做一个有界改动；通过 `run_subagent` 评测完整的 Case × runs 矩阵，每个子会话的 prompt 里都写明使用 `agent-evaluation` Skill——不要自己打分，也不要绕过这个技能；" +
    "评测沿用该被测智能体基线记录的 provider / model_id / thinking_level；仅当总分严格高于 Reference 时保留该版本，" +
    "并把记有 `agent_id`、`version`、`provider` / `model_id` 与 `thinking_level` 的 evaluation 追加到 scoreboard.yaml，否则回滚。" +
    "结束时报告优化前后的分数、保留的版本号，以及每轮的改动与取舍。",
};

export type BenchmarkStrings = typeof benchmarkZh;

export const benchmarkEn: BenchmarkStrings = {
  title: "Evaluation Center",
  guideFlow: [
    {
      title: "Create",
      text: "Press Create with AI at the top right to have AI write a set of cases for an agent and take its baseline score, or Create manually to write the cases yourself.",
    },
    {
      title: "Evaluate",
      text: "Pick a Benchmark, press Use → Evaluate, choose the agent under test and send the prefilled conversation to get one labelled score.",
    },
    {
      title: "Optimize",
      text: "Pick a Benchmark, press Use → Optimize, set a target score and send; a new version is kept only when the score strictly improves.",
    },
  ],
  /** The first step card's text for a Project member: no Create manually, which is the owner's. */
  guideCreateMember:
    "Press Create with AI at the top right to have AI write a set of cases for an agent and take its baseline score.",
  searchPlaceholder: "Search titles, descriptions or tested agents",
  noMatches: "No Benchmark matches",
  filterByAgent: (agentId: string): string => `Benchmarks that evaluated ${agentId}`,
  clearFilter: "Show all",
  emptyTitle: "No Benchmarks yet",
  emptyDescription:
    "Start by letting AI write cases for an agent and take a baseline. Score curves and per-case detail appear here afterwards, with optimization one click away.",
  caseCount: (n: number): string => `${n} case${n === 1 ? "" : "s"}`,
  runsPerCase: (n: number): string => `${n} run${n === 1 ? "" : "s"} per case`,
  notEvaluated: "Not evaluated yet",
  /** A draft Benchmark: the agent is still writing its cases, so card and page are masked. */
  building: "Being built",
  buildingHint:
    "The agent is still writing the cases and calibrating their difficulty; the Benchmark opens once that is done",
  buildingDetail:
    "Once it is built, the cases, the score chart and the evaluation table appear here.",
  /** A Benchmark whose calibration never finished: unusable, so the card and page are masked. */
  creationFailed: "Creation failed",
  creationFailedHint:
    "The cases' difficulty could not be calibrated; delete this Benchmark and create it again",
  creationFailedDetail:
    "Calibration of this Benchmark never completed, so it cannot be evaluated or optimized; delete it and create it again.",
  /** The two lines above for a Project member: no delete step, since deleting is the owner's. */
  creationFailedHintMember: "The cases' difficulty could not be calibrated",
  creationFailedDetailMember:
    "Calibration of this Benchmark never completed, so it cannot be evaluated or optimized.",
  testedAgents: "Tested agents",
  lastEvaluated: (when: string): string => `last evaluated ${when}`,
  sparklineLabel: (n: number): string => `Score trend over ${n} evaluation${n === 1 ? "" : "s"}`,
  latestScoreLabel: "Latest score",
  firstEvaluation: "first evaluation",
  use: "Use",
  evaluate: "Evaluate",
  optimize: "Optimize",
  view: "View",
  copyPath: "Copy directory path",
  deleteBenchmark: "Delete Benchmark",
  deleteConfirm: (title: string): string =>
    `Delete "${title}"? All of its cases and evaluation records will be removed; this cannot be undone.`,
  deleted: "Benchmark deleted",
  backToList: "Back to list",
  /** The Benchmark's own page when the id in the address resolves to nothing. */
  notFound: "This Benchmark was not found",
  notFoundHint: "It may have been deleted, or the link carries an id that no longer exists.",
  trendTitle: (metric: string): string => `${metric} over time`,
  cases: "Cases",
  viewCase: "View details",
  taskMaterials: "Task materials",
  rubric: "Scoring rubric",
  agentHidden: "Hidden from Target Agent",
  caseFileUnavailable: "Case files are unavailable",
  evaluations: "Evaluations",
  noEvaluations: "No evaluations yet",
  noEvaluationsHint: "The score curve and evaluation detail appear here once a baseline is taken.",
  summaryLabel: "Summary",
  unlabeled: "Unlabeled",
  agentColumn: "Tested agent",
  colVersion: "Version",
  colModel: "Model ID",
  colThinkingLevel: "Thinking level",
  colScore: "Score",
  colDuration: "Duration",
  colCase: "Case",
  colRun: "Run",
  colSession: "Session",
  askAi: "Ask AI",
  evaluationDetailTitle: (time: string): string => `Evaluation · ${time}`,
  askEvaluationTitle: "Ask AI about this evaluation",
  askEvaluationDescription:
    "The total score, the per-case results and every run's Session id go along with your question; the agent reads the scoreboard and the matching Traces before answering. The prompt stays editable.",
  askEvaluationDefault: "Explain this evaluation's result.",
  /** The default question leads the examples (it is what the box opens with), so a reader who tried another can bring it back. Keep `explain.prompt` equal to askEvaluationDefault. */
  askEvaluationExamples: {
    explain: {
      label: "Explain this evaluation's result",
      prompt: "Explain this evaluation's result.",
    },
    whyLow: {
      label: "Why is the score low?",
      prompt:
        "Why did this evaluation score so low? Use the per-case scores and the runs to say where the points were actually lost.",
    },
    weakest: {
      label: "Which cases are weakest, and what should change?",
      prompt:
        "Which cases scored worst? For each, what caused it, and what single change to the tested agent has a chance of lifting it?",
    },
    againstPrevious: {
      label: "What changed against the previous evaluation?",
      prompt:
        "Compared with this series' previous evaluation, which cases went up and which went down? What most likely caused those changes?",
    },
  },
  askEvaluationTail: (p: {
    benchmarkId: string;
    time: string;
    label: string;
    version: number;
    provider: string;
    modelId: string;
    thinkingLevel: string;
    score: string;
    cost: string;
    duration: string;
    summaryTitle: string;
    summary: string;
    cases: { id: string; score: string; cost: string; duration: string; sessionIds: string[] }[];
  }): string =>
    "Explain the result of the Benchmark evaluation below. Read and analyze only: change neither this Benchmark nor the tested agent.\n\n" +
    `- benchmark_id: \`${p.benchmarkId}\` (the Project's \`benchmarks/${p.benchmarkId}/\`; the scoreboard is \`benchmarks/${p.benchmarkId}/scoreboard.yaml\`)\n` +
    `- Evaluated at: ${p.time}\n` +
    `- Series label: ${p.label}\n` +
    `- Tested version: v${p.version}\n` +
    `- Evaluation runtime: provider \`${p.provider}\` / model_id \`${p.modelId}\` / thinking_level \`${p.thinkingLevel}\`\n` +
    `- Total score ${p.score}; cost ${p.cost}; duration ${p.duration}\n` +
    (p.summaryTitle !== "" ? `- Summary title: ${p.summaryTitle}\n` : "") +
    (p.summary !== "" ? `- Summary: ${p.summary}\n` : "") +
    "- Per-case scores (score, cost, duration, and the Session id of every run):\n" +
    p.cases
      .map(
        (c) =>
          `  - \`${c.id}\`: ${c.score}; ${c.cost}; ${c.duration}; Session ` +
          (c.sessionIds.length > 0
            ? c.sessionIds.map((id) => `\`${id}\``).join(", ")
            : "not recorded"),
      )
      .join("\n") +
    "\n\nRead this record in scoreboard.yaml, and the Traces of the Sessions listed above as far as you need them. Then say how these scores came about, " +
    "which cases are weakest and exactly why, and what to do next (which part of the tested agent to change, or which evidence to gather first).",
  askCaseTitle: "Ask AI about this case",
  askCaseDescription:
    "The paths to the statement and the rubric go along with your question, so the agent can say what this case tests and what answering it well takes. The case is frozen: it reads, it does not edit.",
  askCaseDefault: "Explain what this case tests and what a strong answer looks like.",
  /** As for the evaluation dialog: the default question leads, equal to askCaseDefault. */
  askCaseExamples: {
    explain: {
      label: "Explain what this case tests and what a strong answer looks like",
      prompt: "Explain what this case tests and what a strong answer looks like.",
    },
    rubricRewards: {
      label: "What does the rubric reward?",
      prompt:
        "Where does this case's rubric put its points? Which items do the most to separate excellent work from merely passing work?",
    },
    whyRunLow: {
      label: "Why did a run score low here?",
      prompt:
        "The latest evaluation did not score well on this case. Which step is the tested agent most likely losing it at?",
    },
    clearerStatement: {
      label: "How could the statement be clearer?",
      prompt:
        "Is anything in this statement ambiguous or easy to misread? The case is frozen and cannot be edited, so say how to write it more clearly in the next Benchmark instead.",
    },
  },
  askCaseTail: (p: {
    benchmarkId: string;
    caseId: string;
    latest: { time: string; score: string; runs: { score: string; sessionId: string }[] } | null;
  }): string =>
    "Explain what the Benchmark case below tests and what a strong answer looks like. A case is frozen once it exists: read and analyze only, and do not change this Benchmark.\n\n" +
    `- benchmark_id: \`${p.benchmarkId}\` (the Project's \`benchmarks/${p.benchmarkId}/\`)\n` +
    `- case_id: \`${p.caseId}\`\n` +
    `- Statement: \`benchmarks/${p.benchmarkId}/${p.caseId}/statement/README.md\`\n` +
    `- Rubric: \`benchmarks/${p.benchmarkId}/${p.caseId}/rubric/README.md\`\n` +
    (p.latest === null
      ? "- This Benchmark has no evaluations yet.\n"
      : `- The latest evaluation (${p.latest.time}) averaged ${p.latest.score} on this case\n` +
        p.latest.runs
          .map((r, i) => `  - Run #${i + 1}: ${r.score}; Session \`${r.sessionId}\`\n`)
          .join("")) +
    "\nRead both READMEs above (and the Traces of the Sessions listed, if there are any). Then say what capability this case actually tests, " +
    "what a strong answer looks like (the decisions and the artifact it takes), and which rubric items separate excellent work from merely passing work.",
  aiCreateTitle: "Create a Benchmark with AI",
  aiCreateDescription:
    "Describe the capability and the scenarios to test. AI writes the cases for the Test Agent, trial-runs each one to calibrate difficulty, and takes a baseline score.",
  targetAgent: "Test Agent",
  targetAgentHint:
    "The agent the cases are written for and scored under; the writing itself is done by the agent named below, in a new conversation",
  aiCreateExamples: {
    decisionAgent: {
      label: "Decisions: finite choices in football, after-sales and investing",
      description: "Public rules, past cases and current facts that conflict or fall short",
      prompt:
        "Write cases for a general decision agent: three scenarios — football betting, an after-sales action, an investment move — each with a fixed set of options, where the public rules, the historical cases and the current facts are either incomplete or contradict one another. Does it make a stable, explainable choice instead of following the latest fact it saw?",
    },
    reportWriter: {
      label: "Report writing: contradicting sources",
      description: "Conflicting material, unstated conventions, strict length and citations",
      prompt:
        "Write cases for the report-writing agent: the sources contradict each other, key conventions such as currency and time zone are deliberately left incomplete, and the length cap and citation format are strict — does it name the gap and make a conservative assumption first?",
    },
    customerService: {
      label: "Support: a hidden policy condition",
      description:
        "Incomplete users, policy conditions buried in an appendix, an over-promise trap",
      prompt:
        "Write multi-turn cases for the customer-support agent: the user's description is vague and the key facts come out only when asked, the policy's exceptions sit in an appendix, and an emotional message invites a promise the agent cannot make — does it verify before answering and hold the policy line?",
    },
    codeReview: {
      label: "Code review: defects hidden in the contracts",
      description: "Unstated calling and concurrency assumptions, misleading comments and tests",
      prompt:
        "Write cases for the code-review agent: each a small multi-file repository whose defects hide in an unstated call order, a time-zone or encoding assumption and a concurrency precondition, with a stale comment or two and a test that passes without covering them — score recall, false positives and the verification steps.",
    },
  },
  aiCreateTail: (targetAgentId: string): string =>
    "Use the `benchmark-design` Skill: as the Builder, design and calibrate a Benchmark for the Test Agent below without changing that agent itself.\n\n" +
    `- test_agent_id: \`${targetAgentId}\`\n` +
    "- benchmark_id: keep the one named above if any; otherwise derive a short semantic id (letters, digits, `_` and `-` only)\n" +
    "- case count: about 3 — few and hard, each with at least one decision that separates following the motions from actually doing the work (the draft above wins when it names one)\n" +
    "- techniques: hidden preconditions, vague or incomplete input, sources that contradict each other, strict deliverables; no difficulty from piling on rows or rules\n" +
    "- desired_baseline_score: `<50` (the draft above wins when it names one)\n" +
    "- pilot_iteration_limit: `4` (the draft above wins when it names one)\n\n" +
    "A Benchmark sits beside agents, not under one: create `benchmarks/<benchmark_id>/` under the Project (never inside the tested agent's directory) with " +
    "`benchmark_config.toml` (title, description, runs = 1; it records no agent), " +
    "one `CASE-NNN-<slug>/` per case (`statement/README.md` is the statement, `rubric/README.md` the scoring rubric, 100 points per case, nothing from the rubric leaking into the statement) " +
    "and `scoreboard.yaml` (initially `evaluations: []`; every evaluation records the tested `agent_id`, its `version`, the paired `provider` / `model_id` and the `thinking_level`). " +
    "Every trial evaluation goes through `run_subagent`, and the subagent's prompt must say to use the `agent-evaluation` Skill — never score a run yourself and never bypass that Skill; " +
    "calibrate difficulty case by case, " +
    "freeze the final revision, append the Formal Baseline to scoreboard.yaml, and finish by reporting the Benchmark id, the baseline score and the per-case scores.",
  manualCreateTitle: "Create a Benchmark manually",
  manualCreateIntro:
    "Fill in the title, the statements and the rubrics; the directory layout the Skills expect is written under the Project's benchmarks/. A Benchmark sits beside agents, so it can then evaluate any of them.",
  idField: "Benchmark id",
  idHint:
    "The directory name is the identifier: letters, digits, _ and - only, e.g. report-writing-v1",
  /** The id field's generation clause: a Benchmark is named by its title, not a display name. */
  idGenerateHint: "; you can also generate one from the title",
  idExists: "A Benchmark with this id already exists; pick another",
  titleField: "Title",
  descriptionField: "Description",
  descriptionHint: "One line on what capability is tested and what makes the cases hard",
  runsField: "Runs per case",
  runsHint: "An integer from 1 to 1000; optimization runs every case this many times and averages",
  runsInfo:
    "Repeated runs separate a stable capability gap from chance, at a cost that scales with the count. AI calibration always uses one run per case; this value is for the optimization that follows.",
  casesTitle: "Cases",
  casesInfo:
    "Every case has two halves: the statement goes to the Test Agent; the rubric is seen only by the evaluator and never enters the Test Agent's Workspace.",
  rubricInfo:
    "A discriminating rubric has observable items totalling 100 points, and puts most of the points on decisions or artifacts where doing it right and merely looking right diverge — never a high floor for format compliance.",
  caseHeading: (n: number): string => `Case ${n}`,
  caseSlugField: "Directory suffix",
  caseSlugHint: (id: string): string => `Directory ${id}: letters, digits, _ and - only`,
  caseTitleField: "Case title",
  caseStatementField: "Statement",
  caseStatementHint:
    "Markdown; state the objective, the given materials, the required artifact and its format — never hint at the solution or the scoring",
  caseRubricField: "Scoring rubric",
  caseRubricHint: 'Markdown; one item per line with its points, totalling 100, e.g. "- 40 pts: …"',
  addCase: "Add case",
  removeCase: "Remove this case",
  createSubmit: "Create Benchmark",
  created: "Benchmark created",
  invalidId: "Letters, digits, _ and - only",
  invalidRuns: "Must be an integer from 1 to 1000",
  invalidScore: "Must be an integer from 1 to 100",
  useTitle: (title: string): string => `Use: ${title}`,
  testedAgent: "Tested agent",
  evaluateDescription:
    "AI puts the tested agent on this Benchmark for the full Case × runs matrix and appends the result to the scoreboard as one labelled evaluation.",
  evaluateTestedAgentHint:
    "Evaluated as its Agent State stands right now; the score is recorded under it, labelled with its version, model and thinking level",
  evaluatorAgent: "Evaluator agent",
  evaluatorAgentHint:
    "The one that spawns the evaluation subagents, scores against the rubric and writes the scoreboard; needs the agent-evaluation Skill",
  evaluatorMissingSkill:
    "This agent does not have the agent-evaluation Skill installed and will most likely not complete the evaluation — switch to the default agent, or install the agent-tuning plugin on it first.",
  evaluateSessionModel: "Model of the evaluation conversation",
  evaluateSessionModelHint:
    "The model that dispatches and totals the runs, the Project's default model unless changed; the tested agent uses the model it is configured with, which is not changed here",
  evaluateRunsHint:
    "How many times every case runs, averaged; defaults to the Benchmark's configured count",
  evaluateNoteField: "Note",
  evaluateNotePlaceholder:
    "e.g. This round checks what the last optimization actually changed; watch the two citation cases",
  evaluateTail: (p: { targetAgentId: string; benchmarkId: string; runs: number }): string =>
    "Use the `agent-evaluation` Skill to evaluate the Test Agent on this frozen Benchmark.\n\n" +
    `- test_agent_id: \`${p.targetAgentId}\`\n` +
    `- benchmark_id: \`${p.benchmarkId}\` (the Project's \`benchmarks/${p.benchmarkId}/\`, beside the agents)\n` +
    `- runs: \`${p.runs}\`\n\n` +
    "Evaluate the full Case × runs matrix through `run_subagent`, one self-spawned subagent per matrix cell (omit `agent_id`), and say in every subagent's prompt to use the `agent-evaluation` Skill — never score a run yourself and never bypass that Skill; " +
    "the evaluation runtime is the model and thinking level that tested agent is configured with right now. Require every returned result to agree on " +
    "`agent_id`, `provider`, `model_id` and `thinking_level`, and stop rather than merge two labels into one record. Average the runs per case and the cases " +
    "per evaluation as the scoreboard contract specifies, then append exactly ONE evaluation to `scoreboard.yaml`, labelled with `agent_id`, `version`, " +
    "`provider` / `model_id` and `thinking_level`. Change neither the tested agent nor the Benchmark. " +
    "Finish by reporting the total score, the per-case scores and the label the evaluation was recorded under.",
  optimizeDescription:
    "AI changes the Test Agent under a falsifiable hypothesis and re-evaluates; a new version is kept only when the score strictly improves.",
  optimizerAgent: "Optimizer agent",
  optimizerAgentHint:
    "The one that reads the scores and Traces and edits the Test Agent; needs the agent-optimization Skill",
  optimizerMissingSkill:
    "This agent does not have the agent-optimization Skill installed and will most likely not complete the optimization — switch to the default agent, or install the agent-tuning plugin on it first.",
  testedAgentHint:
    "The agent whose Agent State is edited; its scores are recorded under it and compared only against its own same-label history",
  sessionModel: "Model of the optimizer's conversation",
  sessionModelHint:
    "The model that analyzes and edits, the Project's default model unless changed; evaluations of the Test Agent keep the model the baseline recorded, which is not changed here",
  optimizeRunsHint: "How many times every case runs per candidate version, averaged",
  roundLimitField: "Round limit",
  roundLimitHint: "One change per round; a round counts once its evaluation is complete",
  targetScoreField: "Target score",
  targetScoreHint: "Reaching it ends the loop early; defaults to ten points above the baseline",
  focusField: "Focus",
  focusPlaceholder:
    "e.g. Focus on citation rules and format compliance; leave the writing style alone",
  noBaseline:
    "The selected tested agent has no baseline score in this Benchmark yet. Optimization needs one complete baseline evaluation to compare against — take it on the Evaluate tab first.",
  baselineLine: (score: string, target: number): string =>
    `Current baseline ${score} · target ${target}`,
  optimizeTail: (p: {
    targetAgentId: string;
    benchmarkId: string;
    runs: number;
    roundLimit: number;
    targetScore: number;
  }): string =>
    "Use the `agent-optimization` Skill to improve the Test Agent against its frozen Benchmark.\n\n" +
    `- test_agent_id: \`${p.targetAgentId}\`\n` +
    `- benchmark_id: \`${p.benchmarkId}\` (the Project's \`benchmarks/${p.benchmarkId}/\`, beside the agents)\n` +
    `- runs: \`${p.runs}\`\n` +
    `- desired_score: \`>=${p.targetScore}\`\n` +
    `- candidate_round_limit: \`${p.roundLimit}\`\n\n` +
    "Each round, state one falsifiable hypothesis from the current Reference and make one bounded change; evaluate the full Case × runs matrix through `run_subagent`, saying in every subagent's prompt to use the `agent-evaluation` Skill — never score a run yourself and never bypass that Skill; " +
    "keeping the provider / model_id / thinking_level that tested agent's baseline recorded; keep the version and append an evaluation carrying `agent_id`, `version`, `provider` / `model_id` and `thinking_level` " +
    "to scoreboard.yaml only when the total score is strictly higher than the Reference, otherwise roll back. " +
    "Finish by reporting the scores before and after, the retained version, and each round's change and decision.",
};
