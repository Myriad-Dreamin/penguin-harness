/**
 * The CLI leg's specs — read off the commander tree the product itself builds.
 *
 * `packages/cli/src/index.ts` wires fifteen `register*Command(program, t)` calls onto one
 * `Command`; this module performs the same wiring (the register functions are the product's
 * own declarations, so the tree is exact, and a new command appears here with no edit) and
 * walks it: every leaf becomes a spec carrying its arguments (`<name>`, `[name]`, `...`), its
 * options (flags, whether a value is taken, `choices` from `choices([...])`, whether the
 * option is mandatory) and its description.
 *
 * The tree says *what* can be passed; it cannot say *what to pass*. That is the decode step:
 * every slot is filled from the input's own bytes, by the slot's name — an id slot draws from
 * the ids the run has seen (or a hostile one), a duration slot draws from the durations the
 * commands accept, a free-text slot takes the payload. So a mutation moves one slot of one
 * command line instead of producing an argv no command can parse.
 */
import { Command } from "commander";
import type { Choices } from "../../server/src/choices.js";
import { registerAgentCommand } from "../../../../packages/cli/src/commands/agent.js";
import { registerAuthCommand } from "../../../../packages/cli/src/commands/auth.js";
import { registerBrowserCommand } from "../../../../packages/cli/src/commands/browser.js";
import { registerChatCommand } from "../../../../packages/cli/src/commands/chat.js";
import { registerConfigCommand } from "../../../../packages/cli/src/commands/config.js";
import { registerCostCommand } from "../../../../packages/cli/src/commands/cost.js";
import { registerOrgCommand } from "../../../../packages/cli/src/commands/org.js";
import { registerPluginCommand } from "../../../../packages/cli/src/commands/plugin.js";
import { registerProjectCommand } from "../../../../packages/cli/src/commands/project.js";
import { registerRunCommand } from "../../../../packages/cli/src/commands/run.js";
import { registerScheduleCommand } from "../../../../packages/cli/src/commands/schedule.js";
import { registerServeCommands } from "../../../../packages/cli/src/commands/serve.js";
import { registerSessionCommand } from "../../../../packages/cli/src/commands/session.js";
import { registerUpdateCommand } from "../../../../packages/cli/src/commands/update.js";
import { registerVersionCommand } from "../../../../packages/cli/src/commands/version.js";
import { defaultMessages } from "../../../../packages/cli/src/i18n.js";
import { captureIds, idValue, textValue, validIdValue, type Pools, type Variant } from "../decode.js";

export interface CliArgSpec {
  name: string;
  required: boolean;
  variadic: boolean;
}

export interface CliOptionSpec {
  /** The first long form, `--message`; a lone short flag keeps its own spelling. */
  name: string;
  flags: string;
  takesValue: boolean;
  mandatory: boolean;
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
 * The exit codes one call may produce. `exits` is the contract for a well-formed command
 * line; a deliberately damaged one is a usage error, and commander's usage errors are exit 1
 * — that IS the CLI working, so a refusal is in bounds for the bad variant only.
 */
export function exitsFor(spec: CliSpec, variant: Variant): number[] {
  return variant === "ok" || spec.exits.includes(1) ? spec.exits : [...spec.exits, 1];
}

/**
 * The build tree, built the way `index.ts` builds it. `buildInfo().describe` is replaced by a
 * constant: the real one shells out to git in a source build, which a fuzz call must not do.
 */
function buildProgram(): Command {
  const t = defaultMessages();
  const program = new Command();
  program
    .name("penguin")
    .description(t.cliDescription)
    .version("fuzz", "-v, --version", t.versionDesc)
    .exitOverride()
    .configureOutput({ outputError: () => {} });
  registerAuthCommand(program, t);
  registerConfigCommand(program, t);
  registerRunCommand(program, t);
  registerChatCommand(program, t);
  registerSessionCommand(program, t);
  registerAgentCommand(program, t);
  registerProjectCommand(program, t);
  registerPluginCommand(program, t);
  registerCostCommand(program, t);
  registerScheduleCommand(program, t);
  registerOrgCommand(program, t);
  registerBrowserCommand(program, t);
  registerServeCommands(program, t);
  registerUpdateCommand(program, t);
  registerVersionCommand(program, t);
  return program;
}

/**
 * Options a call must not pass, per command id and globally:
 *
 *  - `--root`, `--server`, `--workspace` name WHERE the command works — the data root, the
 *    server and the directory a run writes into. The leg decides all three (PENGUIN_HOME, the
 *    loopback API URL, the harness root); drawing them would leave the disposable data root.
 *  - `session log --follow` keeps the process attached to a live stream until the client
 *    stops it, and a fuzz call never does: every draw would be a soft-timeout finding.
 */
const LEG_OWNED_OPTIONS = new Set(["--root", "--server", "--workspace"]);
const HOLD_OPEN_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  "session log": ["--follow"],
};

