/**
 * The semantic-id module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `semanticId` section. A new string is added here, to both fragments, and
 * nowhere else — `SemanticIdStrings` makes a key missing from `semanticIdEn` a type error.
 */
export const semanticIdZh = {
  /**
   * The id field's generate button — its label says who proposes the id, its tooltip says
   * what the proposal is derived from — and the clause the hint appends for it. The clause
   * carries its own leading separator: what joins two clauses is punctuation, and
   * punctuation belongs to the language.
   */
  generateIdLabel: "用 AI 生成",
  generateId: "从名称生成 ID",
  idGenerateHint: "；也可以从显示名生成",
  /** What the field says about the id a proposal just filled in (see id-suggest-notice.ts). */
  idSuggest: {
    /** Under an id transliterated from the name: quiet, because nothing went wrong. */
    fromName: "按名称转写生成",
    /** Under a placeholder id: it names nothing, so it says why and asks for a real name. */
    placeholder: (reason: string): string =>
      `模型没有给出可用的 ID（${reason}），已填入占位 ID，请改成有含义的英文名`,
    /** Why the proposal fell through, keyed by the server's reason code. */
    reasons: {
      no_default_model: "未配置默认模型",
      model_failed: "模型调用失败",
      unusable_answer: "模型回答不可用",
      no_ascii: "名称里没有可转写的英文",
    },
    /** A reason a newer server named and this build does not know. */
    reasonUnknown: "原因未知",
  },
};

export type SemanticIdStrings = typeof semanticIdZh;

export const semanticIdEn: SemanticIdStrings = {
  /**
   * The id field's generate button — its label says who proposes the id, its tooltip says
   * what the proposal is derived from — and the clause the hint appends for it. The clause
   * carries its own leading separator: what joins two clauses is punctuation, and
   * punctuation belongs to the language.
   */
  generateIdLabel: "Generate with AI",
  generateId: "Generate an id from the name",
  idGenerateHint: "; you can also generate one from the display name",
  /** What the field says about the id a proposal just filled in (see id-suggest-notice.ts). */
  idSuggest: {
    /** Under an id transliterated from the name: quiet, because nothing went wrong. */
    fromName: "Transliterated from the name",
    /** Under a placeholder id: it names nothing, so it says why and asks for a real name. */
    placeholder: (reason: string): string =>
      `The model gave no usable id (${reason}); a placeholder was filled in — please change it to something meaningful`,
    /** Why the proposal fell through, keyed by the server's reason code. */
    reasons: {
      no_default_model: "no default model configured",
      model_failed: "the model request failed",
      unusable_answer: "the model's answer was unusable",
      no_ascii: "the name carries no ASCII to transliterate",
    },
    /** A reason a newer server named and this build does not know. */
    reasonUnknown: "reason unknown",
  },
};
