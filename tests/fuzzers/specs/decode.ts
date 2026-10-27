/**
 * The spec-driven input layer both legs share.
 *
 * Jazzer.js 4.0.0 has no custom-mutator hook: libFuzzer's `LLVMFuzzerCustomMutator` is a
 * link-time symbol, and the Node addon exposes only `customHooks`. So "mutate by spec" cannot
 * be a mutator plugged into the engine — it has to be the **decoder**: the input stays a byte
 * string libFuzzer knows how to mutate, but every decision the engine flips (a byte) lands on
 * a named slot of a spec (a path parameter, one body field, one argv option), and the value
 * comes from that slot's own type. A one-byte change therefore changes one field's value
 * instead of turning a JSON body into garbage the parser rejects.
 *
 * The spec side is metadata, not a table in the fuzzer: `specs/surface.json` is generated from
 * penguin's own declarations (see `specs/extract.mjs`) — the platform's `HttpModule.routes`
 * contributions plus each route factory's `app.<method>("…")` calls for the server, and the
 * commander tree for the CLI.
 *
 * One input is a **sequence of calls**, not a single call (`splitRecords`): "create, then read,
 * then delete" is where state bugs live, and for a coverage-guided fuzzer to find such a
 * sequence its byte-level mutations have to be able to add a call. A separator byte is what
 * makes that possible; a length prefix would not, because the engine cannot recompute a length
 * it broke.
 */
import type { Choices } from "../server/src/choices.js";

/** Which face of a spec an input asks for: the valid shape, or the one a handler must refuse. */
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

/** Identifiers the server already knows, by the name the contract gives them. */
export type Pools = Record<string, string[]>;

/** Field names that are ids: their value shape is chosen by the pool, not by free text. */
const ID_NAMES = new Set([
  "projectId",
  "agentId",
  "sessionId",
  "ticketId",
  "orgId",
  "ownerUserId",
  "userId",
  "benchmarkId",
  "caseId",
  "scheduleId",
  "toolCallId",
  "tabId",
  "keyId",
  "tokenId",
  "channelId",
  "messageId",
  "fileId",
  "skillId",
  "pluginId",
  "serverId",
  "machineId",
  "name",
]);

/** ids whose "valid" value the harness knows before any capture has happened. */
const LITERALS: Record<string, string> = {
  projectId: "default_project",
  agentId: "default_agent",
  ownerUserId: "admin",
  userId: "admin",
  channelId: "default_channel",
  scheduleId: "fuzz_sched",
};

/**
 * Values a handler has to survive: empty, traversal, a 65-char id (the contract's own limit
 * is 64), a NUL, a multi-byte character, a very long string. Drawn on purpose rather than
 * reached by luck.
 */
const HOSTILE = ["", "..", "../../etc/passwd", "%2e%2e%2f", "\u0000", "😀", "x".repeat(300)];

export function isIdName(name: string): boolean {
  return ID_NAMES.has(name);
}

/**
 * An id the contract has to accept: one the run has seen, else the declaration's own literal.
 * The `ok` variant draws only from here — a command line the CLI is allowed to refuse is not an
 * `ok` line, and an empty id would make `config vault list` (exit 0 only) look like a finding.
 */
export function validIdValue(name: string, choices: Choices, pools: Pools): string {
  const pool = pools[name] ?? [];
  if (pool.length > 0 && choices.chance(0.75)) return choices.pick(pool);
  const literal = LITERALS[name];
  if (literal !== undefined) return literal;
  return `fuzz-${name}-${choices.int(0, 99)}`;
}

/** An id-shaped value: usually one the handler accepts, one in eight a value it must reject. */
export function idValue(name: string, choices: Choices, pools: Pools, hostile = false): string {
  // One in eight draws a value the handler must reject — the error path is as interesting as
  // the happy one, and libFuzzer cannot reach a NUL by mutating an ASCII id.
  if (hostile || choices.chance(1 / 8)) return choices.pick(HOSTILE);
  return validIdValue(name, choices, pools);
}

