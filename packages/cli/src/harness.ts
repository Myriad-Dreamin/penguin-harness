/**
 * Which harness runs: the one rule, and its only implementation.
 *
 * A push carries a CLI bundle, and that bundle contains the server's entry — the whole CLI is
 * bundled together with @prismshadow/penguin-server, and `penguin-hmr` is the loader that runs
 * it. So the harness that runs is the pushed one when the data root records a usable pushed
 * CLI, and the installed one otherwise. Everything that has to name the running harness reads
 * the answer from here: the server a `penguin server` starts, the `<root>/bin/penguin` an Agent
 * runs (the CLI of the harness that runs it), and the self-update job.
 *
 * A process resolves it for itself and passes the result on as an argument (the command
 * context); nothing carries it through the environment.
 */
import fs from "node:fs";
import path from "node:path";
import { readPushedCli } from "@prismshadow/penguin-server/hmr/manifest";

/** The loader that runs the pushed CLI, emitted next to `penguin.js` (tsup.config.ts). */
export const PUSHED_CLI_LOADER = "penguin-hmr.js";

export interface ResolvedHarness {
  source: "pushed" | "installed";
  /**
   * The script `node` runs to reach this harness's CLI: the `penguin-hmr` loader for a pushed
   * harness, the installed entry otherwise. Null when no such script exists — a `tsx` run of
   * the source, or a program started through a link without a `.js` name (the Docker image's
   * `/usr/local/bin/penguin`): there is then no CLI to offer the Agents and nothing to run
   * `update` with.
   */
  cliEntry: string | null;
  /** The pushed CLI bundle itself, for a process that runs it in place (the desktop's server). */
  bundle: string | null;
}

/**
 * The harness to run, seen from a process started as `ownEntry` (its `process.argv[1]`) on
 * data root `root`. Nothing pushed, a broken record, and an installation without the loader
 * beside `ownEntry` all resolve to the installed harness: a harness that runs beats one that
 * does not.
 */
export async function resolveHarness(
  ownEntry: string | undefined,
  root: string,
): Promise<ResolvedHarness> {
  const pushed = await readPushedCli(root);
  const bundle = pushed.kind === "bundle" ? pushed.file : null;
  if (ownEntry === undefined || !/\.(js|mjs|cjs)$/i.test(ownEntry)) {
    return { source: "installed", cliEntry: null, bundle: null };
  }
  const own = path.resolve(ownEntry);
  if (path.basename(own) === PUSHED_CLI_LOADER) {
    return { source: "pushed", cliEntry: own, bundle };
  }
  const loader = path.join(path.dirname(own), PUSHED_CLI_LOADER);
  if (bundle !== null && fs.existsSync(loader)) {
    return { source: "pushed", cliEntry: loader, bundle };
  }
  return { source: "installed", cliEntry: own, bundle: null };
}
