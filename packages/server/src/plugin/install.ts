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
import { existsSync } from "node:fs";
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

/** How to start npm: the file, its arguments, whether through a shell, and its environment. */
export interface NpmInvocation {
  command: string;
  args: string[];
  shell: boolean;
  env: NodeJS.ProcessEnv;
}

/** What `npmInvocation` reads of the running process; injectable for tests. */
export interface NpmHost {
  execPath?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** Is the running binary Electron (the desktop app's server), not Node? */
  electron?: boolean;
  exists?: (file: string) => boolean;
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
 * npm, as this installation can run it. First the npm beside the node running the server —
 * the CLI package's bundled runtime and the Docker image carry one, and neither puts it on
 * PATH — started as `node npm-cli.js`, so it needs neither PATH nor a shell; that node's
 * directory leads PATH for the scripts npm runs. Otherwise the `npm` on PATH: on Windows that
 * is `npm.cmd`, which Node spawns only through a shell (EINVAL without one), its arguments
 * quoted for cmd.exe. Electron (the desktop app) carries no npm, so it always takes PATH.
 */
export function npmInvocation(args: readonly string[], host: NpmHost = {}): NpmInvocation {
  const execPath = host.execPath ?? process.execPath;
  const platform = host.platform ?? process.platform;
  const env = host.env ?? process.env;
  const electron = host.electron ?? process.versions.electron !== undefined;
  const exists = host.exists ?? existsSync;
  const p = platform === "win32" ? path.win32 : path.posix;
  const nodeDir = p.dirname(execPath);
  const cli =
    platform === "win32"
      ? p.join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js")
      : p.join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
  if (!electron && exists(cli)) {
    // Windows spells the variable `Path`; whichever key the environment has is the one kept.
    const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
    const rest = env[key];
    return {
      command: execPath,
      args: [cli, ...args],
      shell: false,
      env: { ...env, [key]: rest ? `${nodeDir}${p.delimiter}${rest}` : nodeDir },
    };
  }
  if (platform === "win32") {
    return { command: "npm.cmd", args: args.map(cmdQuote), shell: true, env };
  }
  return { command: "npm", args: [...args], shell: false, env };
}
