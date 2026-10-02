/**
 * The plugin store: one place under the data root where every plugin a machine has received is
 * kept, as its tarball, keyed by its content.
 *
 * `<root>/plugin-store/` files entries by the one path rule the build's index and the index
 * repository (penguin-plugins) use (scripts/plugin-entry.mjs): beside `.staging/` there is only
 * `packages/`, and one entry per `packages/[<@scope>/]<bucket>/<name>/<version>/<key>/` — the
 * key is the integrity's first 16 base64 characters, path safe — holding
 *
 *   package.tgz        the plugin's tarball: its bytes hash to the entry's integrity
 *   manifest.toml      the index manifest (the repository's fields, `integrity` required)
 *   .stored            the completion marker; its mtime is when it was stored
 *
 * A plugin packs itself: the tarball is the whole of it, and nothing here installs what it
 * declares as dependencies. A process does not load from the store: an entry is unpacked under
 * `<root>/plugins/` first (plugin/activation.ts).
 *
 * ATOMIC. An entry is written whole in `.staging/` — `.stored` included, last — and committed
 * by ONE rename into its place, so it appears complete or not at all. It leaves the same way:
 * renamed into `.staging/`, then deleted there (`discardDir`). An entry without `.stored` does
 * not exist: an earlier layout's or an interrupted write's leftover, discarded by the next
 * write of the same content. A rename that finds the entry already complete (the same content
 * stored meanwhile) has nothing left to do. Nothing outside `packages/` is read.
 *
 * THE KEY IS THE CONTENT, AND THE CONTENT IS NPM'S. `integrity` is npm's `dist.integrity` —
 * `sha512-<base64>` of the tarball's bytes. Every tarball is hashed before it is stored, and
 * one that does not hash to the integrity it came with is refused. Two versions of one name,
 * or two contents of one version, are two entries; one content is stored once.
 *
 * TWO WAYS IN, both through `storeTarball`:
 *
 *   - carried   the tarballs the running build carries (a hot push's `plugins/`, else the
 *               installation's — `lib/plugins` of the CLI bundle and the Docker image, `plugins/`
 *               of the desktop app and of a dev build), each with the integrity its row in the
 *               build's `index.json` names; an entry already stored is not copied again
 *               (`syncPluginStore`);
 *   - registry  `npm pack <name>@<version>` into `.staging/`, the registry's tarball, checked
 *               against the index row (`fetchIntoStore`).
 *
 * Every write and the sweep take turns on one queue (`onStoreQueue`): a fetch never lands an
 * entry in a directory the sweep is emptying. What the sweep keeps and removes is plugin/gc.ts.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import * as tar from "tar";
import { unpackedAssetsDir } from "../hmr/asset-archives.js";
import { PACKAGE_NAME } from "./loader.js";
import { npmCommand, npmEnv, npmReason, PluginInstallError } from "./install.js";
import {
  entryDir,
  entryKey,
  INDEX_FILE,
  MANIFEST_FILE,
  manifestOf,
  PACKAGE_DIR,
  sortIndex,
  TARBALL_FILE,
  tarballFileName,
  tarballIntegrity,
  treeNames,
} from "../../../../scripts/plugin-entry.mjs";
import type { EntryManifest } from "../../../../scripts/plugin-entry.mjs";

export { PACKAGE_DIR };

const execFileAsync = promisify(execFile);

/** `<root>/plugin-store`, relative to the data root. */
export const PLUGIN_STORE_DIR = "plugin-store";
/** Where work in progress lives: one fresh directory per write. */
export const STAGING_DIR = ".staging";
/** The completion marker, written last. */
export const STORED_FILE = ".stored";

/** One complete entry of the store. */
export interface StoredEntry {
  name: string;
  version: string;
  /** npm's `dist.integrity`, `sha512-<base64>`. */
  integrity: string;
  /** The entry's directory. */
  dir: string;
}

/** One entry as an index lists it: the index repository's manifest, `integrity` included. */
export type StoreIndexEntry = EntryManifest;

export class PluginStoreError extends Error {}

/** The package's hash is not the one its index entry names: nothing was stored. */
export class PluginIntegrityMismatch extends PluginStoreError {
  constructor(
    readonly name: string,
    readonly version: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `${name}@${version}: the tarball hashes to ${actual}, the index names ${expected}; nothing was stored`,
    );
  }
}

export function pluginStoreDir(root: string): string {
  return path.join(root, PLUGIN_STORE_DIR);
}

