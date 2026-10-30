/**
 * The description language: parse, check, compile.
 *
 * The fuzzer's surface is written down, not built. Each leg has a text file of calls —
 * `GET /api/projects/:projectId/agents(projectId projectId, limit int32[1:1000] opt)` — and a
 * list of the calls it deliberately does not drive. Everything the runtime knows about a call
 * (its path, the type of every argument, which argument may be left out) comes from that text;
 * no value is chosen by looking at an argument's name at run time.
 *
 * The shape follows syzkaller's syscall descriptions: named types, structs, unions, resources,
 * and one line per call. Two things differ, because the unit is an HTTP request or a command
 * line rather than a syscall:
 *
 *  - a call is named by the surface itself — `GET /api/…` for the server, the dotted command
 *    path for the CLI — so the description and the product name the same thing;
 *  - the call list is not hand-kept. penguin publishes its routes and its commander tree, so
 *    `specs/draft.mjs` prints a line for anything the text lacks, and `--check` fails when the
 *    two disagree. The text remains the source of truth; drafting is a step, not a generator.
 */

export type TypeExpr =
  | { k: "text" }
  | { k: "string" }
  | { k: "bool" }
  | { k: "id"; pool: string; literal?: string }
  | { k: "int"; min: number; max: number }
  | { k: "int"; values: number[] }
  | { k: "enum"; values: string[] }
  | { k: "array"; of: TypeExpr }
  | { k: "struct"; fields: Field[] }
  | { k: "union"; variants: Field[][] };

/** A type as written: resolved inline already, or a name `compile` looks up. */
type Raw = { named: string } | { k: "array"; of: Raw } | Exclude<TypeExpr, { k: "array" }>;

export interface Field {
  name: string;
  t: TypeExpr;
  opt?: true;
}

export interface RawArg {
  /** The argument's name, or an option's long flag (`--message`). */
  name: string;
  /** An option's spelling as written (`-m|--message`), when it differs from `name`. */
  flags?: string;
  raw: Raw;
  opt?: true;
  /** Declared but never drawn: the leg owns this value (`--root`, `--server`). */
  never?: true;
  option?: true;
}

interface RawField {
  name: string;
  raw: Raw;
  opt?: true;
  never?: true;
}

export interface ServerCall {
  leg: "server";
  method: string;
  path: string;
  id: string;
  pathArgs: { name: string; t: TypeExpr; opt?: true }[];
  queryArgs: { name: string; t: TypeExpr; opt?: true }[];
  /** The body's fields, when the route takes one; the body is one JSON object. */
  body: Field[] | null;
}

export interface CliCall {
  leg: "cli";
  id: string;
  path: string[];
  args: { name: string; t: TypeExpr; required: boolean; variadic: boolean }[];
  options: {
    name: string;
    flags: string;
    t: TypeExpr;
    takesValue: boolean;
    mandatory: boolean;
    never?: true;
  }[];
  textOption: string | null;
  exits: number[];
  together: string[][];
}

interface RawServerCall {
  method: string;
  path: string;
  id: string;
  pathArgs: RawArg[];
  queryArgs: RawArg[];
  body: RawArg | null;
}

interface RawCliCall {
  id: string;
  path: string[];
  args: RawArg[];
  options: RawArg[];
  exits: number[];
  together: string[][];
}

export interface RawProgram {
  resources: Map<string, string | undefined>;
  types: Map<string, Raw>;
  structs: Map<string, RawField[]>;
  unions: Map<string, string[]>;
  server: RawServerCall[];
  cli: RawCliCall[];
  skips: Skip[];
}

export interface Program {
  resources: Map<string, string | undefined>;
  types: Map<string, TypeExpr>;
  structs: Map<string, Field[]>;
  unions: Map<string, string[]>;
  server: ServerCall[];
  cli: CliCall[];
  skips: Skip[];
}

export interface Skip {
  id: string;
  leg: "server" | "cli";
}

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ALL"]);

export class ParseError extends Error {}

/** Strip a `#` comment that is not inside a quoted string. */
function stripComment(line: string): string {
  let quote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quote = !quote;
    else if (ch === "#" && !quote) return line.slice(0, i);
  }
  return line;
}

