/**
 * The usage module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `usage` section. A new string is added here, to both fragments, and
 * nowhere else — `UsageStrings` makes a key missing from `usageEn` a type error.
 */
export const usageZh = {
  title: "成本与统计",
  today: "今日",
  last7d: "近 7 天",
  total: "累计",
  tokens: "Token",
  requests: "Requests",
  from: "起始日期",
  to: "结束日期",
  colCacheRead: "缓存命中",
  colCacheWrite: "缓存未命中",
  colOutput: "输出",
  uncostedNote: "* 只计入配置了价格的模型成本",
  filterAllAgents: "全部 Agent",
  filterAllModels: "全部模型",
  rangeLabel: "日期范围",
  rangeHour: "最近一小时",
  rangeDay: "最近一天",
  range7d: "近 7 天",
  range30d: "近 30 天",
  range90d: "近 90 天",
  rangeCustom: "自定义",
  chartRequestsByAgent: "各 Agent 请求与成功率",
  chartRequestsByModel: "各模型请求与成功率",
  legendSuccessRate: "成功率",
  chartTokenTrend: "Token 变化",
  chartCostTrend: "成本变化",
  legendOther: (n: number): string => `其他 ${n} 项`,
  bucketTotal: "合计",
  legendHitRate: "缓存命中率",
  empty: "暂无用量记录",
  errors: "异常",
  errorsTotal: "总数",
  errorsUnexpected: "未预期",
  errorsExpected: "预期内",
  errorsTopCode: "最常见",
  errorsColCode: "来源 · 错误码",
  errorsColKind: "类型",
  errorsColMessage: "消息",
  errorsEmpty: "暂无异常",
  /** Detail-table pager: newer/older step back through pages of the same filtered set. */
  errorsNewer: "较新",
  errorsOlder: "更早",
  errorsPageOf: (page: number, pages: number, total: number) =>
    `第 ${page} / ${pages} 页 · 共 ${total} 条`,
  /** Clearing the table: the action, and the confirm that must name exactly what goes. */
  errorsClear: "清空",
  errorsClearTitle: "清空错误记录",
  /** The range half of the confirm: a quick preset by the name the picker gives it, a custom range by its two dates — each one adverbial the sentence below slots in. */
  errorsClearRangePreset: (preset: "1h" | "1d" | "7d" | "30d" | "90d"): string =>
    ({
      "1h": "最近一小时内",
      "1d": "最近一天内",
      "7d": "近 7 天内",
      "30d": "近 30 天内",
      "90d": "近 90 天内",
    })[preset],
  errorsClearRangeCustom: (from: string, to: string): string => `在 ${from} 至 ${to} 区间内`,
  errorsClearScope: (count: number, range: string): string =>
    `将删除本 Project ${range}的 ${count} 条错误记录，其余时间段的记录保留。`,
  errorsClearScopeAgent: (count: number, range: string, agentId: string): string =>
    `将删除本 Project 中 Agent「${agentId}」${range}的 ${count} 条错误记录，其他 Agent 与其余时间段的记录保留。`,
  errorsClearIrreversible: "此操作不可恢复。",
  errorsClearDone: (count: number): string => `已删除 ${count} 条错误记录`,
};

export type UsageStrings = typeof usageZh;

export const usageEn: UsageStrings = {
  title: "Costs & usage",
  today: "Today",
  last7d: "Last 7 days",
  total: "Total",
  tokens: "Tokens",
  requests: "Requests",
  from: "From",
  to: "To",
  colCacheRead: "cache_read",
  colCacheWrite: "cache_write",
  colOutput: "output",
  uncostedNote: "* Only models with configured pricing count toward cost",
  filterAllAgents: "All agents",
  filterAllModels: "All models",
  rangeLabel: "Date range",
  rangeHour: "Last hour",
  rangeDay: "Last 24 hours",
  range7d: "Last 7 days",
  range30d: "Last 30 days",
  range90d: "Last 90 days",
  rangeCustom: "Custom",
  chartRequestsByAgent: "Requests & success rate by agent",
  chartRequestsByModel: "Requests & success rate by model",
  legendSuccessRate: "Success rate",
  chartTokenTrend: "Token trend",
  chartCostTrend: "Cost trend",
  legendOther: (n: number): string => `Other (${n})`,
  bucketTotal: "Total",
  legendHitRate: "Cache hit rate",
  empty: "No usage records",
  errors: "Errors",
  errorsTotal: "Total",
  errorsUnexpected: "Unexpected",
  errorsExpected: "Expected",
  errorsTopCode: "Most common",
  errorsColCode: "Source · code",
  errorsColKind: "Type",
  errorsColMessage: "Message",
  errorsEmpty: "No errors",
  /** Detail-table pager: newer/older step back through pages of the same filtered set. */
  errorsNewer: "Newer",
  errorsOlder: "Older",
  errorsPageOf: (page: number, pages: number, total: number) =>
    `Page ${page} / ${pages} · ${total} total`,
  /** Clearing the table: the action, and the confirm that must name exactly what goes. */
  errorsClear: "Clear",
  errorsClearTitle: "Clear error records",
  errorsClearRangePreset: (preset: "1h" | "1d" | "7d" | "30d" | "90d"): string =>
    ({
      "1h": "in the last hour",
      "1d": "in the last 24 hours",
      "7d": "in the last 7 days",
      "30d": "in the last 30 days",
      "90d": "in the last 90 days",
    })[preset],
  errorsClearRangeCustom: (from: string, to: string): string => `between ${from} and ${to}`,
  errorsClearScope: (count: number, range: string): string =>
    `Deletes this Project's ${count} error record${count === 1 ? "" : "s"} ${range}. Records outside that range are kept.`,
  errorsClearScopeAgent: (count: number, range: string, agentId: string): string =>
    `Deletes this Project's ${count} error record${count === 1 ? "" : "s"} for agent ${agentId} ${range}. Other agents and records outside that range are kept.`,
  errorsClearIrreversible: "This cannot be undone.",
  errorsClearDone: (count: number): string =>
    `Deleted ${count} error record${count === 1 ? "" : "s"}`,
};