/**
 * Which commands the fuzzer may drive. Everything absent either writes a secret file
 * (`auth token`, `config vault set`), installs from the network (`plugin install`), drives a
 * real browser, deploys (`update`), starts a long-lived server (`serve`, `chat`), or opens
 * desk sessions (`org` writes) — none of which a fuzz call can be allowed to do.
 */
const GROUP_ALL = new Set(["version", "cost", "project", "session", "schedule", "run"]);
const LEAF_ALLOW = new Set([
  "agent ls",
  "server status",
  "plugin list",
  "auth status",
  "browser status",
  "org ls",
  "benchmark ls",
  "config model list",
  "config vault list",
]);

function dangerOf(path: string[]): string | undefined {
  if (path.length === 0) return "the bare program";
  const id = path.join(" ");
  if (GROUP_ALL.has(path[0]!)) return undefined;
  if (LEAF_ALLOW.has(id)) return undefined;
  return "writes or drives beyond the disposable data root";
}

/**
 * Read-only commands whose contract is a clean exit; everything else may also refuse (1).
 *
 * Two commands are deliberately not in the set, because the premise they need is absent from
 * the disposable server this leg drives:
 *
 *  - `org ls` reads a company-mode-only surface, and the harness runs with company mode off, so
 *    its 404 refusal IS the contract here.
 *  - `browser status` answers `available: false` and exits 1 by design when no browser is
 *    attached (that is what the probe is for); the harness attaches none.
 */
const EXIT_ZERO_ONLY = new Set([
  "version",
  "project ls",
  "agent ls",
  "session ls",
  "cost",
  "plugin list",
  "auth status",
  "server status",
  "config model list",
  "config vault list",
  "benchmark ls",
]);

const TEXT_OPTIONS = ["--message", "--prompt", "--title", "--name"];

/**
 * Options that only work as a set: `cost --from <date>` without `--to` is refused by the
 * command's own range check, so an `ok` line draws the pair together or not at all.
 */
const DRAWN_TOGETHER: Readonly<Record<string, readonly (readonly string[])[]>> = {
  cost: [["--from", "--to"]],
};

function optionValue(
  option: CliOptionSpec,
  variant: Variant,
  choices: Choices,
  text: string,
  pools: Pools,
): string {
  const name = option.name.replace(/^--?/, "");
  // Values the command's own validator states: a positive day count, a date, one of the four
  // cost dimensions. `bad` draws sit outside those sets on purpose — that is the refusal face.
  if (name === "timeout") return choices.pick(["0", "1s", "3s", "10s", "bogus"]);
  if (name === "days") return variant === "ok" ? choices.pick(["1", "7", "30"]) : choices.pick(["0", "-1", "abc"]);
  if (name === "from" || name === "to") {
    return variant === "ok" ? choices.pick(["2026-10-01", "2026-10-20"]) : choices.pick(["x", "2026-13-45"]);
  }
  if (name === "by") {
    return variant === "ok" ? choices.pick(["date", "agent", "model", "session"]) : choices.pick(["x", ""]);
  }
  if (name === "timeout-ms") return String(choices.int(0, 30_000));
  if (name === "session-id" || name === "agent-id" || name === "project-id") {
    return idOf(name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), variant, choices, pools);
  }
  if (option.name === "-t" || TEXT_OPTIONS.includes(option.name)) return textValue(name, choices, text);
  return textValue(name, choices, text) || "x";
}

/**
 * The id an option or an argument carries: `ok` lines name ids the command has to accept, so a
 * refusal there is a finding; `bad` lines may also carry a value the command must reject.
 */
function idOf(name: string, variant: Variant, choices: Choices, pools: Pools): string {
  return variant === "ok" ? validIdValue(name, choices, pools) : idValue(name, choices, pools);
}

function argumentValue(
  argument: CliArgSpec,
  variant: Variant,
  choices: Choices,
  text: string,
  pools: Pools,
): string {
  if (argument.name === "sessionRef" || argument.name === "sessionId") {
    return idOf("sessionId", variant, choices, pools);
  }
  if (argument.name === "agentId") return idOf("agentId", variant, choices, pools);
  if (argument.name === "projectId") return idOf("projectId", variant, choices, pools);
  return textValue(argument.name, choices, text) || `fuzz-${argument.name}`;
}

