/**
 * The plugin sweep: the store (plugin/store.ts) and the unpacked entries under `<root>/plugins/`
 * (plugin/activation.ts) do not grow without bound.
 *
 * A complete store entry is KEPT when any of these holds, and removed otherwise:
 *
 *   - the selection in force, or the one before it, names it (`<root>/plugins/current`,
 *     plugin/activation.ts);
 *   - a Project's table pins it — the shared table or any machine's;
 *   - it was stored less than a day ago (the mtime of its `.stored`).
 *
 * An unpacked entry is kept only while a kept selection names it: any other can be unpacked
 * again from the store.
 *
 * A package the build ships but no kept selection names goes like any other: the next
 * activation stores it again from the shipped prefix. An entry without `.stored` is a write
 * that did not finish, and goes once it is a day old; so does anything under either `.staging/`. A
 * `<version>/`, `<name>/` or bucket directory goes with its last entry. Nothing outside the
 * store's `packages/` is an entry, so an earlier layout's directories are neither kept nor
 * removed here.
 *
 * ATOMIC. An entry leaves in one step: it is renamed into `.staging/` and deleted there. A
 * crash midway leaves a staging directory (swept a day later), never an entry that still has
 * its `.stored` but has lost files.
 *
 * WHEN. The loader sweeps right after an activation that changed the selection, and once per
 * process at the first activation — always after the selection is written, never while it is:
 * activation and sweep run in one boot, and boots take turns on the platform's assembly
 * queue. The sweep also takes its turn on the store's own queue, behind any fetch in flight
 * (`onStoreQueue`).
 *
 * BEST EFFORT. Nothing here fails a boot: each failure is logged and the sweep goes on with
 * the rest.
 */
import fsp from "node:fs/promises";
import path from "node:path";
import { isUnpacked, pluginsDir } from "./activation.js";
import {
  discardDir,
  isStored,
  onStoreQueue,
  pluginStoreDir,
  STAGING_DIR,
  STORED_FILE,
  storeEntryDirs,
} from "./store.js";
import { entryKey } from "../../../../scripts/plugin-entry.mjs";

/** How long a stored entry is kept whatever references it, and how long unfinished work may sit. */
export const STORE_GRACE_MS = 24 * 60 * 60 * 1000;

/** One content a Project pins. */
export interface PluginPin {
  name: string;
  /** npm's integrity, `sha512-<base64>`. */
  integrity: string;
}

export interface SweepOptions {
  /** The entries to keep: what the selection in force and the one before it name. */
  keep: readonly { name: string; integrity: string }[];
  /** What any Project's table pins. */
  pins?: readonly PluginPin[];
  /** The clock, for tests. */
  now?: number;
  log?: (message: string) => void;
}

