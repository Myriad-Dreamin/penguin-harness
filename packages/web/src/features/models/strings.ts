/**
 * The models module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `models` section. A new string is added here, to both fragments, and
 * nowhere else — `ModelsStrings` makes a key missing from `modelsEn` a type error.
 */
import type { PeakWindows } from "./model-grouping";

export const modelsZh = {
  title: "模型配置",
  addCustom: "添加自定义模型",
  addToGroup: "添加模型",
  editTitle: "模型配置",
  addTitle: "新增模型（OpenAI 协议）",
  addTitleVendor: "新增模型",
  addProtocolHint: "新增模型走 OpenAI Chat Completions 兼容协议，base URL 填其兼容端点",
  /** Add-dialog note for preset direct-vendor groups (fed the provider label): states whose protocol the group speaks — the in-field suffix on the base URL shows which path. */
  vendorProtocolHint: (vendor: string): string =>
    `仅支持 ${vendor} 官方接口协议，OpenAI 兼容接口请使用自定义模型分组`,
  /** Add-dialog note for a group that pins one protocol on every entry (fed the client type): the protocol is not a choice here, and the endpoint is the user's own. */
  addProtocolHintPinned: (protocol: string): string =>
    `本分组的模型固定使用 ${protocol} 协议，base URL 填你自己的服务地址`,
  /** The same note for a gateway group that pins a protocol: the endpoint is the gateway's, already filled in. */
  addProtocolHintPinnedGateway: (protocol: string): string =>
    `本分组的模型固定使用 ${protocol} 协议，base URL 已预填网关端点`,
  autoRouteNone: "该模型 ID 无法按当前厂商协议识别；若使用 OpenAI 兼容接口，可转为自定义模型。",
  useCustomGroup: "转为自定义模型",
  addGroup: "新增分组",
  addGroupTitle: "新增分组",
  addGroupDesc:
    "自建分组与 Custom 同语义。「导入模型」按端点检测或手选协议后，一键导入其全部模型；「仅新增分组」建组后逐个添加。分组由模型条目承载，保存首个模型后即出现。",
  groupModeCreate: "仅新增分组",
  groupModeImport: "导入模型",
  groupImportAll: "批量导入模型",
  groupImportNeedUrl: "请先填写有效的 base URL（http/https）",
  groupImportKeyHint: "留空按协议读取 OPENAI_* / ANTHROPIC_* 环境变量",
  groupImportListing: "正在获取模型列表…",
  groupImportSaving: (n: number): string => `正在导入 ${n} 个模型…`,
  groupImportUnsupported: "该协议不支持列出模型，请手动添加",
  groupImportFailed: "获取模型列表失败",
  groupImportEmpty: "该端点没有可导入的模型",
  groupImported: (added: number, skipped: number): string =>
    skipped > 0 ? `已导入 ${added} 个模型，跳过 ${skipped} 个条目` : `已导入 ${added} 个模型`,
  groupNameLabel: "分组名",
  groupNameHint: "小写字母 / 数字开头，可含 - 与 _",
  groupNameInvalid: "分组名只能用小写字母、数字、- 与 _（首字符为字母或数字），长度不超过 32",
  groupNameExists: "该分组名已被内置分组或既有条目占用",
  groupEmptyHint: "该分组暂无模型，点「添加模型」创建",
  deleteGroup: "删除分组",
  deleteGroupTitle: "删除分组",
  deleteGroupConfirm: (label: string, n: number): string =>
    `确定删除分组「${label}」？组内 ${n} 个模型及其 API key 配置将一并移除。`,
  groupDeleted: (n: number): string => `已删除分组（${n} 个模型）`,
  searchPlaceholder: "搜索模型：id / 名称 / 厂商",
  noSearchResults: "没有匹配的模型",
  syncCatalog: "同步预置",
  syncCatalogHint:
    "用内置目录更新预置模型：新增缺失条目、以目录字段为准刷新差异；本地新增模型与 API key 保持不变",
  syncDone: (added: number, updated: number) => `预置模型已同步：新增 ${added}、更新 ${updated}`,
  syncUpToDate: "预置模型已是最新",
  /**
   * The header's "Create with AI" entry: the dialog's title and lead, the prompt box's
   * placeholder, the examples and the fixed instruction tail. The tail
   * follows the penguin-config skill — one `penguin config model add` per model with
   * `--provider` mandatory, the config file never touched by hand, `penguin config model list`
   * at the end — and carries the Project id and the data root, which the CLI would otherwise
   * take from its own defaults (the harness strips `PENGUIN_HOME` from a command's
   * environment, so the CLI's default root is not the one the server runs on).
   */
  aiAddTitle: "让 AI 添加模型分组",
  aiAddIntro:
    "把模型列表页的链接或服务信息交给智能体，它会用 penguin config 命令把这些模型加为一个分组。能直接列出模型的 OpenAI 兼容端点，用「新增分组 → 导入模型」更快。",
  aiAddPlaceholder: "粘贴模型列表页的 URL，或描述要接入的服务（网关地址、鉴权方式、模型 id）…",
  aiAddExamples: [
    {
      key: "openrouter",
      label: "OpenRouter 热门模型",
      description: "读取模型列表页，加为一个分组",
      prompt:
        "把 https://openrouter.ai/models 上的热门模型加为一个 OpenRouter 分组（先问我要 API key）。",
    },
    {
      key: "vllm",
      label: "自建 vLLM 服务",
      description: "OpenAI 兼容端点加指定的模型 id",
      prompt:
        "接入我自建的 vLLM 服务 http://10.0.0.5:8000/v1，模型 id 为 qwen3-32b，加为一个 vllm 分组。",
    },
    {
      key: "ollama",
      label: "本机 Ollama",
      description: "把本机已有的模型加为一组",
      prompt: "把本机 Ollama（http://localhost:11434）上已有的模型加为一个 ollama 分组。",
    },
    {
      key: "deepseek",
      label: "DeepSeek 官方模型",
      description: "加进 deepseek 分组并设为默认",
      prompt: "把 DeepSeek 官方的 deepseek-v4-pro 加进 deepseek 分组并设为默认模型。",
    },
  ],
  aiAddTail: (projectId: string): string =>
    [
      "请使用 penguin-config 技能完成上面的配置：",
      "- 下面每条命令都要带 `--root <数据根目录>`，即环境信息中 App Data Dir 的上级目录。命令的环境里没有这个值，不带 `--root` 会配置到另一个数据根目录，本 Project 什么也拿不到。",
      `- 每个模型执行一次 \`penguin config model add --provider <分组名> --model-id <上游模型 id> --project-id ${projectId} --root <数据根目录> [--base-url <端点>] [--client-type openai] [--api-key <key>] [--context-window <n>] [--price-cache-read <n> --price-cache-write <n> --price-output <n>]\`：\`--provider\` 必填，\`--model-id\` 用网关自己的模型 id；OpenAI 兼容端点加 \`--client-type openai --base-url <端点>\`。`,
      "- 来源是网页时先抓取页面：优先加我点名的模型，没有点名就选最常用的，最多 10 个左右。",
      "- 需要 API key 而我没给时只问我一次；我不提供就把 key 留空，并告诉我到模型库页补填。",
      "- 不要读取或改动 .project_config.toml，配置只经 penguin 命令。",
      `- 最后运行 \`penguin config model list --project-id ${projectId} --root <数据根目录>\` 把结果列给我。`,
    ].join("\n"),
  platformSync: "同步",
  homepage: "模型主页",
  speedTest: "测速",
  speedTestTitle: "分组测速",
  speedTestConfirm: (n: number): string =>
    `将对该分组的 ${n} 个模型逐个发起一次真实请求,测量首 token 延迟(TTFT)与输出速率(TPS),会消耗少量 API 额度。是否继续?`,
  speedTestStart: "开始测速",
  speedPending: "测速中…",
  speedFailed: "测速失败",
  ttftTitle: "首 token 延迟(TTFT)",
  tpsTitle: "输出速率(TPS)",
  modelCount: (n: number): string => `${n} 个模型`,
  modelId: "模型 ID",
  modelIdHint: "上游 API 使用的模型 id，如 gpt-5.5",
  displayName: "模型名称",
  displayNameHint: "留空则展示模型 ID",
  providerGroup: "分组",
  contextWindow: "上下文窗口",
  /** Unit suffix shown inside the right edge of the context-window / max-output-length inputs. */
  tokenUnit: "Token",
  contextWindowHint: "留空表示未知",
  maxTokens: "最大输出长度",
  /** Placeholders cannot scroll, so this must fit the half-width box; the full guidance is the input's title tooltip (the owner prefers no visible hint line — saves vertical space). */
  maxTokensHint: "留空沿用 Agent 设置",
  maxTokensTitle:
    "按模型限制单次请求的最大输出 Token 数；留空沿用 Agent 设置，小上下文模型建议调低",
  maxTokensInvalid: "必须为正整数",
  clientTypeLocked: (t: string): string => `协议：${t}（沿用原配置，不可修改）`,
  /** Protocol selector (custom / user-defined groups): AgentHub's generic protocol clients. Protocol names are proper nouns, identical in both locales. */
  protocol: "接口协议",
  protocolNames: {
    "openai-responses": "OpenAI Responses",
    "ant-messages": "Anthropic Messages",
    "openai-chat": "OpenAI Chat Completions",
  } as Record<string, string | undefined>,
  /** Hover title on the in-field protocol picker (the base URL field's right-edge suffix). */
  protocolTriggerTitle: (name: string): string => `接口协议：${name}。点击可更换。`,
  /** Suffix placeholder while no protocol is selected — 不显示任何协议名，避免看起来已选好。 */
  protocolUnset: "选择协议",
  /** Detect button at the base URL field's top-right. */
  detectProtocol: "检测协议",
  /** Hover title on the detect button. */
  detectProtocolHint: "探测 base URL，采用它实际提供的协议",
  detecting: "检测中…",
  /** Success toast；协议本身随后显示在 base URL 输入框的后缀处。 */
  detectedProtocol: (name: string): string => `检测到 ${name} 协议，已应用`,
  /** Success toast when the probe answered on a tidied-up base URL, which the field now holds. */
  detectedProtocolAndUrl: (protocol: string, url: string): string =>
    `已检测为 ${protocol}，base URL 已整理为 ${url}`,
  /** The ONE failure toast: 所有失败情形共用，只讲用户能动手改的两件事。 */
  detectFailedBody: "无法检测接口协议，请检查 API Key 与 base URL。",
  /** 保存时检测无结果：按兼容协议继续保存。 */
  detectFellBack: "未检测到协议，已按 OpenAI Chat Completions 保存",
  /** Add-dialog note for custom / user-defined groups (protocol selectable): replaces the fixed-OpenAI wording. */
  addProtocolHintDetect:
    "可在 base URL 输入框右端的后缀处手动选择接口协议（OpenAI Responses / Anthropic Messages / OpenAI Chat Completions），也可点“检测协议”探测端点；未选协议时保存会先自动检测",
  addTitleCustom: "新增模型",
  /** Switch label only — the dialog carries no explanation text for it (per owner). */
  vision: "支持视觉",
  /** Detect action beside the vision switch. */
  detectVision: "检测",
  detectingVision: "测试中…",
  detectVisionHint: "发送一张极小的测试图片，判断该模型是否接受图片输入(会消耗 API Key 额度)",
  detectVisionNeedsId: "请先填写模型 id，再进行检测。",
  detectVisionOk: "该模型接受图片输入，已开启视觉",
  detectVisionNo: "该模型不接受图片输入，视觉保持关闭",
  /** Shown only while the vision switch is OFF: images are then read via the configured vision proxy model (read_file hands them to it). */
  visionOffProxyHint: "使用视觉代理模型读图",
  /** Switch label for the per-model fast mode (the provider's premium faster serving tier); the switch is only rendered for models whose AgentHub client can carry the parameter. */
  fastMode: "快速模式",
  /** Shown while the fast-mode switch is ON (and as the label's hover title): what it buys, and that the recorded prices do not follow the premium rate. */
  fastModeHint: "输出更快，按厂商的溢价档位计费；成本中心仍按条目记录的标准单价统计",
  /** Amber line under an ON switch on a model whose client rejects the parameter (a hand-edited config or a renamed id): the switch stays visible only so it can be turned off. */
  fastModeUnsupported: "该模型不支持快速模式，请关闭，否则请求会失败",
  /** Accessible name of the warning dialog raised when the fast-mode switch is turned ON. */
  fastModeConfirmTitle: "开启快速模式",
  /** Body of that warning: premium billing, and that the recorded prices do not follow it. */
  fastModeConfirmBody:
    "快速模式按厂商的溢价价目计费（MiniMax 为标准价的 1.5 倍，OpenAI 与 Anthropic 另有溢价价目表）。条目记录的按 Token 单价不会随之调整，成本中心会低估这部分用量。",
  /** Extra paragraph shown only for Anthropic-protocol models: fast mode there is a gated research preview. */
  fastModeConfirmPreview:
    "Anthropic 的快速模式目前是限量的 research preview：在你的组织获得授权之前，请求会返回 429 限流错误。",
  /** Badge on a model row whose fast mode is on: a standing premium-billing choice should be visible without opening the dialog. */
  fastModeBadge: "快速",
  visionBadge: "视觉",
  /** Light-yellow badge on zero-cost models (all three price buckets 0, e.g. the :free variants and openrouter/free). */
  freeBadge: "免费",
  /**
   * Caption above a provider group the catalog marks as recommended. It travels with the
   * group, so a user who drags that group elsewhere still sees why it is called out.
   */
  recommendedGroup: "官方推荐",
  /** Badge on a row the seller is currently discounting: the rate off its list price. */
  discountBadge: (pct: number): string => `省 ${pct}%`,
  discountTitle: (pct: number): string => `促销价：已在牌价基础上打 ${pct}% 折扣`,
  /**
   * Same badge as a flat promotion; only the explanation differs, because this rate comes and
   * goes with the clock. `peak` is the row's own schedule (see peakWindows), so each seller's
   * peak hours are the ones named.
   */
  offPeakTitle: (pct: number, peak: PeakWindows): string => {
    const day = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    const days = peak.everyDay
      ? "每天"
      : peak.days
          .map(([from, to]) => (from === to ? day[from - 1] : `${day[from - 1]}至${day[to - 1]}`))
          .join("、");
    const hours = peak.hours.map(([from, to]) => `${from}:00–${to}:00`).join("、");
    return `空闲时段价：比牌价低 ${pct}%。高峰时段按牌价计费——北京时间${days} ${hours}`;
  },
  visionModelBadge: "视觉代理",
  /** Card's right-edge figure: what this model has spent over its whole life. The unit stays English and is abbreviated the way the rest of the page abbreviates it — `tok/s`, `/M tok`. */
  usedTokens: (v: string) => `${v} toks`,
  usedTokensTitle: "该模型累计消耗的 Token（不限时间范围）",
  setVisionModel: "设为视觉代理模型",
  visionModelHint: "供不支持图片的模型在 read_file 读图时代读",
  priceUnitShort: "/M tok",
  testConnection: "测试连通性",
  testing: "测试中…",
  testOk: (ms: number): string => `连通正常（${ms} ms）`,
  testFailed: (msg: string): string => `连通失败：${msg}`,
  priceCacheRead: "缓存命中价格",
  priceCacheWrite: "缓存未命中价格",
  priceOutput: "输出价格",
  /** Line under the model dialog's price fields on a row with a running promotion: the fields hold the list price, and changing it cancels the promotion. */
  promotionPriceHint: (pct: number): string =>
    `此处为牌价，当前促销在此基础上省 ${pct}%；修改价格会取消促销`,
  currency: "币种",
  currencyUsd: "美元 $",
  currencyCny: "人民币 ¥",
  apiKey: "API key",
  apiKeyKeepHint: "留空保留现有 key",
  apiKeyEnvHint: (envKey: string): string => `留空则使用环境变量 ${envKey}`,
  keyConfigured: "已配置 key",
  clearApiKey: "清除已存 API key",
  baseUrl: "自定义 base URL",
  baseUrlHint: "留空使用厂商默认地址",
  /** Hover title for the base URL field: explains the in-field suffix (the protocol path the client appends to the base URL); for custom groups that suffix is also the protocol picker. */
  baseUrlSuffixTitle: "客户端会在 base URL 后追加字段右侧的协议路径",
  baseUrlRequired: "必须填写 base URL",
  contextWindowDefaultHint: (n: number): string => `留空按 ${n} 计`,
  confirmDeleteTitle: "删除模型",
  confirmDelete: (name: string): string =>
    `确定删除「${name}」？该模型的配置与 API key 将一并移除。`,
  groupApiKey: "手动设置密钥",
  groupApiKeyTitle: (label: string): string => `为「${label}」统一配置 API key`,
  groupApiKeyHint: (n: number): string => `将写入该分组下全部 ${n} 个模型；留空不改动。`,
  getApiKey: "前往密钥管理",
  getModelIds: "获取模型 id",
  groupKeyApplied: (n: number): string => `已为 ${n} 个模型配置 API key`,
  // 供应商授权取 key（模型分组头部动作）：整个 PKCE 流程都在服务端跑，前端只拿到一个
  // 不透明的 flow id 和状态。
  oauthKey: "自动获取密钥",
  oauthTitle: (label: string): string => `从「${label}」授权新建 API key`,
  oauthIntro: (label: string, n: number): string =>
    `将在你的 ${label} 账户下新建一个 API key，并写入该分组下全部 ${n} 个模型，覆盖它们当前的 key。`,
  oauthAuthorize: "打开授权页",
  oauthWaiting: "等待在新标签页中完成授权…",
  /**
   * The dialog's own report once the key has landed. It says the provider as well as the
   * count, because the user is reading it after a trip to another tab and may not remember
   * which authorization they just finished.
   */
  oauthAppliedBody: (provider: string, n: number): string =>
    `已完成授权：${provider} 的 API key 已配置到 ${n} 个模型上，可以直接使用了。`,
  oauthManualSwitch: "授权页跳不回来？改为手动填写授权码",
  oauthCallbackSwitch: "改回自动跳转",
  oauthManualHint: "先打开授权页，再把页面上显示的一次性授权码粘贴到这里。",
  oauthCodeLabel: "授权码",
  oauthSubmitCode: "提交授权码",
  oauthTimedOut: "没有等到授权结果。可以改为手动填写授权码，或重新开始。",
  oauthRetry: "重新开始",
  oauthErrors: {
    invalid_request: "授权请求被拒绝，请重新开始。",
    code_rejected: "该授权已失效：可能已过期或被用过，请重新开始。",
    upstream_failed: "供应商没有返回可用的 key，请重新开始。",
    unreachable: "连不上供应商，请检查网络后重新开始。",
    apply_failed: "key 已创建但未能保存。请重新授权，并到供应商控制台删掉那个没用上的 key。",
  },
  platformKeyIntro: (n: number): string =>
    `授权后会自动获取一个 Penguin Go API key，并写入该分组下全部 ${n} 个预置模型，覆盖它们当前的 key。`,
  platformKeyAppliedBody: (n: number): string =>
    `已完成授权：Penguin Go API key 已配置到 ${n} 个模型上，可以直接使用了。`,
  platformKeyStarting: "正在创建授权请求…",
  platformKeyApplying: "授权已完成，正在写入模型组…",
  platformKeyErrors: {
    unreachable: "无法连接 Penguin Go，请检查网络后重新开始。",
    upstream_failed: "Penguin Go 未能完成授权，请重新开始。",
    invalid_key: "Penguin Go 未返回可用的 API key，请重新开始。",
    expired: "授权已过期，请重新开始。",
    locked: "授权已锁定，请重新开始。",
    already_delivered: "该授权结果已经交付，请重新开始。",
    apply_failed: "API key 已取得，但未能写入模型组。可以直接重试，无需再次授权。",
  },
  // 魔搭走的是授权中转层：harness 不直接与魔搭对话，中转层拿着 client secret 换回
  // api-inference token。access token 会写入模型表；refresh token 只保存在服务端 DB。
  modelScopeKeyIntro: (n: number): string =>
    `授权后会自动获取一个魔搭 API token，并写入该分组下全部 ${n} 个预置模型，覆盖它们当前的 key；后续请求会在服务端静默续期，连续续期失败时会提示你重新授权。`,
  modelScopeKeyAppliedBody: (n: number): string =>
    `已完成授权：魔搭 API token 已配置到 ${n} 个模型上，可以直接使用了。`,
  modelScopeKeyErrors: {
    unreachable: "无法连接授权中转层，请检查网络后重新开始。",
    upstream_failed: "中转层未能完成授权，请重新开始。",
    invalid_key: "中转层未返回可用的 API token，请重新开始。",
    expired: "授权已过期，请重新开始。",
    locked: "授权已锁定，请重新开始。",
    already_delivered: "该授权结果已经交付，请重新开始。",
    apply_failed: "API token 已取得，但未能写入模型组。可以直接重试，无需再次授权。",
  },
  // Providers with separate domestic / international endpoints: note on the default
  // endpoint used when left blank via env var (the other side's key needs an explicit
  // base URL). Written to match AgentHub's actual behavior; rendered wherever the env fallback hint appears.
  providerEnvNotes: {
    zhipu:
      "缺省端点为 Z.AI 国际版（api.z.ai）；智谱开放平台（bigmodel.cn）的 key 需填 base URL https://open.bigmodel.cn/api/paas/v4",
    moonshot:
      "缺省端点为国内版（api.moonshot.cn）；platform.kimi.com（国际）的 key 需填 base URL https://api.moonshot.ai/v1",
  } as Record<string, string | undefined>,
  confirmVisionModelTitle: "设为视觉代理模型",
  confirmVisionModel: (name: string): string =>
    `确定把「${name}」设为视觉代理模型？不支持图片的模型用 read_file 读图时将由它代读。`,
  confirmSaveTitle: "保存模型配置",
  confirmSave: (name: string): string => `确定保存对「${name}」的配置修改？`,
  confirmDefaultTitle: "设为默认模型",
  confirmDefault: (name: string): string =>
    `确定把「${name}」设为默认模型？新建的 Session 将默认使用它。`,
  default: "默认",
  setDefault: "设为默认模型",
  remove: "删除模型",
  readOnlyHint: "member 只读；模型与 credential 修改仅 owner 可执行",
  empty: "尚未配置任何模型",
  noKey: "未配置 key",
  /**
   * Model dialog credential slot: sits where a stored key shows its created-at line. It
   * names no variable — the slot next to it already shows that variable's value masked,
   * which is what identifies the key to the reader.
   */
  readFromEnv: "读取自环境变量",
  /** Chat model dropdown's bottom expander row: reveals the models hidden by the configured-key filter. */
  showModelsWithoutKey: (n: number): string => `显示未配置 key 的模型（${n} 个）`,
  modelIdExists: "该模型 id 已存在",
  pricingAllOrNone: "三项价格需一并填写",
  pricingInvalid: "必须为数字",
  contextWindowInvalid: "必须为数字",
};