/** Split on `sep` at bracket depth 0, respecting quotes. */
function splitTop(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quote = !quote;
    else if (!quote && (ch === "[" || ch === "(")) depth++;
    else if (!quote && (ch === "]" || ch === ")")) depth--;
    else if (!quote && depth === 0 && ch === sep) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** `int32[1:1000]`, `enum["a", "b"]`, `array[string]`, `projectId`. */
function parseExpr(text: string, where: string): Raw {
  const open = text.indexOf("[");
  if (open === -1) {
    const name = text.trim();
    if (name === "text") return { k: "text" };
    if (name === "string") return { k: "string" };
    if (name === "bool") return { k: "bool" };
    if (name === "id") return { k: "id", pool: "" };
    if (!/^\w+$/.test(name)) throw new ParseError(`${where}: not a type: ${name}`);
    return { named: name };
  }
  if (!text.trimEnd().endsWith("]")) throw new ParseError(`${where}: unclosed type brackets in ${text}`);
  const name = text.slice(0, open).trim();
  const inner = text.slice(open + 1, text.lastIndexOf("]"));
  switch (name) {
    case "int32": {
      const parts = splitTop(inner, ",").map((part) => part.trim());
      if (parts.every((part) => /^-?\d+$/.test(part))) return { k: "int", values: parts.map(Number) };
      const bounds = splitTop(parts[0] ?? "", ":");
      if (parts.length === 1 && bounds.length === 2) {
        return { k: "int", min: Number(bounds[0]), max: Number(bounds[1]) };
      }
      throw new ParseError(`${where}: bad int32[...] ${inner}`);
    }
    case "enum": {
      const values = splitTop(inner, ",").map((part) => part.trim());
      if (!values.every((value) => value.startsWith('"') && value.endsWith('"'))) {
        throw new ParseError(`${where}: enum values must be quoted strings: ${inner}`);
      }
      return { k: "enum", values: values.map((value) => value.slice(1, -1)) };
    }
    case "array":
      return { k: "array", of: parseExpr(inner, where) };
    default:
      throw new ParseError(`${where}: ${name} takes no type options`);
  }
}

function parseField(text: string, where: string): RawField {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) throw new ParseError(`${where}: a field is \`name type\``);
  const last = parts[parts.length - 1];
  const opt = last === "opt";
  const never = last === "never";
  return {
    name: parts[0]!,
    raw: parseExpr(parts.slice(1, opt || never ? -1 : undefined).join(" "), where),
    ...(opt ? { opt: true as const } : {}),
    ...(never ? { never: true as const } : {}),
  };
}

function parseArg(text: string, where: string): RawArg {
  const field = parseField(text, where);
  const long = field.name.startsWith("-")
    ? (field.name.split("|").find((part) => part.startsWith("--")) ?? field.name.split("|")[0]!)
    : field.name;
  return {
    name: long,
    ...(long === field.name ? {} : { flags: field.name }),
    raw: field.raw,
    ...(field.opt === true ? { opt: true as const } : {}),
    ...(field.never === true ? { never: true as const } : {}),
    ...(field.name.startsWith("-") ? { option: true as const } : {}),
  };
}

/**
 * A command path: one or more dotted segments, each `[a-z0-9][a-z0-9_-]*`. The leaf may carry
 * hyphens (`server.reset-admin-password`), and a one-word command is a leaf (`run`).
 */
const CLI_ID = /^[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9][a-z0-9_-]*)*$/;

function parseSkip(text: string, where: string): Skip {
  const m = /^([A-Z]+)\s+(\/\S*)$/.exec(text);
  if (m) return { id: `${m[1]} ${m[2]}`, leg: "server" };
  if (CLI_ID.test(text)) return { id: text.split(".").join(" "), leg: "cli" };
  throw new ParseError(`${where}: not a skip line: ${text}`);
}