/** An entry's directory: `<store>/packages/…/<name>/<version>/<key>`. */
export function storeEntryDir(
  root: string,
  name: string,
  version: string,
  integrity: string,
): string {
  if (entryKey(integrity) === null) {
    throw new PluginStoreError(`'${integrity}' is not a sha512 integrity`);
  }
  return entryDir(pluginStoreDir(root), name, version, integrity);
}

/** Is `dir` a complete entry? */
export function isStored(dir: string): boolean {
  return fs.existsSync(path.join(dir, STORED_FILE));
}

/**
 * Removes `dir` in one step for any reader: renamed into a `.staging/` on the same filesystem —
 * the store's by default, `staging` for a directory elsewhere — then deleted there. A crash
 * midway leaves a staging directory, which the sweep removes.
 */
export async function discardDir(
  root: string,
  dir: string,
  staging: string = path.join(pluginStoreDir(root), STAGING_DIR),
): Promise<void> {
  await fsp.mkdir(staging, { recursive: true });
  const gone = path.join(staging, `d-${process.pid}-${randomUUID()}`);
  try {
    await fsp.rename(dir, gone);
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return;
    throw err;
  }
  await fsp.rm(gone, { recursive: true, force: true });
}

/** A fresh directory under `.staging/`; the caller removes it. */
async function stagingDir(root: string): Promise<string> {
  const staging = path.join(pluginStoreDir(root), STAGING_DIR);
  await fsp.mkdir(staging, { recursive: true });
  return fsp.mkdtemp(path.join(staging, "w-"));
}

/**
 * The `package.json` inside an npm tarball (its top directory is `package/`), or null. Read by
 * extracting that one file into a temporary directory beside the store's work.
 */
export async function readTarballPackageJson(
  tarball: string,
): Promise<Record<string, unknown> | null> {
  const text = await readTarballFile(tarball, "package.json");
  if (text === null) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * One file of an npm tarball, by its path inside the package (`README.md`), or null when the
 * tarball has none. Extracted into a temporary directory of its own.
 */
export async function readTarballFile(tarball: string, rel: string): Promise<string | null> {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "penguin-tarball-"));
  try {
    await tar.x({
      file: tarball,
      cwd: tmp,
      strip: 1,
      preservePaths: false,
      filter: (p) => p.split("/").slice(1).join("/") === rel,
    });
    return await fsp.readFile(path.join(tmp, ...rel.split("/")), "utf8");
  } catch {
    return null;
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
}

/**
 * Stores the tarball `tarball` as the entry its `integrity` names, and answers the entry. The
 * tarball's bytes must hash to `integrity`, or nothing is stored (`PluginIntegrityMismatch`):
 * a tarball is checked wherever it came from. A content already stored is not written again.
 */
export async function storeTarball(
  root: string,
  tarball: string,
  integrity: string,
): Promise<StoredEntry> {
  const pkg = await readTarballPackageJson(tarball);
  const name = typeof pkg?.name === "string" ? pkg.name : null;
  const version = typeof pkg?.version === "string" ? pkg.version : null;
  if (pkg === null || name === null || version === null || !PACKAGE_NAME.test(name)) {
    throw new PluginStoreError(`${tarball}: no package.json with a package name and a version`);
  }
  if (version.includes("/") || version.includes("\\") || version.startsWith(".")) {
    throw new PluginStoreError(`${name}: '${version}' cannot name a directory`);
  }
  const actual = await tarballIntegrity(tarball);
  if (actual !== integrity) throw new PluginIntegrityMismatch(name, version, integrity, actual);
  const dest = storeEntryDir(root, name, version, integrity);
  const entry: StoredEntry = { name, version, integrity, dir: dest };
  if (isStored(dest)) {
    // A key is a prefix of the integrity; on a case-insensitive filesystem two keys differing
    // only in case meet in one directory. What is there must be this content.
    const there = await fsp.readFile(path.join(dest, MANIFEST_FILE), "utf8").then(
      (t) => parseToml(t).integrity,
      () => undefined,
    );
    if (there !== integrity) {
      throw new PluginStoreError(
        `${name}@${version}: ${dest} holds ${String(there)}, not ${integrity} (keys that differ only in case?)`,
      );
    }
    return entry;
  }
  const stage = await stagingDir(root);
  try {
    await fsp.copyFile(tarball, path.join(stage, TARBALL_FILE));
    await fsp.writeFile(
      path.join(stage, MANIFEST_FILE),
      stringifyToml(
        manifestOf(pkg, name, version, integrity) as unknown as Record<string, unknown>,
      ),
    );
    // Complete before it is in place: the rename below is the one step that stores it.
    await fsp.writeFile(path.join(stage, STORED_FILE), "");
    // A directory without the marker is a write that did not finish: discarded, not trusted.
    if (fs.existsSync(dest)) await discardDir(root, dest);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    try {
      await fsp.rename(stage, dest);
    } catch (err) {
      if (!isStored(dest)) throw err;
    }
    return entry;
  } finally {
    await fsp.rm(stage, { recursive: true, force: true });
  }
}