export type ModelsStrings = typeof modelsZh;

export const modelsEn: ModelsStrings = {
  title: "Models",
  addCustom: "Add custom model",
  addToGroup: "Add model",
  editTitle: "Model settings",
  addTitle: "Add model (OpenAI protocol)",
  addTitleVendor: "Add model",
  addProtocolHint:
    "New models use the OpenAI Chat Completions protocol; set the base URL to a compatible endpoint",
  vendorProtocolHint: (vendor: string): string =>
    `Only ${vendor}'s official API protocol is supported; use a custom model group for OpenAI-compatible endpoints.`,
  addProtocolHintPinned: (protocol: string): string =>
    `Models in this group always use the ${protocol} protocol; set the base URL to your own server`,
  addProtocolHintPinnedGateway: (protocol: string): string =>
    `Models in this group always use the ${protocol} protocol; the base URL is preset to the gateway's endpoint`,
  autoRouteNone:
    "This model ID cannot be routed with the current provider protocol. If it uses an OpenAI-compatible endpoint, move it to Custom.",
  useCustomGroup: "Move to Custom",
  addGroup: "Add group",
  addGroupTitle: "Add group",
  addGroupDesc:
    'User-defined groups share Custom semantics. "Import models" detects (or lets you pick) the endpoint\'s protocol, then imports every model it serves in one go; "Create only" adds models one by one after the group. Groups live on model entries — the group appears once its first model is saved.',
  groupModeCreate: "Create only",
  groupModeImport: "Import models",
  groupImportAll: "Import all models",
  groupImportNeedUrl: "Fill in a valid base URL first (http/https)",
  groupImportKeyHint: "Leave empty to read the protocol's OPENAI_* / ANTHROPIC_* env vars",
  groupImportListing: "Fetching model list…",
  groupImportSaving: (n: number): string => `Importing ${n} models…`,
  groupImportUnsupported: "This protocol cannot list models — add them manually",
  groupImportFailed: "Fetching the model list failed",
  groupImportEmpty: "No models to import from this endpoint",
  groupImported: (added: number, skipped: number): string =>
    skipped > 0
      ? `Imported ${added} models, skipped ${skipped} entries`
      : `Imported ${added} models`,
  groupNameLabel: "Group name",
  groupNameHint: "Starts with a lowercase letter / digit; may contain - and _",
  groupNameInvalid:
    "Group names may only use lowercase letters, digits, - and _ (starting with a letter or digit), up to 32 characters",
  groupNameExists: "This name is taken by a built-in group or an existing entry",
  groupEmptyHint: "No models in this group yet; use “Add model” to create one",
  deleteGroup: "Delete group",
  deleteGroupTitle: "Delete group",
  deleteGroupConfirm: (label: string, n: number): string =>
    `Delete the group “${label}”? Its ${n} models and their API key configuration will be removed.`,
  groupDeleted: (n: number): string => `Group deleted (${n} models)`,
  searchPlaceholder: "Search models: id / name / provider",
  noSearchResults: "No matching models",
  syncCatalog: "Sync presets",
  syncCatalogHint:
    "Update preset models from the built-in catalog: add missing entries and reset differing ones to the catalog's fields; locally added models and API keys are left untouched",
  syncDone: (added: number, updated: number) =>
    `Presets synced: ${added} added, ${updated} updated`,
  syncUpToDate: "Presets are already up to date",
  aiAddTitle: "Add a model group with AI",
  aiAddIntro:
    "Hand the agent a model listing page or a description of the service, and it adds the models as one group with penguin config commands. For an OpenAI-compatible endpoint that lists its own models, Add group → Import models is faster.",
  aiAddPlaceholder:
    "Paste the URL of a model listing page, or describe the service to connect (gateway URL, authentication, model ids)…",
  aiAddExamples: [
    {
      key: "openrouter",
      label: "OpenRouter's popular models",
      description: "Reads the listing page, adds one group",
      prompt:
        "Add the popular models on https://openrouter.ai/models as an OpenRouter group (ask me for the API key first).",
    },
    {
      key: "vllm",
      label: "A self-hosted vLLM server",
      description: "OpenAI-compatible endpoint plus a model id",
      prompt:
        "Connect my self-hosted vLLM server at http://10.0.0.5:8000/v1, model id qwen3-32b, as a vllm group.",
    },
    {
      key: "ollama",
      label: "Local Ollama",
      description: "Adds the models already pulled locally",
      prompt:
        "Add the models already available on my local Ollama (http://localhost:11434) as an ollama group.",
    },
    {
      key: "deepseek",
      label: "DeepSeek's official model",
      description: "Into the deepseek group, set as the default",
      prompt:
        "Add DeepSeek's official deepseek-v4-pro to the deepseek group and make it the default model.",
    },
  ],
  aiAddTail: (projectId: string): string =>
    [
      "Use the penguin-config skill for the configuration above:",
      "- Every command below carries `--root <data root>`, the parent directory of the App Data Dir in your Environment section. Your command environment does not name that root, so a command without `--root` configures a different one and nothing reaches this Project.",
      `- Run \`penguin config model add --provider <group> --model-id <upstream id> --project-id ${projectId} --root <data root> [--base-url <endpoint>] [--client-type openai] [--api-key <key>] [--context-window <n>] [--price-cache-read <n> --price-cache-write <n> --price-output <n>]\` once per model: \`--provider\` is mandatory, \`--model-id\` takes the gateway's own model id, and an OpenAI-compatible endpoint gets \`--client-type openai --base-url <endpoint>\`.`,
      "- When the source is a web page, fetch it first: add the models I named, or the most popular ones when I named none, about 10 at most.",
      "- When an API key is needed and I did not give one, ask me once; if I do not provide it, leave the key empty and tell me to fill it in on the Models page.",
      "- Never read or edit .project_config.toml; configuration goes through penguin commands only.",
      `- Finish with \`penguin config model list --project-id ${projectId} --root <data root>\` and show me the result.`,
    ].join("\n"),
  platformSync: "Sync",
  homepage: "Model page",
  speedTest: "Speed test",
  speedTestTitle: "Speed test",
  speedTestConfirm: (n: number): string =>
    `This sends one real request to each of the ${n} models in this group, one at a time, to measure time-to-first-token (TTFT) and output rate (TPS). It consumes a small amount of API quota. Continue?`,
  speedTestStart: "Start",
  speedPending: "Testing…",
  speedFailed: "Test failed",
  ttftTitle: "Time to first token (TTFT)",
  tpsTitle: "Output rate (TPS)",
  modelCount: (n: number): string => `${n} model${n === 1 ? "" : "s"}`,
  modelId: "Model ID",
  modelIdHint: "The upstream API model id, e.g. gpt-5.5",
  displayName: "Display name",
  displayNameHint: "Defaults to the model ID",
  providerGroup: "Group",
  contextWindow: "Context window",
  tokenUnit: "Token",
  contextWindowHint: "Leave empty if unknown",
  maxTokens: "Max output tokens",
  maxTokensHint: "Empty = inherit agent setting",
  maxTokensTitle:
    "Caps output tokens per request; leave empty to inherit the agent setting — lower it for small-context models",
  maxTokensInvalid: "Must be a positive integer",
  clientTypeLocked: (t: string): string => `Protocol: ${t} (kept as configured; not editable)`,
  protocol: "Protocol",
  protocolNames: {
    "openai-responses": "OpenAI Responses",
    "ant-messages": "Anthropic Messages",
    "openai-chat": "OpenAI Chat Completions",
  } as Record<string, string | undefined>,
  protocolTriggerTitle: (name: string): string => `Protocol: ${name}. Click to change it.`,
  /** Suffix placeholder while no protocol is selected — never a protocol name, so nothing looks pre-chosen. */
  protocolUnset: "Select protocol",
  detectProtocol: "Detect",
  detectProtocolHint: "Probe the base URL and apply the protocol it serves",
  detecting: "Detecting…",
  /** Success toast; the protocol itself then shows in the base URL field's suffix. */
  detectedProtocol: (name: string): string => `Detected ${name}; applied`,
  /** Success toast when the probe answered on a tidied-up base URL, which the field now holds. */
  detectedProtocolAndUrl: (protocol: string, url: string): string =>
    `Detected ${protocol}; base URL normalized to ${url}`,
  /** The ONE failure toast: every mode collapses to it, naming only what the user can act on. */
  detectFailedBody: "Could not detect the protocol. Please check the API key and the base URL.",
  /** Save-time detection came back empty: the save proceeds on the compatible client. */
  detectFellBack: "Protocol not detected; saved as OpenAI Chat Completions",
  addProtocolHintDetect:
    "Pick the protocol from the base URL field's suffix (OpenAI Responses / Anthropic Messages / OpenAI Chat Completions), or press Detect to probe the endpoint — saving without one detects it first",
  addTitleCustom: "Add model",
  vision: "Vision support",
  /** Detect action beside the vision switch. */
  detectVision: "Detect",
  detectingVision: "Testing…",
  detectVisionHint:
    "Send one tiny test image to see whether this model accepts images (uses your API key)",
  detectVisionNeedsId: "Fill in the model id first, then detect.",
  detectVisionOk: "This model accepts images; vision turned on",
  detectVisionNo: "This model does not accept images; vision left off",
  visionOffProxyHint: "Images are read via the vision proxy model",
  fastMode: "Fast mode",
  fastModeHint:
    "Faster output, billed at the provider's premium tier; the Cost center still counts it at the entry's standard prices",
  fastModeUnsupported:
    "This model does not support fast mode — turn it off, or its requests will fail",
  fastModeConfirmTitle: "Enable fast mode",
  fastModeConfirmBody:
    "Fast mode is billed at the provider's premium price list (MiniMax charges 1.5x standard; OpenAI and Anthropic publish separate premium rates). The entry's recorded per-token prices are not adjusted, so the Cost center will under-report this usage.",
  fastModeConfirmPreview:
    "Anthropic's fast mode is a limited research preview: until your organization is granted access, requests return a 429 rate-limit error.",
  fastModeBadge: "Fast",
  visionBadge: "Vision",
  freeBadge: "Free",
  /**
   * Rides the group's own collapse bar, which on this group carries five actions — the most
   * crowded row on the page. One word, because the vendor name beside it is what a reader
   * needs first and is the element that truncates.
   */
  recommendedGroup: "Recommended",
  discountBadge: (pct: number): string => `${pct}% off`,
  discountTitle: (pct: number): string => `Promotion: ${pct}% off the list price`,
  offPeakTitle: (pct: number, peak: PeakWindows): string => {
    const day = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const days = peak.everyDay
      ? "every day"
      : peak.days
          .map(([from, to]) => (from === to ? day[from - 1] : `${day[from - 1]} to ${day[to - 1]}`))
          .join(", ");
    const clock = (hour: number): string => `${String(hour).padStart(2, "0")}:00`;
    const hours = peak.hours.map(([from, to]) => `${clock(from)}–${clock(to)}`).join(" and ");
    return `Off-peak rate: ${pct}% off list. Peak hours bill at list price — ${hours} Beijing time, ${days}`;
  },
  visionModelBadge: "Proxy vision",
  usedTokens: (v: string) => `${v} toks`,
  usedTokensTitle: "Tokens this model has used, all time",
  setVisionModel: "Set as proxy vision model",
  visionModelHint: "Describes images for models without vision when they read one with read_file",
  priceUnitShort: "/M tok",
  testConnection: "Test connection",
  testing: "Testing…",
  testOk: (ms: number): string => `Connected (${ms} ms)`,
  testFailed: (msg: string): string => `Failed: ${msg}`,
  priceCacheRead: "Cache read price",
  priceCacheWrite: "Cache write price",
  priceOutput: "Output price",
  promotionPriceHint: (pct: number): string =>
    `These are list prices. A running promotion takes ${pct}% off them; changing a price cancels it`,
  currency: "Currency",
  currencyUsd: "USD $",
  currencyCny: "CNY ¥",
  apiKey: "API key",
  apiKeyKeepHint: "Leave empty to keep the current key",
  apiKeyEnvHint: (envKey: string): string => `Leave empty to use the ${envKey} env var`,
  keyConfigured: "Key configured",
  clearApiKey: "Clear stored API key",
  baseUrl: "Custom base URL",
  baseUrlHint: "Leave empty to use the provider default",
  baseUrlSuffixTitle:
    "The client appends the protocol path shown at the field's right edge to the base URL",
  baseUrlRequired: "A base URL is required",
  contextWindowDefaultHint: (n: number): string => `Defaults to ${n} if empty`,
  confirmDeleteTitle: "Delete model",
  confirmDelete: (name: string): string =>
    `Delete "${name}"? Its configuration and API key will be removed.`,
  groupApiKey: "Set key",
  groupApiKeyTitle: (label: string): string => `Set the API key for ${label}`,
  groupApiKeyHint: (n: number): string =>
    `Applies to all ${n} models in this group; leave empty to keep them unchanged.`,
  getApiKey: "Manage keys",
  getModelIds: "Get model IDs",
  groupKeyApplied: (n: number): string => `API key set for ${n} models`,
  oauthKey: "Authorize key",
  oauthTitle: (label: string): string => `Authorize a new ${label} API key`,
  oauthIntro: (label: string, n: number): string =>
    `A new API key will be created on your ${label} account and written to all ${n} models in this group, replacing the key they use now.`,
  oauthAuthorize: "Open authorization page",
  oauthWaiting: "Waiting for the authorization to finish in the other tab…",
  /**
   * The dialog's own report once the key has landed. It names the provider as well as the
   * count, because the user is reading it after a trip to another tab and may not remember
   * which authorization they just finished.
   */
  oauthAppliedBody: (provider: string, n: number): string =>
    `Authorized. ${provider}'s API key is set on ${n} model${n === 1 ? "" : "s"} and ready to use.`,
  oauthManualSwitch: "Page can't redirect back? Enter the code by hand",
  oauthCallbackSwitch: "Go back to the automatic redirect",
  oauthManualHint: "Open the authorization page, then paste the one-time code it shows you here.",
  oauthCodeLabel: "Authorization code",
  oauthSubmitCode: "Submit code",
  oauthTimedOut: "The authorization never came back. Enter the code by hand, or start again.",
  oauthRetry: "Start again",
  oauthErrors: {
    invalid_request: "The authorization request was rejected. Start again.",
    code_rejected:
      "That authorization is no longer valid: it expired or was already used. Start again.",
    upstream_failed: "The provider returned no usable key. Start again.",
    unreachable: "The provider could not be reached. Check the network and start again.",
    apply_failed:
      "A key was created but could not be saved. Authorize again, then delete the unused key in the provider's console.",
  },
  platformKeyIntro: (n: number): string =>
    `Authorization automatically obtains a Penguin Go API key and writes it to all ${n} preset models in this group, replacing their current key.`,
  platformKeyAppliedBody: (n: number): string =>
    `Authorized. The Penguin Go API key is set on ${n} model${n === 1 ? "" : "s"} and ready to use.`,
  platformKeyStarting: "Starting authorization…",
  platformKeyApplying: "Authorization completed. Writing the key to the model group…",
  platformKeyErrors: {
    unreachable: "Penguin Go could not be reached. Check the network and start again.",
    upstream_failed: "Penguin Go could not complete authorization. Start again.",
    invalid_key: "Penguin Go returned no usable API key. Start again.",
    expired: "The authorization expired. Start again.",
    locked: "The authorization was locked. Start again.",
    already_delivered: "That authorization was already delivered. Start again.",
    apply_failed:
      "The API key was received but could not be written to the model group. Retry without authorizing again.",
  },
  // ModelScope goes through the authorization bridge: the harness never talks to ModelScope
  // itself, and the bridge holds the client secret that buys an api-inference token. The
  // access token is written to the model table; the refresh token stays in the server DB.
  modelScopeKeyIntro: (n: number): string =>
    `Authorization automatically obtains a ModelScope API token and writes it to all ${n} preset models in this group, replacing their current key; later requests renew it silently on the server, and repeated renewal failures prompt you to authorize again.`,
  modelScopeKeyAppliedBody: (n: number): string =>
    `Authorized. The ModelScope API token is set on ${n} model${n === 1 ? "" : "s"} and ready to use.`,
  modelScopeKeyErrors: {
    unreachable:
      "The authorization bridge could not be reached. Check the network and start again.",
    upstream_failed: "The bridge could not complete authorization. Start again.",
    invalid_key: "The bridge returned no usable API token. Start again.",
    expired: "The authorization expired. Start again.",
    locked: "The authorization was locked. Start again.",
    already_delivered: "That authorization was already delivered. Start again.",
    apply_failed:
      "The API token was received but could not be written to the model group. Retry without authorizing again.",
  },
  providerEnvNotes: {
    zhipu:
      "Defaults to the Z.AI global endpoint (api.z.ai); keys from bigmodel.cn need base URL https://open.bigmodel.cn/api/paas/v4",
    moonshot:
      "Defaults to the China endpoint (api.moonshot.cn); keys from platform.kimi.com need base URL https://api.moonshot.ai/v1",
  },
  confirmVisionModelTitle: "Set as proxy vision model",
  confirmVisionModel: (name: string): string =>
    `Make "${name}" the proxy vision model? Models without vision will read images through it when they call read_file.`,
  confirmSaveTitle: "Save model settings",
  confirmSave: (name: string): string => `Save the changes to "${name}"?`,
  confirmDefaultTitle: "Set as default model",
  confirmDefault: (name: string): string =>
    `Make "${name}" the default model? New sessions will use it by default.`,
  default: "Default",
  setDefault: "Set as default model",
  remove: "Delete model",
  readOnlyHint: "Members have read-only access; only owners can change models and credentials",
  empty: "No models configured yet",
  noKey: "No key",
  readFromEnv: "Read from environment variable",
  showModelsWithoutKey: (n: number): string =>
    `Show model${n === 1 ? "" : "s"} without a key (${n})`,
  modelIdExists: "This model id already exists",
  pricingAllOrNone: "Fill all three prices",
  pricingInvalid: "Must be a number",
  contextWindowInvalid: "Must be a number",
};
