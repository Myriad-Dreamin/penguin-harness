/**
 * The program a Claude Code Session runs: where `claude` is, the argv it is started with, and
 * the environment it must not inherit (index.ts puts it in a pty).
 */
import fs from "node:fs";
import path from "node:path";

/**
 * The parent's Claude Code SESSION markers, scrubbed from the pty's environment.
 *
 * A surface's pty inherits the server process's environment, and a harness started from
 * inside a Claude Code session carries that session's markers — which a child `claude`
 * reads as "I am nested": it turns transcript saving off and points its messaging at the
 * parent's socket. The Session opened here is a top-level conversation of its own, so the
 * markers go.
 *
 * Only the markers that IDENTIFY a running session are listed. Configuration a deployment
 * sets on purpose — `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_MAX_OUTPUT_TOKENS`, the
 * `ANTHROPIC_*` variables — is inherited untouched, which is how an operator configures
 * the tool at all.
 */
export const INHERITED_SESSION_MARKERS: readonly string[] = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_BRIDGE_SESSION_ID",
  "CLAUDE_CODE_MESSAGING_SOCKET",
  "CLAUDE_CODE_MESSAGING_TOKEN",
  "CLAUDE_CODE_EXECPATH",
];

/**
 * The variables of a Session's control environment (the harness's `SessionEnv.controlEnv`):
 * who the `penguin` commands inside the program act as. The harness hands the Session's own
 * values with the surface ref; a name it leaves out (no organization, no API token) is
 * scrubbed from what the pty inherits rather than left to whatever the server process was
 * started with, which would make the program act as somebody else.
 */
export const CONTROL_ENV_NAMES: readonly string[] = [
  "PENGUIN_API_URL",
  "PENGUIN_API_TOKEN",
  "PENGUIN_PROJECT_ID",
  "PENGUIN_AGENT_ID",
  "PENGUIN_SESSION_ID",
  "PENGUIN_ORG_ID",
];

/** What the pty must not inherit: the session markers, and every control variable `env` does not set. */
export function controlUnset(env: Record<string, string>): string[] {
  return [...INHERITED_SESSION_MARKERS, ...CONTROL_ENV_NAMES.filter((name) => !(name in env))];
}

/**
 * Where Claude Code puts itself, relative to `$HOME`, when it is not on the server's PATH.
 *
 * This exists because of how a server is usually started, not because of anything odd about
 * the tool: a machine's server is launched over a NON-INTERACTIVE ssh, whose PATH is
 * `/usr/local/bin:/usr/bin:/bin` and nothing else — no profile is read, so `~/.local/bin`,
 * where the official installer puts `claude`, is not on it. The pty inherits that PATH and
 * `execvp` answers "No such file or directory" about a program that is plainly installed.
 *
 * Order is install-recency: the current installer's location first, then the older local
 * install, then the two package managers people run it under.
 */
const CLAUDE_HOME_PATHS: readonly string[] = [
  ".local/bin/claude",
  ".claude/local/claude",
  ".bun/bin/claude",
  ".npm-global/bin/claude",
];

/** Windows equivalents, under `%USERPROFILE%` / `%APPDATA%` (the latter as an absolute env read). */
const CLAUDE_HOME_PATHS_WIN: readonly string[] = [
  ".local/bin/claude.exe",
  ".local/bin/claude.cmd",
  "AppData/Roaming/npm/claude.cmd",
  ".bun/bin/claude.exe",
];

/** True when `file` is there and this process may execute it. */
function runnable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** `name` as PATH would resolve it, or null — the same search `execvp` performs, done in advance so a miss can be explained. */
function onPath(name: string, env: NodeJS.ProcessEnv): string | null {
  const dirs = (env.PATH ?? "").split(path.delimiter).filter((d) => d !== "");
  const names =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .map((ext) => `${name}${ext.toLowerCase()}`)
      : [name];
  for (const dir of dirs) {
    for (const candidate of names) {
      const file = path.join(dir, candidate);
      if (runnable(file)) return file;
    }
  }
  return null;
}

/**
 * The program to run: the operator's override, else `claude` wherever it actually is.
 *
 * Resolved rather than handed to the pty as a bare name, because the bare name is what fails
 * on a machine (see CLAUDE_HOME_PATHS) — and fails as `execvp(3) failed.: No such file or
 * directory`, which says nothing about which program or why. `PENGUIN_CLAUDE_BIN` is taken as
 * given: an operator naming a path means that path, and a test standing in a fake means the
 * fake.
 */
export function claudeBinary(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.PENGUIN_CLAUDE_BIN?.trim();
  if (explicit) return explicit;
  const found = onPath("claude", env);
  if (found !== null) return found;
  const home = env.HOME ?? env.USERPROFILE ?? "";
  if (home !== "") {
    const relative = process.platform === "win32" ? CLAUDE_HOME_PATHS_WIN : CLAUDE_HOME_PATHS;
    for (const rel of relative) {
      const file = path.join(home, ...rel.split("/"));
      if (runnable(file)) return file;
    }
  }
  // Nothing found: hand the bare name over anyway. The spawn then fails with the plugin's
  // own message (the harness names the program it could not start), which is a better place
  // to explain it than here — this function has one job and no way to report.
  return "claude";
}

/**
 * Whether the search came up empty.
 *
 * Reads the resolution rather than repeating it: an unresolved `claude` is the ONE case where
 * the bare name comes back, since anything found comes back as a path and an override comes
 * back as the operator wrote it.
 */
export function claudeMissing(env: NodeJS.ProcessEnv = process.env): boolean {
  return claudeBinary(env) === "claude";
}

/** Where a missing `claude` was looked for, for the message that says it is not installed. */
export function claudeSearchedIn(env: NodeJS.ProcessEnv = process.env): string[] {
  const home = env.HOME ?? env.USERPROFILE ?? "";
  const relative = process.platform === "win32" ? CLAUDE_HOME_PATHS_WIN : CLAUDE_HOME_PATHS;
  return [
    `PATH (${env.PATH ?? ""})`,
    ...(home === "" ? [] : relative.map((rel) => path.join(home, ...rel.split("/")))),
  ];
}

/**
 * The argv for one Session: the program, then the first prompt when there is one. A Session
 * that continues Claude Code session `resume` starts `--resume <id>`, followed by the prompt
 * when one was given — the continued conversation then begins a turn with it at once.
 */
export function claudeArgv(
  prompt: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  resume?: string,
): string[] {
  const argv = [claudeBinary(env)];
  if (resume !== undefined) argv.push("--resume", resume);
  const first = prompt?.trim() ?? "";
  if (first !== "") argv.push(first);
  return argv;
}
