/**
 * The command tree the product itself builds — read, not fuzzed.
 *
 * `packages/cli/src/index.ts` wires fifteen `register*Command(program, t)` calls onto one
 * `Command`. This module performs the same wiring and walks it, so `specs/generate.ts --check`
 * can compare the descriptions in `specs/cli/cli.txt` against the tree the product ships, and
 * `--draft` can print a line for a command the text does not have yet.
 *
 * The tree is the CLI's own declaration of what exists; it is not the fuzzer's spec. What each
 * command may be given, and which commands are driven at all, lives in the text.
 */
import { Command } from "commander";
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

export interface TreeCommand {
  path: string[];
  args: { name: string; required: boolean; variadic: boolean }[];
  options: { name: string; flags: string; takesValue: boolean; mandatory: boolean }[];
}

/**
 * The tree as `index.ts` builds it. `buildInfo().describe` is replaced by a constant: the real
 * one shells out to git in a source build, which a fuzz process must not do.
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

/** Every leaf of the tree, with the arguments and options commander holds for it. */
export function commandTree(): TreeCommand[] {
  const program = buildProgram();
  const commands: TreeCommand[] = [];
  const walk = (command: Command, path: string[]): void => {
    for (const child of command.commands) {
      const id = [...path, child.name()];
      if (child.commands.length > 0) {
        walk(child, id);
        continue;
      }
      commands.push({
        path: id,
        args: child.registeredArguments.map((argument) => ({
          name: argument.name(),
          required: argument.required,
          variadic: argument.variadic,
        })),
        options: child.options
          .filter((option) => !option.flags.includes("--help") && !option.flags.includes("--version"))
          .map((option) => ({
            name: option.long ?? (option.flags.split(/[ ,|]+/).find((part) => part.startsWith("-")) as string),
            flags: option.short !== undefined && option.long !== undefined ? `${option.short}|${option.long}` : (option.long ?? option.flags.split(/[ ,|]+/)[0]!),
            takesValue: option.required || option.optional || option.variadic,
            mandatory: option.mandatory,
          })),
      });
    }
  };
  walk(program, []);
  return commands;
}
