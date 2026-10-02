/**
 * What a command is handed when the CLI starts: its dictionary and the harness this process
 * resolved (harness.ts). Passed as an argument, so nothing a command needs travels through
 * the environment of the process it runs in.
 */
import type { Messages } from "./i18n.js";
import type { ResolvedHarness } from "./harness.js";

export interface CommandContext {
  t: Messages;
  harness: ResolvedHarness;
}
