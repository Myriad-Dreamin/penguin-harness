/**
 * Driving npm for a plugin fetch.
 *
 * npm writes nowhere the loader reads: a registry fetch installs into a staging prefix of the
 * plugin store and ends as a store entry (plugin/store.ts `fetchIntoStore`); what a process
 * loads is the generation activated from the store (plugin/activation.ts). npm stays the whole
 * fetch on purpose: a plugin is an npm package, its dependencies are npm's problem, and a
 * registry, a proxy or a private scope is then configured the way every other npm consumer on
 * that machine configures it (.npmrc, the ambient environment).
 */

import path from "node:path";

export class PluginInstallError extends Error {}

/**
 * The line of npm's stderr worth showing. npm ends every failure with "A complete log of this
 * run can be found in …", so the last line is the one line that never says anything; the
 * reason is the first `npm error` line that is not that pointer, not a bare code, and not the
 * empty continuation lines npm pads the block with. Warnings printed before it (a deprecated
 * package, an engine mismatch) are not the reason; stderr without any `npm error` line — a
 * shell that could not start npm at all — answers its own first line.
 */
export function npmReason(stderr: string | undefined, err: Error): string {
  const raw = (stderr ?? "").split(/\r?\n/);
  const errors = raw.filter((l) => /^npm (error|ERR!)/.test(l));
  const lines = (errors.length > 0 ? errors : raw.filter((l) => !/^npm (warn|WARN)/.test(l)))
    .map((l) => l.replace(/^npm (error|ERR!)\s*/, "").trim())
    .filter((l) => l !== "" && !/^A complete log/.test(l) && !/^code [A-Z0-9]+$/.test(l));
  const reason = lines.find((l) => l.length > 8);
  return reason ?? err.message;
}

/** How to start npm: the file, its arguments, and whether through a shell. */
export interface NpmCommand {
  command: string;
  args: string[];
  shell: boolean;
}

/**
 * cmd.exe does not unquote spawn arguments: under `shell: true` they are joined into one
 * command line. Inside double quotes cmd takes `& | < > ^` and spaces literally — a version
 * range like `>=1 <2` included — so every argument is quoted; what quotes cannot contain (a
 * quote, `%` expansion, a line break) is refused rather than passed to a shell.
 */
function cmdQuote(arg: string): string {
  if (/["%\r\n]/.test(arg)) {
    throw new PluginInstallError(`'${arg}' cannot be passed to npm.cmd through cmd.exe`);
  }
  return `"${arg}"`;
}

/**
 * The npm on PATH, the way every other npm consumer on the machine runs it. On Windows that is
 * `npm.cmd`, which Node starts only through a shell (EINVAL without one), so there it runs
 * through cmd.exe with every argument quoted.
 */
export function npmCommand(
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
): NpmCommand {
  return platform === "win32"
    ? { command: "npm.cmd", args: args.map(cmdQuote), shell: true }
    : { command: "npm", args: [...args], shell: false };
}

/**
 * The environment of the fetch's npm, and of nothing else: `env` with the directory of the Node
 * runtime running this server appended to PATH. A CLI bundle carries its own runtime, npm
 * beside node, so a machine without npm still fetches; appended rather than prepended, a user's
 * own npm keeps coming first. Only this child sees it: the server's PATH, and every agent
 * command inheriting it, stay as they were. Windows spells the variable `Path`, so the key
 * already present is the one extended.
 */
export function npmEnv(
  env: NodeJS.ProcessEnv,
  runtimeDir: string = path.dirname(process.execPath),
  delimiter: string = path.delimiter,
): NodeJS.ProcessEnv {
  const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const dirs = (env[key] ?? "").split(delimiter).filter((d) => d !== "");
  if (dirs.includes(runtimeDir)) return { ...env };
  return { ...env, [key]: [...dirs, runtimeDir].join(delimiter) };
}