function parseCall(program: RawProgram, raw: string, where: string): void {
  const open = raw.indexOf("(");
  const close = raw.lastIndexOf(")");
  if (open === -1 || close < open) throw new ParseError(`${where}: a call needs \`name(args)\``);
  const head = raw.slice(0, open).trim();
  const argsText = raw.slice(open + 1, close).trim();
  const trailer = raw.slice(close + 1).trim();
  const argTexts = argsText === "" ? [] : splitTop(argsText, ",").map((arg) => arg.trim());

  const serverMatch = /^([A-Z]+)\s+(\/\S*)$/.exec(head);
  if (serverMatch) {
    const method = serverMatch[1]!;
    if (!METHODS.has(method)) throw new ParseError(`${where}: unknown method ${method}`);
    const path = serverMatch[2]!;
    const slots = [...path.matchAll(/:([A-Za-z]+)(?:\{[^}]*\})?/g)].map((m) => m[1]!);
    const pathArgs: RawArg[] = [];
    const queryArgs: RawArg[] = [];
    let body: RawArg | null = null;
    for (const argText of argTexts) {
      const forcedQuery = argText.startsWith("?");
      const arg = parseArg(forcedQuery ? argText.slice(1) : argText, where);
      if (arg.name === "body" && !forcedQuery) {
        if (body !== null) throw new ParseError(`${where}: two body arguments`);
        body = arg;
      } else if (slots.includes(arg.name) && !forcedQuery) pathArgs.push(arg);
      else queryArgs.push(arg);
    }
    const missing = slots.filter((slot) => !pathArgs.some((arg) => arg.name === slot));
    if (missing.length > 0) throw new ParseError(`${where}: path slots without an argument: ${missing.join(", ")}`);
    if (trailer !== "" && !/^auth\s+\S+$/.test(trailer)) {
      throw new ParseError(`${where}: bad trailer: ${trailer}`);
    }
    program.server.push({ method, path, id: `${method} ${path}`, pathArgs, queryArgs, body });
    return;
  }

  if (!CLI_ID.test(head)) throw new ParseError(`${where}: not a call: ${head}`);
  const args: RawArg[] = [];
  const options: RawArg[] = [];
  for (const argText of argTexts) {
    const arg = parseArg(argText, where);
    (arg.option === true ? options : args).push(arg);
  }
  let exits: number[] = [0, 1];
  const together: string[][] = [];
  let rest = trailer;
  // `exits 0` and `together --a,--b` are independent clauses; a line may state either, both
  // (in that order) or neither.
  const exitsMatch = /^exits\s+([\d,\s]+)(?:\s+(.*))?$/.exec(rest);
  if (exitsMatch) {
    exits = exitsMatch[1]!.split(",").map((part) => Number(part.trim()));
    rest = (exitsMatch[2] ?? "").trim();
  }
  if (rest !== "") {
    const togetherMatch = /^together\s+([\w,|\-]+)$/.exec(rest);
    if (!togetherMatch) throw new ParseError(`${where}: bad trailer: ${rest}`);
    together.push(togetherMatch[1]!.split(",").map((part) => part.trim()));
  }
  program.cli.push({ id: head.split(".").join(" "), path: head.split("."), args, options, exits, together });
}

