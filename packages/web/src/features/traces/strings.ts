/**
 * The traces module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `traces` section. A new string is added here, to both fragments, and
 * nowhere else — `TracesStrings` makes a key missing from `tracesEn` a type error.
 */
export const tracesZh = {
  timeline: "执行时间线",
  laneLLM: "模型",
  kindThinking: "思考",
  kindModelReply: "模型回复",
  kindToolGen: "工具调用生成",
  legendToolExec: "工具调用执行",
  legendOther: "其他",
  toolParams: "参数 Schema",
  /** Spoken form of the red "*" in the schema table, where no control carries `aria-required`. */
  requiredParam: "必填",
  legendApprovalWait: "审批等待",
  task: (n: number) => `第 ${n} 轮`,
  globalSummary: "全局统计",
  tasksLabel: "轮次",
  messages: "消息",
  /** Shown while the file's remaining pages are still being fetched; gone once every message is on screen. */
  loadingNote: (shown: number, total: number) => `已载入 ${shown} / ${total} 条消息…`,
  zoom: "缩放",
  zoomReset: "双击复位缩放",
  zoomOut: "缩小",
  zoomIn: "放大",
  linkHint:
    "鼠标移到时间线段或消息行即可联动高亮，点击时间线段跳转到对应消息；图例可高亮同类；拖动下方滑块平移/缩放",
  filesTitle: "Trace 文件",
  toolCalls: "工具调用",
  taskInput: "本轮输入 tokens",
  taskOutput: "本轮输出 tokens",
  cacheHit: "命中缓存",
  hitRate: "命中率",
  avgToolCalls: "每轮平均工具调用",
  /** The round-card badge reuses `chat.compactionTitle`, which names the mode (压缩 / 清空) and is the stem of the conversation row's state titles (压缩中 / 压缩完毕), so the Trace view and the conversation cannot drift apart; there is deliberately no Trace-local copy of that word. */
  inProgress: "进行中",
  systemPrompt: "系统提示词",
  toolDefs: (n: number) => `工具定义（${n}）`,
  exportFile: "导出",
};

export type TracesStrings = typeof tracesZh;

export const tracesEn: TracesStrings = {
  timeline: "Execution timeline",
  laneLLM: "Model",
  kindThinking: "thinking",
  kindModelReply: "model reply",
  kindToolGen: "tool call gen",
  legendToolExec: "tool exec",
  legendOther: "Other",
  toolParams: "Parameter schema",
  /** Spoken form of the red "*" in the schema table, where no control carries `aria-required`. */
  requiredParam: "required",
  legendApprovalWait: "approval wait",
  task: (n: number) => `Turn ${n}`,
  globalSummary: "Overall",
  tasksLabel: "Turns",
  messages: "Messages",
  /** Shown while the file's remaining pages are still being fetched; gone once every message is on screen. */
  loadingNote: (shown: number, total: number) => `Loaded ${shown} / ${total} messages…`,
  zoom: "Zoom",
  zoomReset: "Double-click to reset zoom",
  zoomOut: "Zoom out",
  zoomIn: "Zoom in",
  linkHint:
    "Hover a timeline segment or event row to cross-highlight, click a segment to jump to its message; legend highlights its kind; drag the bar below to pan/zoom",
  filesTitle: "Trace files",
  toolCalls: "Tool calls",
  taskInput: "Input tokens this turn",
  taskOutput: "Output tokens this turn",
  cacheHit: "Cache hits",
  hitRate: "Hit rate",
  avgToolCalls: "Avg tools / turn",
  inProgress: "in progress",
  systemPrompt: "System prompt",
  toolDefs: (n: number) => `Tool definitions (${n})`,
  exportFile: "Export",
};