/** How a registry fetch puts `specifier`'s tarball into the directory `cwd`; injectable for tests. */
export type RegistryFetch = (specifier: string, cwd: string) => Promise<void>;

/** Long enough for a cold registry fetch; short enough not to hang a request. */
const FETCH_TIMEOUT_MS = 180_000;

/**
 * `npm pack <specifier>`: the registry's tarball of that version, as the registry serves it,
 * through the machine's npm configuration (registry, proxy, auth). Nothing is installed.
 */
const npmPack: RegistryFetch = async (specifier, cwd) => {
  try {
    const npm = npmCommand(["pack", "--", specifier]);
    await execFileAsync(npm.command, npm.args, {
      cwd,
      timeout: FETCH_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
      env: npmEnv(process.env),
      shell: npm.shell,
    });
  } catch (err) {
    if (err instanceof PluginInstallError) throw err;
    throw new PluginInstallError(npmReason((err as { stderr?: string }).stderr, err as Error));
  }
};

/**
 * Fetches `name@version` from the registry into the store, as the index row `expected` (its
 * npm integrity) names it: its tarball is fetched into a staging directory and stored only when
 * its bytes hash to `expected`. The staging directory is removed whatever happened.
 */
export function fetchIntoStore(
  root: string,
  specifier: string,
  { expected, fetch = npmPack }: { expected: string; fetch?: RegistryFetch },
): Promise<StoredEntry> {
  return onStoreQueue(async () => {
    const dir = await stagingDir(root);
    try {
      await fetch(specifier, dir);
      const tarball = (await fsp.readdir(dir)).find((f) => f.endsWith(".tgz"));
      if (tarball === undefined) {
        throw new PluginInstallError(`npm pack ${specifier} left no tarball`);
      }
      return await storeTarball(root, path.join(dir, tarball), expected);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
}

/** The directories of `dir` whose names do not start with a dot; empty when it cannot be read. */
async function subdirs(dir: string): Promise<string[]> {
  try {
    return (await fsp.readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Every entry directory of the store, complete or not, with the name, version and key it sits under. */
export async function storeEntryDirs(
  root: string,
  tree: string = pluginStoreDir(root),
): Promise<Array<{ name: string; version: string; key: string; dir: string }>> {
  const out: Array<{ name: string; version: string; key: string; dir: string }> = [];
  for (const { name, dir: nameDir } of await treeNames(tree)) {
    for (const version of await subdirs(nameDir)) {
      for (const key of await subdirs(path.join(nameDir, version))) {
        out.push({ name, version, key, dir: path.join(nameDir, version, key) });
      }
    }
  }
  return out;
}

/** Every complete entry in the store, as its manifest. */
export async function readStore(root: string): Promise<StoreIndexEntry[]> {
  const out: StoreIndexEntry[] = [];
  for (const { name, version, key, dir } of await storeEntryDirs(root)) {
    if (!isStored(dir)) continue;
    let manifest: Record<string, unknown>;
    try {
      manifest = parseToml(await fsp.readFile(path.join(dir, MANIFEST_FILE), "utf8"));
    } catch {
      continue;
    }
    // The path spells the entry: a manifest that disagrees with where it sits is skipped.
    const integrity = manifest.integrity;
    if (
      manifest.name !== name ||
      manifest.version !== version ||
      typeof integrity !== "string" ||
      entryKey(integrity) !== key
    ) {
      continue;
    }
    out.push(manifest as unknown as StoreIndexEntry);
  }
  return sortIndex(out);
}

/**
 * The program's entry file with its links resolved: the Docker image starts the CLI through
 * `/usr/local/bin/penguin`, a link to `/opt/penguin/lib/dist/penguin.js`, and npm's global
 * `bin/penguin` links into the package the same way — the installation is where the target
 * sits, not where the link does. Unresolvable (gone, or not a file): the path as given.
 */
export function programEntry(entry: string | undefined = process.argv[1]): string | undefined {
  if (typeof entry !== "string" || entry.length === 0) return undefined;
  try {
    return fs.realpathSync(entry);
  } catch {
    return entry;
  }
}

/**
 * The prefixes a build may carry, the running one first: the push's, then the installation's —
 * one directory above the directory of the program's real entry file.
 */
export function storeSources(
  assetsDir: string | null,
  entry: string | undefined = process.argv[1],
): string[] {
  const out: string[] = [];
  if (assetsDir !== null) out.push(path.join(unpackedAssetsDir(assetsDir), "plugins"));
  const program = programEntry(entry);
  if (program !== undefined) out.push(path.join(path.dirname(program), "..", "plugins"));
  return out;
}

/**
 * The plugins the running build lists: the prefix of the first of `storeSources` that has an
 * `index.json` (scripts/build-plugins.mjs writes it), with its rows. Null when none does — a
 * server run from source ships no prefix. The rows are as written; the registry validates them.
 *
 * A row is LISTED by the build; it is CARRIED only when its package sits in the prefix
 * (`carried`). The npm package of the CLI carries none: its prefix is the build's index alone,
 * so an npm install knows each plugin's content and fetches it from the registry on demand.
 */
export async function readShippedIndex(
  assetsDir: string | null,
): Promise<{ prefix: string; entries: unknown[] } | null> {
  for (const prefix of storeSources(assetsDir)) {
    let text: string;
    try {
      text = await fsp.readFile(path.join(prefix, INDEX_FILE), "utf8");
    } catch {
      continue;
    }
    const entries = JSON.parse(text) as unknown;
    if (!Array.isArray(entries))
      throw new PluginStoreError(`${prefix}/${INDEX_FILE}: not an array`);
    return { prefix, entries };
  }
  return null;
}

/** Where a listed row's tarball sits in its bundled plugin directory, when the build carries it. */
export function carriedTarball(prefix: string, name: string, version: string): string {
  return path.join(prefix, tarballFileName(name, version));
}

/** The rows whose tarball the directory carries; a row it only lists is fetched from the registry. */
function carried(index: { prefix: string; entries: unknown[] }): unknown[] {
  return index.entries.filter((row) => {
    const { name, version } = row as { name?: unknown; version?: unknown };
    return (
      typeof name === "string" &&
      typeof version === "string" &&
      fs.existsSync(carriedTarball(index.prefix, name, version))
    );
  });
}

let chain: Promise<unknown> = Promise.resolve();

/**
 * Runs `fn` after every store write and sweep queued before it, and before any queued after:
 * the one order the store's writers and its sweep keep within the process. A failure is the
 * caller's; the queue goes on.
 */
export function onStoreQueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * Stores every plugin the running build carries that is not stored yet, under the integrity
 * its index row names, and answers the integrities of those it carries. On the store's
 * queue, best effort: a failure is logged and never fails the boot — a package that did not
 * reach the store is reported by the activation that cannot find it (plugin/activation.ts).
 */
export async function syncPluginStore(
  root: string,
  assetsDir: string | null,
  log: (message: string) => void = (m) => console.warn(m),
): Promise<Set<string>> {
  const shipped = new Set<string>();
  await onStoreQueue(async () => {
    const index = await readShippedIndex(assetsDir);
    for (const row of index === null ? [] : carried(index)) {
      const { name, version, integrity } = row as Partial<Record<string, unknown>>;
      if (typeof name !== "string" || typeof version !== "string") continue;
      if (typeof integrity !== "string" || entryKey(integrity) === null) continue;
      shipped.add(integrity);
      if (isStored(storeEntryDir(root, name, version, integrity))) continue;
      try {
        await storeTarball(root, carriedTarball(index!.prefix, name, version), integrity);
      } catch (err) {
        log(`[plugin-store] ${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }).catch((err: unknown) => {
    log(`[plugin-store] ${err instanceof Error ? err.message : String(err)}`);
  });
  return shipped;
}

/** The names the running build ships: the rows its prefix carries, not those it only lists. */
export async function shippedNames(assetsDir: string | null): Promise<string[]> {
  const index = await readShippedIndex(assetsDir).catch(() => null);
  const names = (index === null ? [] : carried(index)).flatMap((row) => {
    const name = (row as { name?: unknown }).name;
    return typeof name === "string" ? [name] : [];
  });
  return [...new Set(names)].sort();
}
