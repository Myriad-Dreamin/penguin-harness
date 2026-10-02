/**
 * Plugin activation: which stored plugins a process loads.
 *
 * `<root>/plugins/current` is ONE FILE, the selection — JSON naming, for every plugin to load,
 * the store entry by name, version and npm integrity; and the selection before it:
 *
 *   { "plugins":  { "<name>": { "version": "1.2.3", "integrity": "sha512-…" }, … },
 *     "previous": { … } | null }
 *
 * The store keeps tarballs (plugin/store.ts); a selected entry is UNPACKED under
 * `<root>/plugins/` by the store's own path rule — `plugins/packages/…/<name>/<version>/<key>/`
 * holding `package/` and the marker `.unpacked` — and a plugin is loaded from there. Nothing
 * else under `<root>/plugins/` is read.
 *
 * ATOMIC. An activation first gets every entry it will name into the store and unpacked (each
 * committed by its own rename, and only with its marker inside it), and only then writes the
 * selection: a temporary file beside `current`, renamed over it. That rename is the one step
 * that changes what a process loads; a reader sees the whole old selection or the whole new
 * one, and a crash before it leaves the old one in force. The same selection is not rewritten.
 * A boot that fails after activating writes back the document it found (hmr/platform.ts). The
 * sweep (plugin/gc.ts) keeps what `plugins` and `previous` name, in the store and unpacked.
 *
 * A selection is RESOLVED from the closure (every Project's table for this machine): for each
 * name, the entry a Project pinned (`integrity`), or else the store entries whose version
 * satisfies what every Project asks; among those the highest version, and within one version
 * the content the running build carries (its hot push set, or the prefix the installation
 * ships) before one fetched from the registry. A push that brings new content under an
 * unchanged name and version therefore wins at the next activation, with nothing else to do.
 *
 * Activation runs at every App boot — the first, a hot push's, and every re-assembly, which
 * the platform serializes on its one queue (hmr/platform.ts), so two admins' edits never
 * interleave.
 *
 * A plugin runs from its unpacked entry, so the host SDK it keeps external is lent to it from
 * the running program (`lendHostPackages`).
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import nodeModule from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as tar from "tar";
import {
  discardDir,
  onStoreQueue,
  PACKAGE_DIR,
  programEntry,
  readStore,
  STAGING_DIR,
  storeEntryDir,
  syncPluginStore,
} from "./store.js";
import { entryDir, TARBALL_FILE } from "../../../../scripts/plugin-entry.mjs";
import type { StoreIndexEntry } from "./store.js";
import { compareVersions, satisfies } from "../api/plugin-pick.js";

/** `<root>/plugins`: the activation directory. */
export const PLUGINS_DIR = "plugins";
/** The selection file. */
export const CURRENT_FILE = "current";
/** An unpacked entry's completion marker. */
export const UNPACKED_FILE = ".unpacked";

export function pluginsDir(root: string): string {
  return path.join(root, PLUGINS_DIR);
}

/** What a Project asks of one name: a version range, and optionally the exact content. */
export interface PluginAsk {
  version?: string;
  /** npm's integrity, `sha512-<base64>`: this content and no other. */
  integrity?: string;
}

/** One plugin of a selection: the store entry it names. */
export interface SelectedPlugin {
  name: string;
  version: string;
  /** npm's integrity, `sha512-<base64>`; the store entry's key is derived from it. */
  integrity: string;
}

/** The selection file: what loads, and what loaded before it. */
export interface CurrentSelection {
  plugins: SelectedPlugin[];
  previous: SelectedPlugin[] | null;
}

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function tableOf(
  list: readonly SelectedPlugin[],
): Record<string, { version: string; integrity: string }> {
  const sorted = [...list].sort((a, b) => byCodeUnit(a.name, b.name));
  return Object.fromEntries(
    sorted.map((e) => [e.name, { version: e.version, integrity: e.integrity }]),
  );
}

function listOf(table: unknown): SelectedPlugin[] | null {
  if (table === null || typeof table !== "object" || Array.isArray(table)) return null;
  const out: SelectedPlugin[] = [];
  for (const [name, row] of Object.entries(table as Record<string, unknown>)) {
    const r = (row ?? {}) as { version?: unknown; integrity?: unknown };
    if (typeof r.version !== "string" || typeof r.integrity !== "string") return null;
    out.push({ name, version: r.version, integrity: r.integrity });
  }
  return out;
}

/**
 * The selection in force, or null — before the first activation, or when the file is not a
 * selection (an earlier layout's pointer is read as none, and the next activation replaces it).
 */
export function readCurrent(root: string): CurrentSelection | null {
  let doc: { plugins?: unknown; previous?: unknown };
  try {
    doc = JSON.parse(fs.readFileSync(path.join(pluginsDir(root), CURRENT_FILE), "utf8")) as {
      plugins?: unknown;
      previous?: unknown;
    };
  } catch {
    return null;
  }
  const plugins = listOf(doc?.plugins);
  if (plugins === null) return null;
  return { plugins, previous: doc.previous == null ? null : listOf(doc.previous) };
}

