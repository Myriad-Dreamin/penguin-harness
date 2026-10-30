/**
 * The spec-driven input layer both legs share.
 *
 * Jazzer.js 4.0.0 has no custom-mutator hook: libFuzzer's `LLVMFuzzerCustomMutator` is a
 * link-time symbol, and the Node addon exposes only `customHooks`. So "mutate by spec" cannot
 * be a mutator plugged into the engine — it has to be the **decoder**: the input stays a byte
 * string libFuzzer knows how to mutate, but every decision the engine flips (a byte) lands on
 * a named argument of a described call (a path parameter, one body field, one argv option),
 * and the value comes from that argument's declared type. A one-byte change therefore changes
 * one argument's value instead of turning a JSON body into garbage the parser rejects.
 *
 * What a call is comes from the description text (`specs/server/http.txt`,
 * `specs/cli/cli.txt`) through `specs/generate.ts`; this module holds only the two things the
 * text does not state — how an input splits into calls, and how a free-text value is shaped.
 *
 * One input is a **sequence of calls**, not a single call (`splitRecords`): "create, then read,
 * then delete" is where state bugs live, and for a coverage-guided fuzzer to find such a
 * sequence its byte-level mutations have to be able to add a call. A separator byte is what
 * makes that possible; a length prefix would not, because the engine cannot recompute a length
 * it broke.
 */

import type { Choices } from "../server/src/choices.js";

/** Which face of a call an input asks for: the valid shape, or the one a handler must refuse. */
export type Variant = "ok" | "bad";

/** The byte between two calls of one input. See `splitRecords`. */
export const RECORD_SEPARATOR = 0x0a;

/**
 * Split one input into the calls it asks for: `record (0x0a record)*`.
 *
 * The separator, not a length prefix, because the mutations that have to mean something on a
 * sequence are libFuzzer's own byte operations:
 *
 *  - inserting a `0x0a` splits one call into two at the place it was inserted, leaving every
 *    earlier call untouched — a new call appears out of nothing;
 *  - erasing bytes across a separator drops a call; copying a range copies whole calls, so a
 *    crossover between two inputs is a splice of two sequences;
 *  - changing a record's first byte changes which endpoint or command that call is.
 *
 * A length prefix breaks all four: one changed length byte hands the rest of the input to the
 * wrong call, and the engine has no way to recompute it. A record's own decisions come from its
 * own payload, so inserting or deleting a call never shifts what the other calls mean.
 *
 * Empty records are dropped: a trailing or doubled newline is not a call.
 */
export function splitRecords(data: Buffer): Buffer[] {
  const records: Buffer[] = [];
  let start = 0;
  for (;;) {
    const end = data.indexOf(RECORD_SEPARATOR, start);
    if (end === -1) {
      if (start < data.length) records.push(data.subarray(start));
      return records;
    }
    if (end > start) records.push(data.subarray(start, end));
    start = end + 1;
  }
}

/** Identifiers the run has seen, by the resource name the description gives them. */
export type Pools = Record<string, string[]>;

/**
 * Values a handler has to survive: empty, traversal, a 65-char id (the contract's own limit is
 * 64), a NUL, a multi-byte character, a very long string. Drawn on purpose rather than reached
 * by luck.
 */
export const HOSTILE: readonly string[] = [
  "",
  "..",
  "../../etc/passwd",
  "%2e%2e%2f",
  "\u0000",
  "😀",
  "x".repeat(300),
];

/** A free-text value: the input's own payload, sometimes with a boundary shape around it. */
export function textValue(choices: Choices, text: string): string {
  if (text === "") return "";
  if (choices.chance(1 / 6)) return choices.pick(HOSTILE);
  if (choices.chance(0.2)) return `${text}${choices.pick([" ", "/", "\n", "\\", "'", '"'])}`;
  if (choices.chance(0.2)) return text.slice(0, choices.int(0, text.length));
  return text;
}

/**
 * Pool every id the response carries, by the resource name it carries it under. One rule
 * instead of a per-endpoint capture function: whatever a call answers with becomes input for
 * the next call, and a new endpoint needs no code here — only a `resource` line in the
 * description when it serves an id nothing else has named yet.
 */
export function captureIds(value: unknown, pools: Pools, resources: ReadonlySet<string>): void {
  const seen = new Set<unknown>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    for (const [key, item] of Object.entries(node as Record<string, unknown>)) {
      if (typeof item === "string" && resources.has(key) && item.length > 0 && item.length <= 128) {
        const pool = (pools[key] ??= []);
        if (!pool.includes(item) && pool.length < 64) pool.push(item);
      } else {
        visit(item);
      }
    }
  };
  visit(value);
}
