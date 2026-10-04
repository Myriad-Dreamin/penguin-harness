/**
 * The `proposal:<n>[#<pattern>]` reference grammar every Markdown surface recognizes (unit tested,
 * no React): parsing a reference, its canonical text, and the hash the proposals page reads its
 * pattern from. Its own file, apart from the page's model (proposals-model.ts), because the chat
 * draws references as links (proposal-links.tsx) with the entry bundle, and the page loads later.
 */

/** A parsed `proposal:<n>[#<pattern>]` reference. */
export interface ProposalRef {
  number: number;
  /** The fragment after `#`: a regular expression over headings and paragraph first lines, whose first capture group labels the link. */
  pattern?: string;
}

/**
 * The reference grammar, as it appears bare in prose: `proposal:` then the number, optionally
 * `#` and a pattern running to the next whitespace. A trailing sentence punctuation mark is not
 * part of the pattern — `see proposal:12.` names #12 — but inside a pattern a dot is a
 * regular-expression dot, so only the last character is given back.
 */
export const PROPOSAL_REF_RE = /proposal:(\d+)(?:#(\S+))?/g;

/** One reference from the whole of `text`, or null when it is not exactly one. */
export function parseProposalRef(text: string): ProposalRef | null {
  const m = /^proposal:(\d+)(?:#(.+))?$/.exec(text.trim());
  if (m === null) return null;
  const number = Number(m[1]);
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  const pattern = m[2] === undefined ? undefined : trimPatternPunctuation(m[2]);
  return pattern === undefined || pattern === "" ? { number } : { number, pattern };
}

/**
 * Sentence punctuation a bare reference at the end of a sentence would otherwise swallow.
 * A closing bracket is only punctuation when nothing inside the pattern opened it: the
 * capture group of `proposal:12#Rename (\w+)` ends in `)` and keeps it.
 */
export function trimPatternPunctuation(pattern: string): string {
  const last = pattern.at(-1);
  if (last === undefined) return pattern;
  if (/[.,;:!?]/.test(last)) return pattern.slice(0, -1);
  const open = last === ")" ? "(" : last === "]" ? "[" : last === "}" ? "{" : null;
  if (open === null) return pattern;
  const opened = pattern.split(open).length - 1;
  const closed = pattern.split(last).length - 1;
  return closed > opened ? pattern.slice(0, -1) : pattern;
}

/** A reference as its canonical text, the value the capsule element carries. */
export function proposalRefText(ref: ProposalRef): string {
  return ref.pattern === undefined
    ? `proposal:${ref.number}`
    : `proposal:${ref.number}#${ref.pattern}`;
}

/** The hash the proposals page reads a pattern from (`#p=<encoded pattern>`), or a plain element id. */
export function proposalHashFor(ref: ProposalRef): string {
  return ref.pattern === undefined ? "" : `#p=${encodeURIComponent(ref.pattern)}`;
}
