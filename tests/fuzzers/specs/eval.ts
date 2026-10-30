/**
 * The evaluator: one declared type, one value.
 *
 * Everything a call's argument can be is decided here, from the type the description gives it —
 * never from the argument's name. An `id` draws from the pool the run has collected (or the
 * literal the resource declares); an `int32[1:1000]` draws inside its range; an `enum` draws one
 * of its own strings; `text` and `string` carry the input's own bytes. The `bad` face draws the
 * value the declared type forbids, which is the value a handler's validator exists to reject.
 *
 * This is the same division syzkaller makes: the description says what a valid call looks like,
 * the program generator only has to fill the leaves.
 */
import type { Choices } from "../server/src/choices.js";
import { HOSTILE, textValue, type Pools, type Variant } from "./decode.js";
import type { FieldDescr, TypeDescr } from "./types.js";

/** Values the declared type forbids, by kind: what a validator exists to reject. */
function wrongOf(t: TypeDescr, choices: Choices): unknown {
  switch (t.k) {
    case "bool":
      return choices.pick(["yes", 0, null, {}]);
    case "int":
      return choices.pick(["abc", "-1", "999999999999999999999", "0.5", ""]);
    case "enum":
      return choices.pick(["not-in-the-set", "", "0"]);
    case "array":
      return choices.pick([{}, "not-an-array", 0, null]);
    case "struct":
    case "union":
      return choices.pick([0, "not-an-object", [], null]);
    case "id":
      return choices.pick(HOSTILE);
    default:
      return choices.pick([0, -1, true, null, [], {}]);
  }
}

/** An integer inside the declared range or set. */
function intOf(t: { min: number; max: number } | { values: number[] }, choices: Choices): number {
  if ("values" in t) return choices.pick(t.values);
  return choices.int(t.min, t.max);
}

/**
 * An id: usually one the run has collected for this resource, else the resource's own literal,
 * else a value shaped like one. Every `bad` draw is a value the handler must reject — the error
 * path is as interesting as the happy one, and libFuzzer cannot reach a NUL by mutating an
 * ASCII id. An `ok` draw stays valid: a refusal there would spend the call that reaches the
 * deep path, which is what the `ok` face is for.
 */
function idOf(
  t: { pool: string; literal?: string },
  variant: Variant,
  choices: Choices,
  pools: Pools,
): string {
  if (variant === "bad") return choices.pick(HOSTILE);
  const pool = pools[t.pool] ?? [];
  if (pool.length > 0 && choices.chance(0.75)) return choices.pick(pool);
  return t.literal ?? `fuzz-${t.pool}-${choices.int(0, 99)}`;
}

/** One value of the declared type. */
export function valueOf(
  t: TypeDescr,
  variant: Variant,
  choices: Choices,
  text: string,
  pools: Pools,
): unknown {
  if (variant === "bad" && t.k !== "text" && t.k !== "string") return wrongOf(t, choices);
  switch (t.k) {
    case "text":
    case "string":
      return textValue(choices, text);
    case "bool":
      return choices.chance(0.5);
    case "int":
      return intOf(t, choices);
    case "enum":
      return choices.pick(t.values);
    case "id":
      return idOf(t, variant, choices, pools);
    case "array":
      return choices.chance(0.35) ? [] : [valueOf(t.of, variant, choices, text, pools)];
    case "struct":
      return objectOf(t.fields, variant, choices, text, pools);
    case "union":
      return objectOf(choices.pick(t.variants), variant, choices, text, pools);
  }
}

/** One object from a declared field list; an optional field is left out sometimes. */
export function objectOf(
  fields: readonly FieldDescr[],
  variant: Variant,
  choices: Choices,
  text: string,
  pools: Pools,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.opt === true && choices.chance(0.4)) continue;
    body[field.name] = valueOf(field.t, variant, choices, text, pools);
  }
  return body;
}

/** A value as it is written in a URL or on a command line. */
export function stringOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}