/** Whether two selections name the same entries. */
export function sameSelection(a: readonly SelectedPlugin[], b: readonly SelectedPlugin[]): boolean {
  return JSON.stringify(tableOf(a)) === JSON.stringify(tableOf(b));
}

/**
 * Writes the selection file — a temporary file renamed over `current`, so it changes in one
 * step — or removes it (null).
 */
export async function writeCurrent(
  root: string,
  selection: CurrentSelection | null,
): Promise<void> {
  const file = path.join(pluginsDir(root), CURRENT_FILE);
  if (selection === null) {
    await fsp.rm(file, { force: true });
    return;
  }
  await fsp.mkdir(pluginsDir(root), { recursive: true });
  const doc = {
    plugins: tableOf(selection.plugins),
    previous: selection.previous === null ? null : tableOf(selection.previous),
  };
  // One server per data root (server.lock), so one fixed name: a crash's leftover is simply
  // overwritten by the next write.
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`);
  await fsp.rename(tmp, file);
}

/** Where a stored entry is unpacked: under `<root>/plugins/`, by the store's own path rule. */
export function unpackedDir(root: string, e: SelectedPlugin): string {
  return entryDir(pluginsDir(root), e.name, e.version, e.integrity);
}

/** Where a selected plugin's package is: its unpacked entry's `package/`. */
export function selectedPackageDir(root: string, e: SelectedPlugin): string {
  return path.join(unpackedDir(root, e), PACKAGE_DIR);
}

/** Whether an entry is unpacked: its directory holds the marker. */
export function isUnpacked(dir: string): boolean {
  return fs.existsSync(path.join(dir, UNPACKED_FILE));
}

/**
 * Unpacks the stored entry `e` under `<root>/plugins/`, unless it is unpacked already: the
 * tarball is extracted into `plugins/.staging/u-…/package/`, the marker written last, and the
 * directory renamed into place — one step. What the plugin declares as dependencies is not
 * installed: a plugin packs itself.
 */
export function unpackEntry(root: string, e: SelectedPlugin): Promise<string> {
  return onStoreQueue(async () => {
    const dest = unpackedDir(root, e);
    if (isUnpacked(dest)) return dest;
    const staging = path.join(pluginsDir(root), STAGING_DIR);
    await fsp.mkdir(staging, { recursive: true });
    const stage = await fsp.mkdtemp(path.join(staging, "u-"));
    try {
      const pkg = path.join(stage, PACKAGE_DIR);
      await fsp.mkdir(pkg);
      const tarball = path.join(storeEntryDir(root, e.name, e.version, e.integrity), TARBALL_FILE);
      await tar.x({ file: tarball, cwd: pkg, strip: 1, preservePaths: false });
      await fsp.writeFile(path.join(stage, UNPACKED_FILE), "");
      if (fs.existsSync(dest)) await discardDir(root, dest, staging);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      try {
        await fsp.rename(stage, dest);
      } catch (err) {
        if (!isUnpacked(dest)) throw err;
      }
      return dest;
    } finally {
      await fsp.rm(stage, { recursive: true, force: true });
    }
  });
}

/**
 * The store entry a name resolves to, or why none does: a pinned integrity takes that entry;
 * otherwise, among the entries every ask's version admits, the highest version — and within
 * one version, what the running build carries (`shipped`, by integrity) before any other
 * content, so a push that brings new content under an unchanged version wins.
 */
export function chooseEntry(
  name: string,
  asks: readonly PluginAsk[],
  stored: readonly StoreIndexEntry[],
  shipped: ReadonlySet<string>,
): StoreIndexEntry | { missing: string } {
  const mine = stored.filter((e) => e.name === name);
  if (mine.length === 0) {
    return {
      missing: `'${name}' is not in the plugin store: install it, or ship it with the build`,
    };
  }
  const pins = [...new Set(asks.map((a) => a.integrity).filter((i): i is string => !!i))];
  if (pins.length > 1) {
    return {
      missing: `'${name}' is pinned to ${pins.length} different contents: ${pins.join(", ")}`,
    };
  }
  const fits = mine.filter(
    (e) =>
      asks.every((a) => satisfies(e.version, a.version)) &&
      (pins.length === 0 || e.integrity === pins[0]),
  );
  if (fits.length === 0) {
    const wanted = asks.map((a) => a.integrity ?? a.version ?? "*").join(", ");
    return {
      missing: `no stored '${name}' satisfies ${wanted} (stored: ${mine.map((e) => e.version).join(", ")})`,
    };
  }
  return [...fits].sort(
    (a, b) =>
      compareVersions(b.version, a.version) ||
      Number(shipped.has(b.integrity)) - Number(shipped.has(a.integrity)) ||
      byCodeUnit(a.integrity, b.integrity),
  )[0]!;
}

/** What one activation did: the selection before it, the one now in force, and what could not be placed in it. */
export interface Activation {
  before: CurrentSelection | null;
  current: CurrentSelection;
  /** Whether `current` was rewritten. */
  changed: boolean;
  /** name → why it is not in the selection. */
  missing: Map<string, string>;
}

/**
 * Resolves the closure against the store and, when that selection differs from the one in
 * force, makes it current. The store is brought up to date with this boot's own sources first
 * (their entries are what "the running build carries" means), so every entry the selection
 * names is stored before the selection is written. `asks` maps each listed package name to
 * what every Project asks of it; a name that is not a package name finds no store entry and is
 * reported by the loader with its reason.
 */
export async function activatePlugins(
  root: string,
  asks: ReadonlyMap<string, readonly PluginAsk[]>,
  assetsDir: string | null,
): Promise<Activation> {
  const shipped = await syncPluginStore(root, assetsDir);
  const stored = await readStore(root);
  const chosen: SelectedPlugin[] = [];
  const missing = new Map<string, string>();
  for (const [name, list] of asks) {
    const pick = chooseEntry(name, list, stored, shipped);
    if ("missing" in pick) {
      missing.set(name, pick.missing);
      continue;
    }
    const e = { name: pick.name, version: pick.version, integrity: pick.integrity };
    // The selection names only what is unpacked: a reader of `current` finds every package.
    try {
      await unpackEntry(root, e);
      chosen.push(e);
    } catch (err) {
      missing.set(
        name,
        `'${name}' could not be unpacked: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  const before = readCurrent(root);
  if (before !== null && sameSelection(before.plugins, chosen)) {
    return { before, current: before, changed: false, missing };
  }
  const current: CurrentSelection = { plugins: chosen, previous: before?.plugins ?? null };
  await writeCurrent(root, current);
  return { before, current, changed: true, missing };
}

