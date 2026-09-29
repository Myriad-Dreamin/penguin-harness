/**
 * The ai-create module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `aiCreate` section. A new string is added here, to both fragments, and
 * nowhere else — `AiCreateStrings` makes a key missing from `aiCreateEn` a type error.
 */
export const aiCreateZh = {
  withAi: "用 AI 创建",
  manual: "手动创建",
  editInChat: "在新对话中编辑",
  copyPrompt: "复制提示词",
  examplesTitle: "试试这些示例",
  fullPrompt: "完整提示词",
  /** Who does the work, and where: the panel's lead line. */
  byAgent: (name: string): string => `将由「${name}」在新对话中完成`,
  chooseAgent: "执行的智能体",
  placeholder: "描述你想要什么，越具体越好",
  /** Accessible name of the prompt box (it has no visible label). */
  promptLabel: "提示词",
  noAgent: "当前 Project 还没有智能体",
};

export type AiCreateStrings = typeof aiCreateZh;

export const aiCreateEn: AiCreateStrings = {
  withAi: "Create with AI",
  manual: "Create manually",
  editInChat: "Edit in a new conversation",
  copyPrompt: "Copy prompt",
  examplesTitle: "Try an example",
  fullPrompt: "Full prompt",
  /** Who does the work, and where: the panel's lead line. */
  byAgent: (name: string): string => `Done by ${name} in a new conversation`,
  chooseAgent: "Agent that does the work",
  placeholder: "Describe what you want — the more specific, the better",
  /** Accessible name of the prompt box (it has no visible label). */
  promptLabel: "Prompt",
  noAgent: "This Project has no agent yet",
};
