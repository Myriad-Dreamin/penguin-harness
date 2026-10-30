/**
 * The CLI leg's calls, read from `specs/cli/cli.txt`.
 *
 * Each line names a command path, the arguments and options the command declares, the type of
 * each value, and the exit codes a well-formed line may produce. A command that is not
 * described is not run; `specs/generate.ts --check` fails when the text and the commander tree
 * disagree, and `--draft` prints a line for a command the text lacks.
 *
 * Two calls the tree cannot name — the bare program and an unknown command — are added below.
 * They are the CLI's own grammar, not commands, and both have broken before.
 */
import type { Choices } from "../../server/src/choices.js";
import { captureIds, type Pools, type Variant } from "../decode.js";
import { stringOf, valueOf } from "../eval.js";
import { COMMANDS } from "../generated/cli.js";
import { RESOURCES } from "../generated/resources.js";
import type { CommandDescr, TypeDescr } from "../types.js";

export interface CliArgSpec {
  name: string;
  required: boolean;
  variadic: boolean;
  t: TypeDescr;
}

export interface CliOptionSpec {
  /** The first long form, `--message`; a lone short flag keeps its own spelling. */
  name: string;
  flags: string;
  takesValue: boolean;
  mandatory: boolean;
  t: TypeDescr;
  /** Declared, never drawn: the leg owns the value (`--root`, `--server`, `--workspace`). */
  never?: true;
}

export interface CliSpec {
  id: string;
  path: string[];
  args: CliArgSpec[];
  options: CliOptionSpec[];
  /** The option the input's text lands in (`-m` / `--prompt` / `--title`), when there is one. */
  textOption: string | null;
  exits: number[];
  argv(variant: Variant, choices: Choices, text: string, pools: Pools): string[];
}

/**
 * The exit codes one call may produce. `exits` is the contract for a well-formed command line;
 * a deliberately damaged one is a usage error, and commander's usage errors are exit 1 — that
 * IS the CLI working, so a refusal is in bounds for the bad variant only.
 */
export function exitsFor(spec: CliSpec, variant: Variant): number[] {
  return variant === "ok" || spec.exits.includes(1) ? spec.exits : [...spec.exits, 1];
}

/** The resource names a `--json` line can hand the next call (`captureIds` keys on these). */
export function resources(): ReadonlySet<string> {
  return RESOURCES;
}

/** One command line, from the declared arguments and options. */
function argvOf(
  call: CommandDescr,
  variant: Variant,
  choices: Choices,
  text: string,
  pools: Pools,
): string[] {
  const argv = [...call.path];
  for (const argument of call.args) {
    if (!argument.required && choices.chance(0.5)) continue;
    const value = stringOf(valueOf(argument.t, variant, choices, text, pools));
    argv.push(value === "" ? `fuzz-${argument.name}` : value);
  }

  const decided = new Map<string, boolean>();
  for (const option of call.options) {
    if (option.never === true) continue;
    const group = call.together.find((members) => members.includes(option.name));
    let wanted: boolean;
    if (group !== undefined) {
      const key = group.join(" ");
      let decision = decided.get(key);
      if (decision === undefined) {
        decision = choices.chance(0.5);
        decided.set(key, decision);
      }
      wanted = option.mandatory || decision;
    } else {
      // The text slot always rides along when there is text: that is what carries the input's
      // bytes into the message/title handling instead of only into a command name.
      wanted = option.mandatory || option.name === call.textOption || choices.chance(0.35);
    }
    if (!wanted) continue;
    if (option.name === call.textOption && text === "") continue;
    argv.push(option.name);
    if (!option.takesValue) continue;
    // A damaged line leaves a mandatory option without its value: commander's own
    // missing-argument path, which is a refusal rather than a command run.
    if (variant === "bad" && option.mandatory && choices.chance(0.5)) continue;
    if (option.name === call.textOption && text !== "") {
      argv.push(text);
      continue;
    }
    const value = stringOf(valueOf(option.t, variant, choices, text, pools));
    argv.push(value === "" ? "x" : value);
  }

  if (variant === "bad") {
    // The refusal the grammar owns: a token the command declares no option for.
    argv.push("--fuzz-bogus");
  } else if (
    call.options.some((option) => option.name === "--json") &&
    !argv.includes("--json") &&
    choices.chance(0.5)
  ) {
    argv.push("--json");
  }
  return argv;
}

export function cliSpecs(): CliSpec[] {
  const specs: CliSpec[] = COMMANDS.map((call) => ({
    id: call.id,
    path: call.path,
    args: call.args.map((argument) => ({
      name: argument.name,
      required: argument.required,
      variadic: argument.variadic,
      t: argument.t,
    })),
    options: call.options.map((option) => ({
      name: option.name,
      flags: option.flags,
      takesValue: option.takesValue,
      mandatory: option.mandatory,
      t: option.t,
      ...(option.never === true ? { never: true as const } : {}),
    })),
    textOption: call.textOption,
    exits: call.exits,
    argv: (variant, choices, text, pools) => argvOf(call, variant, choices, text, pools),
  }));

  // Two contracts the tree cannot name: the bare program (its help) and an unknown command.
  // Both are one-line behaviours the CLI owns, and both have broken before.
  specs.push({
    id: "help.bare",
    path: [],
    args: [],
    options: [],
    textOption: null,
    exits: [0],
    argv: () => [],
  });
  specs.push({
    id: "usage.unknown",
    path: [],
    args: [],
    options: [],
    textOption: null,
    exits: [1],
    argv: () => ["frobnicate"],
  });

  return specs;
}

/** Pool every id a `--json` line carried; one rule for every command. */
export function captureStdout(stdout: string, pools: Pools): void {
  const lines = stdout.trim().split("\n");
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]!.trim();
    if (line === "") continue;
    if (!line.startsWith("{") && !line.startsWith("[")) return;
    try {
      captureIds(JSON.parse(line) as unknown, pools, RESOURCES);
    } catch {
      return;
    }
    return;
  }
}