/** A free-text value: the input's own payload, sometimes with a boundary shape around it. */
export function textValue(name: string, choices: Choices, text: string): string {
  if (text === "") return "";
  if (choices.chance(1 / 6)) return choices.pick(HOSTILE);
  if (choices.chance(0.2)) return `${text}${choices.pick([" ", "/", "\n", "\\", "'", '"'])}`;
  if (choices.chance(0.2)) return text.slice(0, choices.int(0, text.length));
  return name === "" ? text : text;
}

export type FieldKind = "string" | "number" | "boolean" | "enum" | "array" | "object";

/**
 * One field (or one array element, or one union variant) of a request body, as the declaration
 * states it. `fields` is what makes a nested body reachable at all: `input: TaskInputPart[]`
 * is only a usable slot if the element's own members came along.
 */
export interface FieldSpec {
  name: string;
  kind: FieldKind;
  /** enum: the string literals the declaration allows. */
  values?: string[];
  /** object: the declared members; an array of objects: the element's members. */
  fields?: FieldSpec[];
  /** a discriminated union: one of these member lists is drawn. */
  variants?: FieldSpec[][];
  optional?: boolean;
}

/**
 * A value the declared type forbids: what a handler's own validator exists to reject. Chosen
 * by kind, so a "bad" draw lands on the type check for that field instead of on random JSON.
 */
function wrongOf(field: FieldSpec, choices: Choices): unknown {
  switch (field.kind) {
    case "string":
      return choices.pick([0, -1, true, null, [], {}]);
    case "number":
      return choices.pick(["not-a-number", "", null, true, []]);
    case "boolean":
      return choices.pick(["yes", 0, null, {}]);
    case "enum":
      return choices.pick(["not-in-the-declared-set", 0, null]);
    case "array":
      return choices.pick([{}, "not-an-array", 0, null]);
    case "object":
      return choices.pick([0, "not-an-object", [], null]);
  }
}

/** One object from the nearest member list: a union variant when there is one. */
function objectFrom(
  field: FieldSpec,
  choices: Choices,
  text: string,
  pools: Pools,
): Record<string, unknown> {
  const variants = field.variants;
  const members =
    variants !== undefined && variants.length > 0 ? choices.pick(variants) : (field.fields ?? []);
  return objectOf(members, "ok", choices, text, pools);
}

/** One field's value, by the type the contract declares for it. */
export function scalarOf(
  field: FieldSpec,
  variant: Variant,
  choices: Choices,
  text: string,
  pools: Pools,
): unknown {
  if (variant === "bad") return wrongOf(field, choices);
  switch (field.kind) {
    case "number":
      return choices.chance(0.2)
        ? choices.pick([0, -1, 2 ** 31, 1e9, -0])
        : choices.int(0, 1000);
    case "boolean":
      return choices.chance(0.5);
    case "enum":
      return choices.pick(field.values === undefined || field.values.length === 0 ? ["x"] : field.values);
    case "object":
      return objectFrom(field, choices, text, pools);
    case "array":
      if (choices.chance(0.35)) return [];
      // A declared element shape is what puts a real message/attachment inside the list.
      if (field.variants !== undefined || field.fields !== undefined) {
        return [objectFrom(field, choices, text, pools)];
      }
      return [textValue(field.name, choices, text)];
    default:
      return isIdName(field.name)
        ? idValue(field.name, choices, pools)
        : textValue(field.name, choices, text);
  }
}

/** A body from the DTO's own field list: optional fields are skipped sometimes. */
export function objectOf(
  fields: readonly FieldSpec[],
  variant: Variant,
  choices: Choices,
  text: string,
  pools: Pools,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.optional === true && choices.chance(0.4)) continue;
    body[field.name] = scalarOf(field, variant, choices, text, pools);
  }
  return body;
}

/**
 * Pool every id the response carries, by the key it carries it under. One rule instead of a
 * per-endpoint capture function: whatever a route answers with becomes input for the next
 * call, and a new endpoint needs no code here.
 */
export function captureIds(value: unknown, pools: Pools): void {
  const seen = new Set<unknown>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    for (const [key, item] of Object.entries(node as Record<string, unknown>)) {
      if (typeof item === "string" && isIdName(key) && item.length > 0 && item.length <= 128) {
        const pool = (pools[key] ??= []);
        if (!pool.includes(item) && pool.length < 64) pool.push(item);
      } else {
        visit(item);
      }
    }
  };
  visit(value);
}