export function cliSpecs(): CliSpec[] {
  const program = buildProgram();
  const specs: CliSpec[] = [];

  const walk = (command: Command, path: string[]): void => {
    for (const child of command.commands) {
      const id = [...path, child.name()];
      if (child.commands.length > 0) {
        walk(child, id);
        continue;
      }
      const args: CliArgSpec[] = child.registeredArguments.map((argument) => ({
        name: argument.name(),
        required: argument.required,
        variadic: argument.variadic,
      }));
      const label = id.join(" ");
      const holdOpen = HOLD_OPEN_OPTIONS[label] ?? [];
      const together = DRAWN_TOGETHER[label] ?? [];
      const options: CliOptionSpec[] = child.options
        .filter((option) => !option.flags.includes("--help") && !option.flags.includes("--version"))
        .map((option) => {
          const long = option.long ?? option.flags.split(/[ ,|]+/).find((part) => part.startsWith("-"));
          return {
            name: long ?? option.flags,
            flags: option.flags,
            takesValue: option.required || option.optional || option.variadic,
            mandatory: option.mandatory,
          };
        })
        .filter((option) => !LEG_OWNED_OPTIONS.has(option.name) && !holdOpen.includes(option.name));
      const textOption =
        options.find((option) => option.name === "-t" || TEXT_OPTIONS.includes(option.name))?.name ??
        null;
      specs.push({
        id: label,
        path: id,
        args,
        options,
        textOption,
        exits: EXIT_ZERO_ONLY.has(label) ? [0] : [0, 1],
        argv(variant, choices, text, pools) {
          const argv = [...id];
          for (const argument of args) {
            if (!argument.required && choices.chance(0.5)) continue;
            argv.push(argumentValue(argument, variant, choices, text, pools));
          }
          const groupDecisions = new Map<string, boolean>();
          for (const option of options) {
            const group = together.find((members) => members.includes(option.name));
            let wanted: boolean;
            if (group !== undefined) {
              const key = group.join(" ");
              let decision = groupDecisions.get(key);
              if (decision === undefined) {
                decision = choices.chance(0.5);
                groupDecisions.set(key, decision);
              }
              wanted = option.mandatory || decision;
            } else {
              // The text slot always rides along when there is text: that is what carries the
              // input's bytes into the message/title handling instead of only into a command name.
              wanted =
                option.mandatory ||
                option.name === textOption ||
                (option.name !== textOption && choices.chance(0.35));
            }
            if (!wanted) continue;
            if (option.name === textOption && text === "") continue;
            argv.push(option.name);
            if (!option.takesValue) continue;
            // A damaged line leaves a mandatory option without its value: commander's own
            // missing-argument path, which is a refusal rather than a command run.
            if (variant === "bad" && option.mandatory && choices.chance(0.5)) continue;
            argv.push(
              option.name === textOption && text !== ""
                ? text
                : optionValue(option, variant, choices, text, pools),
            );
          }
          if (variant === "bad") {
            // The refusal the grammar owns: a token the command declares no option for.
            argv.push("--fuzz-bogus");
          } else if (
            options.some((option) => option.name === "--json") &&
            !argv.includes("--json") &&
            choices.chance(0.5)
          ) {
            argv.push("--json");
          }
          return argv;
        },
      });
    }
  };
  walk(program, []);

  const driven = specs.filter((spec) => dangerOf(spec.path) === undefined);

  // Two surfaces the tree cannot name: the bare program (help) and an unknown command. Both
  // are one-line contracts the CLI owns, and both have broken before. They are not leaves of
  // the tree, so the danger gate above does not apply.
  driven.push({
    id: "help.bare",
    path: [],
    args: [],
    options: [],
    textOption: null,
    exits: [0],
    argv: () => [],
  });
  driven.push({
    id: "usage.unknown",
    path: [],
    args: [],
    options: [],
    textOption: null,
    exits: [1],
    argv: () => ["frobnicate"],
  });

  return driven;
}

/** Pool every id a `--json` line carried; one rule for every command. */
export function captureStdout(stdout: string, pools: Pools): void {
  const lines = stdout.trim().split("\n");
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]!.trim();
    if (line === "") continue;
    if (!line.startsWith("{") && !line.startsWith("[")) return;
    try {
      captureIds(JSON.parse(line) as unknown, pools);
    } catch {
      return;
    }
    return;
  }
}