/** Parse one description text whose `include`s the caller has already expanded. */
export function parseFile(text: string, file: string): RawProgram {
  const program: RawProgram = {
    resources: new Map(),
    types: new Map(),
    structs: new Map(),
    unions: new Map(),
    server: [],
    cli: [],
    skips: [],
  };
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = stripComment(lines[i]!).trim();
    if (raw === "") continue;
    const where = `${file}:${i + 1}`;
    let m: RegExpMatchArray | null;

    if ((m = /^include\s+"[^"]+"$/.exec(raw))) {
      throw new ParseError(`${where}: the caller must expand includes before parsing`);
    }
    if ((m = /^resource\s+(\w+)\s+string(?:\s*:\s*"([^"]*)")?$/.exec(raw))) {
      if (program.resources.has(m[1]!) || program.types.has(m[1]!) || program.structs.has(m[1]!)) {
        throw new ParseError(`${where}: duplicate type ${m[1]}`);
      }
      program.resources.set(m[1]!, m[2]);
      continue;
    }
    if ((m = /^type\s+(\w+)\s+(.+)$/.exec(raw))) {
      if (program.resources.has(m[1]!) || program.types.has(m[1]!) || program.structs.has(m[1]!)) {
        throw new ParseError(`${where}: duplicate type ${m[1]}`);
      }
      program.types.set(m[1]!, parseExpr(m[2]!, where));
      continue;
    }
    if ((m = /^struct\s+(\w+)\s*\{$/.exec(raw))) {
      const fields: RawField[] = [];
      let closed = false;
      for (i++; i < lines.length; i++) {
        const body = stripComment(lines[i]!).trim();
        if (body === "}") {
          closed = true;
          break;
        }
        if (body !== "") fields.push(parseField(body, `${file}:${i + 1}`));
      }
      if (!closed) throw new ParseError(`${file}: unterminated struct ${m[1]}`);
      program.structs.set(m[1]!, fields);
      continue;
    }
    if ((m = /^union\s+(\w+)\s*\{$/.exec(raw))) {
      const members: string[] = [];
      let closed = false;
      for (i++; i < lines.length; i++) {
        const body = stripComment(lines[i]!).trim();
        if (body === "}") {
          closed = true;
          break;
        }
        if (body !== "") members.push(body);
      }
      if (!closed) throw new ParseError(`${file}: unterminated union ${m[1]}`);
      program.unions.set(m[1]!, members);
      continue;
    }
    if ((m = /^skip\s+(.+)$/.exec(raw))) {
      program.skips.push(parseSkip(m[1]!.trim(), where));
      continue;
    }
    parseCall(program, raw, where);
  }
  return program;
}

/** Resolve every name to a type, fill generic `id` pools, and check the call set. */
export function compile(rawProgram: RawProgram): Program {
  const resolve = (expr: Raw, where: string, useName?: string): TypeExpr => {
    if ("named" in expr) {
      const name = expr.named;
      const literal = rawProgram.resources.get(name);
      if (rawProgram.resources.has(name)) {
        return { k: "id", pool: name, ...(literal === undefined ? {} : { literal }) };
      }
      const alias = rawProgram.types.get(name);
      if (alias !== undefined) return resolve(alias, where, useName);
      const fields = rawProgram.structs.get(name);
      if (fields !== undefined) {
        return { k: "struct", fields: fields.map((field) => resolveField(field, where)) };
      }
      const members = rawProgram.unions.get(name);
      if (members !== undefined) {
        return {
          k: "union",
          variants: members.map((member) => {
            const memberFields = rawProgram.structs.get(member);
            if (memberFields === undefined) throw new ParseError(`${where}: union member ${member} is not a struct`);
            return memberFields.map((field) => resolveField(field, where));
          }),
        };
      }
      throw new ParseError(`${where}: unknown type ${name}`);
    }
    if (expr.k === "id" && expr.pool === "") {
      if (useName === undefined) throw new ParseError(`${where}: a bare id needs an argument name`);
      return { k: "id", pool: useName };
    }
    if (expr.k === "array") return { k: "array", of: resolve(expr.of, where, useName) };
    return expr;
  };

  const resolveField = (field: RawField, where: string): Field => ({
    name: field.name,
    t: resolve(field.raw, where, field.name),
    ...(field.opt === true ? { opt: true as const } : {}),
  });

  const program: Program = {
    resources: rawProgram.resources,
    types: new Map([...rawProgram.types].map(([name, expr]) => [name, resolve(expr, `type ${name}`)])),
    structs: new Map(
      [...rawProgram.structs].map(([name, fields]) => [name, fields.map((field) => resolveField(field, `struct ${name}`))]),
    ),
    unions: rawProgram.unions,
    server: [],
    cli: [],
    skips: rawProgram.skips,
  };

  for (const call of rawProgram.server) {
    const pathArgs = call.pathArgs.map((arg) => ({
      name: arg.name,
      t: resolve(arg.raw, call.id, arg.name),
      ...(arg.opt === true ? { opt: true as const } : {}),
    }));
    const queryArgs = call.queryArgs.map((arg) => ({
      name: arg.name,
      t: resolve(arg.raw, call.id, arg.name),
      ...(arg.opt === true ? { opt: true as const } : {}),
    }));
    let body: Field[] | null = null;
    if (call.body !== null) {
      const t = resolve(call.body.raw, call.id, "body");
      if (t.k !== "struct") throw new ParseError(`${call.id}: a body must be a struct`);
      body = t.fields;
    }
    program.server.push({
      leg: "server",
      method: call.method,
      path: call.path,
      id: call.id,
      pathArgs,
      queryArgs,
      body,
    });
  }

  for (const call of rawProgram.cli) {
    const args = call.args.map((arg) => {
      const t = resolve(arg.raw, call.id, arg.name);
      return { name: arg.name, t, required: arg.opt !== true, variadic: t.k === "array" };
    });
    const options = call.options.map((option) => {
      const t = resolve(option.raw, call.id, option.name);
      return {
        name: option.name,
        flags: option.flags ?? option.name,
        t,
        takesValue: t.k !== "bool",
        mandatory: option.never === true ? false : option.opt !== true,
        ...(option.never === true ? { never: true as const } : {}),
      };
    });
    program.cli.push({
      leg: "cli",
      id: call.id,
      path: call.path,
      args,
      options,
      textOption: options.find((option) => option.t.k === "text")?.name ?? null,
      exits: call.exits,
      together: call.together,
    });
  }

  const ids = new Set<string>();
  for (const call of [...program.server, ...program.cli]) {
    if (ids.has(call.id)) throw new ParseError(`duplicate call ${call.id}`);
    ids.add(call.id);
  }
  for (const skip of program.skips) {
    if (ids.has(skip.id)) throw new ParseError(`${skip.id} is both described and skipped`);
  }
  return program;
}