/** How much one sweep removed, and what it could not. */
export interface SweepReport {
  entries: number;
  unpacked: number;
  staging: number;
  /** Why a part was skipped or a removal failed. */
  failures: string[];
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** `<name>/<key>` of every content something still needs. */
function keptContents(options: SweepOptions): Set<string> {
  const kept = new Set<string>();
  for (const e of options.keep) {
    const key = entryKey(e.integrity);
    if (key !== null) kept.add(`${e.name}/${key}`);
  }
  for (const pin of options.pins ?? []) {
    const key = entryKey(pin.integrity);
    if (key !== null) kept.add(`${pin.name}/${key}`);
  }
  return kept;
}

/** How old a path is, by its mtime. */
async function age(p: string, now: number): Promise<number> {
  return now - (await fsp.stat(p)).mtimeMs;
}

/** The store part: every entry nothing keeps, and each directory its last entry leaves empty. */
async function sweepStore(
  root: string,
  kept: ReadonlySet<string>,
  now: number,
  report: SweepReport,
): Promise<void> {
  const parents = new Set<string>();
  for (const { name, key, dir } of await storeEntryDirs(root)) {
    try {
      const done = isStored(dir);
      if (done && kept.has(`${name}/${key}`)) continue;
      if ((await age(done ? path.join(dir, STORED_FILE) : dir, now)) < STORE_GRACE_MS) continue;
      await discardDir(root, dir);
      report.entries += 1;
      parents.add(path.dirname(dir));
    } catch (err) {
      report.failures.push(`${name}/${key}: ${reason(err)}`);
    }
  }
  // `<version>/`, `<name>/`, its buckets and a scope's directory, each once it is empty.
  const store = pluginStoreDir(root);
  const removed = (dir: string) =>
    fsp.rmdir(dir).then(
      () => true,
      () => false,
    );
  for (let dir of parents) {
    while (dir !== store && (await removed(dir))) dir = path.dirname(dir);
  }
}

/**
 * The unpacked part: every unpacked entry no kept selection names — it can be unpacked again
 * from the store — and one without its marker once it is a day old.
 */
async function sweepUnpacked(
  root: string,
  kept: ReadonlySet<string>,
  now: number,
  report: SweepReport,
): Promise<void> {
  const tree = pluginsDir(root);
  const staging = path.join(tree, STAGING_DIR);
  for (const { name, key, dir } of await storeEntryDirs(root, tree)) {
    try {
      const done = isUnpacked(dir);
      if (done && kept.has(`${name}/${key}`)) continue;
      if (!done && (await age(dir, now)) < STORE_GRACE_MS) continue;
      await discardDir(root, dir, staging);
      report.unpacked += 1;
      await removeEmptyParents(path.dirname(dir), tree);
    } catch (err) {
      report.failures.push(`unpacked ${name}/${key}: ${reason(err)}`);
    }
  }
}

/** `dir` and each parent up to (not including) `top`, while each is empty. */
async function removeEmptyParents(dir: string, top: string): Promise<void> {
  while (dir !== top && dir.startsWith(top)) {
    const gone = await fsp.rmdir(dir).then(
      () => true,
      () => false,
    );
    if (!gone) return;
    dir = path.dirname(dir);
  }
}

/** Every directory a day old in a `.staging/`: work no write finished. */
async function sweepStaging(staging: string, now: number, report: SweepReport): Promise<void> {
  let dirs: string[];
  try {
    dirs = await fsp.readdir(staging);
  } catch {
    return;
  }
  for (const dir of dirs) {
    try {
      if ((await age(path.join(staging, dir), now)) < STORE_GRACE_MS) continue;
      await fsp.rm(path.join(staging, dir), { recursive: true, force: true });
      report.staging += 1;
    } catch (err) {
      report.failures.push(`${STAGING_DIR}/${dir}: ${reason(err)}`);
    }
  }
}

/**
 * Sweeps the store of `root` and its unpacked entries (the rules are this file's header).
 * Never throws: what failed is in the report and in the log.
 */
export async function sweepPlugins(root: string, options: SweepOptions): Promise<SweepReport> {
  const log = options.log ?? ((m: string) => console.warn(m));
  const now = options.now ?? Date.now();
  const report: SweepReport = { entries: 0, unpacked: 0, staging: 0, failures: [] };
  try {
    await onStoreQueue(async () => {
      const kept = keptContents(options);
      await sweepStaging(path.join(pluginStoreDir(root), STAGING_DIR), now, report);
      await sweepStaging(path.join(pluginsDir(root), STAGING_DIR), now, report);
      await sweepUnpacked(root, kept, now, report);
      await sweepStore(root, kept, now, report);
    });
  } catch (err) {
    report.failures.push(reason(err));
  }
  if (report.entries + report.unpacked + report.staging > 0) {
    log(
      `[plugin-store] swept ${report.entries} entries, ${report.unpacked} unpacked, ${report.staging} staging directories`,
    );
  }
  for (const failure of report.failures) log(`[plugin-store] sweep: ${failure}`);
  return report;
}