/**
 * The packages the HOST lends a plugin rather than the plugin shipping them: the SDK a plugin's
 * bundle keeps external (discord-bot imports `@prismshadow/penguin-core` at run time).
 */
export const HOST_PACKAGES = /^@prismshadow\/penguin-core(\/|$)/;

type Resolve = Parameters<NonNullable<Parameters<typeof nodeModule.registerHooks>[0]["resolve"]>>;
type Resolved = ReturnType<Resolve[2]>;

/**
 * The process-wide half: installed once, by whichever copy of this file runs first (the
 * runtime's own bundle, or a pushed platform's), and holding nothing but a slot. What it does
 * on a failed resolution is the `retry` the LATEST caller put there — so the policy travels by
 * push like the rest of this file, while Node's hook chain gets exactly one entry.
 */
const HOST_LENDING = Symbol.for("penguin.plugins.hostLending");
interface HostLending {
  installed: boolean;
  /** `file:` URLs of plugin stores, each ending in a separator. */
  roots: Set<string>;
  retry: (specifier: string, context: Resolve[1], next: Resolve[2], err: unknown) => Resolved;
}

/**
 * Lets a plugin unpacked under `root` resolve a host package the way the running program
 * does. A plugin runs from its unpacked entry, and Node
 * resolves its imports from there — under the data root, where no `node_modules` holds the
 * host's SDK; from the installation's prefix it used to find the program's copy by walking up.
 * Only a HOST_PACKAGES import the plugin's own package cannot resolve is retried, from the
 * program's entry (`process.argv[1]`, its links resolved: from the Docker image's
 * `/usr/local/bin/penguin` no `node_modules` holds the SDK); anything the package carries
 * itself wins. A runtime
 * without `module.registerHooks` logs once and resolves as Node does.
 */
export function lendHostPackages(root: string): void {
  const g = globalThis as { [HOST_LENDING]?: HostLending };
  const slot = (g[HOST_LENDING] ??= {
    installed: false,
    roots: new Set(),
    retry: (_s, _c, _n, err) => {
      throw err;
    },
  });
  slot.roots.add(pathToFileURL(path.join(pluginsDir(root), path.sep)).href);
  slot.retry = (specifier, context, next, err) => {
    const parent = context.parentURL;
    const entry = programEntry();
    if (
      (err as { code?: string }).code !== "ERR_MODULE_NOT_FOUND" ||
      !HOST_PACKAGES.test(specifier) ||
      parent === undefined ||
      typeof entry !== "string" ||
      ![...slot.roots].some((r) => parent.startsWith(r))
    ) {
      throw err;
    }
    return next(specifier, { ...context, parentURL: pathToFileURL(entry).href });
  };
  if (slot.installed) return;
  slot.installed = true;
  const register = (nodeModule as { registerHooks?: typeof nodeModule.registerHooks })
    .registerHooks;
  if (typeof register !== "function") {
    console.warn(
      "[plugins] this Node has no module.registerHooks: a stored plugin that keeps the host SDK external will not resolve it",
    );
    return;
  }
  register({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (err) {
        return slot.retry(specifier, context, nextResolve, err);
      }
    },
  });
}
