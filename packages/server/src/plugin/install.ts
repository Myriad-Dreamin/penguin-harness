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

export class PluginInstallError extends Error {}

/**
 * The line of npm's stderr worth showing. npm ends every failure with "A complete log of this
 * run can be found in …", so the last line is the one line that never says anything; the
 * reason is the first `npm error` line that is not that pointer, not a bare code, and not the
 * empty continuation lines npm pads the block with.
 */
export function npmReason(stderr: string | undefined, err: Error): string {
  const lines = (stderr ?? "")
    .split("\n")
    .map((l) => l.replace(/^npm (error|ERR!)\s*/, "").trim())
    .filter((l) => l !== "" && !/^A complete log/.test(l) && !/^code [A-Z0-9]+$/.test(l));
  const reason = lines.find((l) => l.length > 8);
  return reason ?? err.message;
}

/** Windows resolves `npm` through npm.cmd; everywhere else the plain name is on PATH. */
export function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}
