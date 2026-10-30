/**
 * The compiled description: what a call is, once its text has been read.
 *
 * These are the shapes `specs/generate.mjs` writes into `specs/generated/` and the only shapes
 * the two legs see. A type is a small tree; the evaluator in `specs/eval.ts` turns one into a
 * value, so a new call needs no code — only a line of text.
 */

export type TypeDescr =
  | { k: "text" }
  | { k: "string" }
  | { k: "bool" }
  | { k: "id"; pool: string; literal?: string }
  | { k: "int"; min: number; max: number }
  | { k: "int"; values: number[] }
  | { k: "enum"; values: string[] }
  | { k: "array"; of: TypeDescr }
  | { k: "struct"; fields: FieldDescr[] }
  | { k: "union"; variants: FieldDescr[][] };

export interface FieldDescr {
  name: string;
  t: TypeDescr;
  opt?: true;
}

export interface ArgDescr {
  name: string;
  t: TypeDescr;
  opt?: true;
}

/** One HTTP route: `METHOD /path`, its path slots, its query knobs and its body. */
export interface RouteDescr {
  id: string;
  method: string;
  path: string;
  pathArgs: ArgDescr[];
  queryArgs: ArgDescr[];
  body: FieldDescr[] | null;
}

/** One command line: the command path plus the arguments and options the command declares. */
export interface CommandDescr {
  id: string;
  path: string[];
  args: { name: string; t: TypeDescr; required: boolean; variadic: boolean }[];
  options: {
    name: string;
    flags: string;
    t: TypeDescr;
    takesValue: boolean;
    mandatory: boolean;
    never?: true;
  }[];
  textOption: string | null;
  exits: number[];
  /** Options that only mean something drawn together (`cost --from --to`). */
  together: string[][];
}
