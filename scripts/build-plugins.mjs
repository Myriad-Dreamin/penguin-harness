/**
 * The builtin plugins, shipped as the npm packages they are: every `plugins/*` package with
 * a code entry is built by its own `build` script, packed by `pnpm pack` — exactly what
 * `npm publish` would send — and installed by npm into a staging directory laid out as an npm
 * prefix (`<out>/package.json` + `<out>/node_modules/<name>/…`, dependencies included). That
 * prefix is the one shape both consumers resolve from: the hot push ships it under `plugins/`
 * in its assets, the desktop build stages it beside `skills/`.
 *
 * Nothing about a package is rewritten. Its `package.json`, its `exports`, its `dist/` and its
 * `README.md` reach the target as the package's own build produced them; a dependency it
 * declares is installed beside it the way npm installs it anywhere. The SDK's runtime is not
 * among those dependencies — a plugin compiles against `@prismshadow/penguin-core`'s types
 * (a devDependency) and shares the host's copy at run time.
 *
 * A builtin plugin bundles what it runs. Every file in the prefix is a blob a push carries
 * separately, so an npm dependency tree (a grammar collection, a web framework's CJS, ESM and
 * type copies) turns one plugin into hundreds of small transfers. Its own build compiles its
 * pure-JS dependencies into `dist/`, and what cannot be bundled (code that finds its parts by
 * path at run time, per-platform native binaries) it carries inside its own package, the way
 * sandbox-dsh carries its DSH chain as `dist/node_modules` (scripts/vendor-dsh-deps.mjs). A
 * package declaring any runtime dependency fails this build before anything is packed.
 *
 * THE BUILTIN INDEX IS THE BUILD'S. Every package the prefix ships is also laid out as a
 * store entry — `<name>/<version>/<hash16>/manifest.toml + package/`, the
 * shape of a machine's plugin store and of the index repository (scripts/plugin-entry.mjs) —
 * in a tree beside the prefix, and `index.json` is rebuilt from that tree into the prefix. So
 * the index travels with the build, each entry's `integrity` is the one a machine computes
 * when it stores the shipped package, and nobody writes it by hand.
 *
 * Cached by content: the hash over every plugin's `src/`, `package.json`, `README.md`,
 * `tsup.config.ts`, the scripts its build runs and the lockfile entries those vendor from names a
 * directory under `node_modules/.cache/penguin-plugins/`, and an unchanged set is not built,
 * packed or installed again — a push of an unrelated change costs nothing here. sandbox-dsh's
 * build installs its DSH chain from the npm registry, so a build that is not cached needs
 * registry access.
 *
 * THE INDEX'S INTEGRITY IS THE PUBLISHED TARBALL'S. Each plugin is packed once; the tarball is
 * kept beside the prefix in the cache, its npm integrity (sha512 of its bytes, what the registry
 * reports as `dist.integrity`) is the one the index names, and the release publishes that very
 * file (`--tarballs`) rather than letting a publish command pack again — two packers pick the
 * same files and still write different bytes.
 *
 * Usage (a library for deploy.mjs / desktop build-assets.mjs, and a CLI):
 *   node scripts/build-plugins.mjs --out <dir>         stage the prefix into <dir>
 *   node scripts/build-plugins.mjs --tarballs <dir>    copy the packed tarballs into <dir>
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INDEX_FILE, layOutEntry, entryDir, sortIndex, tarballIntegrity } from "./plugin-entry.mjs";
import { run } from "./lib/run-command.mjs";
import { vendorCacheInputs } from "./vendor-dsh-deps.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGINS_SRC = path.join(ROOT, "plugins");
const CACHE = path.join(ROOT, "node_modules", ".cache", "penguin-plugins");
const COMPLETE = ".complete";
/** Folded into the cache key: bump when what this script WRITES changes, not only what it reads. */
const PACK_FORMAT = 17;
// The server's own dependency: the store writes its manifests with the same library.
const { stringify: stringifyToml } = createRequire(
  path.join(ROOT, "packages", "server", "package.json"),
)("smol-toml");
/** The prefix's own manifest: npm needs one above `node_modules`, and it is ours, never a package's. */
const PREFIX_MANIFEST = { name: "penguin-builtin-plugins", private: true, version: "0.0.0" };
/** What npm leaves in the prefix that is not a package: its hidden lockfile. Never shipped. */
const NOT_SHIPPED = new Set(["node_modules/.package-lock.json"]);

/** Files under `dir`, as sorted relative posix paths (symlinks — `.bin` shims — excluded). */
async function walk(dir, prefix = "") {
  const out = [];
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    const rel = prefix === "" ? e.name : `${prefix}/${e.name}`;
    if (e.isDirectory()) out.push(...(await walk(path.join(dir, e.name), rel)));
    else if (e.isFile()) out.push(rel);
  }
  return out.sort();
}

/**
 * What a plugin's pack depends on: its sources, its manifest, its README, its build config —
 * and every other directory the package SHIPS.
 *
 * That last part is not decoration. A plugin may carry files its code never imports (the Windows
 * backend ships the PowerShell script its setup runs), and hashing only `src/` meant editing one
 * of them changed nothing the cache could see: the build happily served a stale pack, and the
 * fix nobody could find on the host was a file that had never left this machine.
 *
 * The same holds for the repository scripts the package's `build` runs (`../../scripts/*.mjs`):
 * they write into `dist/`, so their source is hashed — and for scripts/vendor-dsh-deps.mjs, the
 * pnpm-lock.yaml entries it vendors from, so a lockfile bump of the DSH chain rebuilds the pack.
 */
async function sourceHash(dir, into) {
  for (const rel of ["package.json", "README.md", "tsup.config.ts"]) {
    const file = path.join(dir, rel);
    if (fs.existsSync(file))
      into
        .update(rel)
        .update("\0")
        .update(await fsp.readFile(file))
        .update("\0");
  }
  const manifest = JSON.parse(await fsp.readFile(path.join(dir, "package.json"), "utf8"));
  const buildScripts = [...(manifest.scripts?.build ?? "").matchAll(/scripts\/([\w.-]+\.mjs)/g)];
  for (const script of [...new Set(buildScripts.map((m) => m[1]))].sort()) {
    into
      .update(`scripts/${script}`)
      .update("\0")
      .update(await fsp.readFile(path.join(ROOT, "scripts", script)))
      .update("\0");
    if (script === "vendor-dsh-deps.mjs") into.update(vendorCacheInputs()).update("\0");
  }
  // `dist` and `vendor` are built or fetched from what is hashed here, never edited by hand.
  const shipped = (manifest.files ?? []).filter((f) => !["dist", "vendor"].includes(f));
  for (const name of ["src", ...shipped]) {
    const sub = path.join(dir, name);
    if (!fs.existsSync(sub) || !fs.statSync(sub).isDirectory()) continue;
    for (const rel of await walk(sub)) {
      into
        .update(`${name}/${rel}`)
        .update("\0")
        .update(await fsp.readFile(path.join(sub, rel)))
        .update("\0");
    }
  }
}

/** Every plugin package under `plugins/`: a package.json that declares `penguin`. */
async function pluginPackages() {
  const out = [];
  const entries = fs.existsSync(PLUGINS_SRC) ? await fsp.readdir(PLUGINS_SRC) : [];
  for (const dirName of entries.sort()) {
    const dir = path.join(PLUGINS_SRC, dirName);
    const manifestFile = path.join(dir, "package.json");
    if (!fs.existsSync(manifestFile)) continue;
    const pkg = JSON.parse(await fsp.readFile(manifestFile, "utf8"));
    // A package with a code entry is built and packed; one without (skills, hooks) carries no code.
    if (pkg.main === undefined && pkg.exports === undefined) continue;
    const unbundled = Object.keys(pkg.dependencies ?? {});
    if (unbundled.length > 0) {
      throw new Error(
        `${pkg.name} declares runtime dependencies ${unbundled.join(", ")}: a builtin plugin ` +
          "declares none. It bundles what it runs (tsup noExternal, the package a " +
          "devDependency), and carries what cannot be bundled inside its own package (as " +
          "sandbox-dsh carries dist/node_modules, scripts/vendor-dsh-deps.mjs).",
      );
    }
    out.push({ name: pkg.name, version: pkg.version, dir });
  }
  return out;
}

/**
 * Builds, packs and installs every builtin plugin into one staged prefix (from cache when
 * nothing changed) and returns `{ dir, files, plugins }`: the prefix directory, the relative
 * paths to ship, and `[{ name, version }]` of what it holds.
 */
export async function buildBuiltinPlugins({ log = () => {} } = {}) {
  const plugins = await pluginPackages();
  const h = createHash("sha256").update(`pack ${PACK_FORMAT}\0`);
  for (const plugin of plugins) {
    h.update(plugin.name).update("\0");
    await sourceHash(plugin.dir, h);
  }
  const hash = h.digest("hex").slice(0, 16);
  const out = path.join(CACHE, hash);
  if (fs.existsSync(path.join(out, COMPLETE))) {
    log(`${plugins.length} builtin plugins: cached (${hash})`);
  } else {
    await fsp.rm(out, { recursive: true, force: true });
    await fsp.mkdir(out, { recursive: true });
    const packed = tarballsOf(out);
    await fsp.rm(packed, { recursive: true, force: true });
    await fsp.mkdir(packed, { recursive: true });
    try {
      const tarballs = [];
      for (const plugin of plugins) {
        // The package's own build, then the package as npm would publish it (`files` honored,
        // `workspace:` ranges rewritten) — nothing this script decides.
        run("pnpm", ["--filter", plugin.name, "run", "build"], ROOT);
        run("pnpm", ["pack", "--pack-destination", packed], plugin.dir);
        const tarball = (await fsp.readdir(packed)).find(
          (f) => f.endsWith(".tgz") && !tarballs.some((t) => path.basename(t) === f),
        );
        if (tarball === undefined) throw new Error(`pnpm pack left no tarball for ${plugin.name}`);
        tarballs.push(path.join(packed, tarball));
        log(`plugin ${plugin.name}@${plugin.version}: packed`);
      }
      // The manifest names what is shipped — how the loader tells the plugins from what npm
      // installs beside them — and --no-save below keeps npm from rewriting it.
      const dependencies = Object.fromEntries(plugins.map((p) => [p.name, p.version]));
      await fsp.writeFile(
        path.join(out, "package.json"),
        `${JSON.stringify({ ...PREFIX_MANIFEST, dependencies }, null, 2)}\n`,
      );
      if (tarballs.length > 0) {
        // npm installs the packages and their dependencies into the prefix; --no-save keeps
        // the prefix's manifest ours (no `file:` paths into a temp directory), --omit=dev
        // leaves the SDK's types and the build tools behind.
        run(
          "npm",
          [
            "install",
            "--no-save",
            "--no-package-lock",
            "--omit=dev",
            "--no-audit",
            "--no-fund",
            "--ignore-scripts",
            "--",
            ...tarballs,
          ],
          out,
        );
      }
      // npm installs a package's files with the mode it pleases, and a vendored program
      // arrives without its exec bit — which no consumer of the prefix can guess back.
      for (const rel of await walk(out)) {
        if (/(^|\/)vendor\/[^/]+\/bin\/[^/]+$/.test(rel)) {
          await fsp.chmod(path.join(out, rel), 0o755);
        }
      }
      const index = await layOutTree(out, treeOf(out), plugins, await packedIntegrities(packed));
      await fsp.writeFile(path.join(out, INDEX_FILE), `${JSON.stringify(index, null, 2)}\n`);
      log(`${index.length} index entries: rebuilt from the tree`);
      await fsp.writeFile(path.join(out, COMPLETE), hash);
      log(`${plugins.length} builtin plugins: installed (${hash})`);
    } catch (err) {
      await fsp.rm(out, { recursive: true, force: true });
      await fsp.rm(treeOf(out), { recursive: true, force: true });
      await fsp.rm(packed, { recursive: true, force: true });
      throw err;
    }
  }
  const files = (await walk(out)).filter((f) => f !== COMPLETE && !NOT_SHIPPED.has(f));
  return {
    dir: out,
    files,
    plugins: plugins.map(({ name, version }) => ({ name, version })),
    tree: treeOf(out),
    tarballs: tarballsOf(out),
  };
}

/** Where a prefix's packed tarballs are kept: beside it in the cache, never shipped. */
function tarballsOf(prefix) {
  return `${prefix}.tarballs`;
}

/** Each packed tarball's npm integrity, by the package name its own manifest gives. */
async function packedIntegrities(dir) {
  const out = new Map();
  for (const file of (await fsp.readdir(dir)).filter((f) => f.endsWith(".tgz")).sort()) {
    const abs = path.join(dir, file);
    const manifest = JSON.parse(
      execFileSync("tar", ["-xzOf", abs, "package/package.json"], { encoding: "utf8" }),
    );
    out.set(manifest.name, await tarballIntegrity(abs));
  }
  return out;
}

/** The store-shaped tree of a prefix: beside it in the cache, never shipped. */
function treeOf(prefix) {
  return `${prefix}.tree`;
}

/**
 * Lays every plugin the prefix ships out as a store entry under `tree` — the same module a
 * machine's store writes its entries with — and answers the index rebuilt from the tree:
 * each entry's `manifest.toml`, sorted as every index is.
 */
async function layOutTree(prefix, tree, plugins, integrities) {
  await fsp.rm(tree, { recursive: true, force: true });
  const stage = path.join(tree, ".staging");
  const index = [];
  for (const plugin of plugins) {
    await fsp.rm(stage, { recursive: true, force: true });
    await fsp.mkdir(stage, { recursive: true });
    const pkgDir = path.join(prefix, "node_modules", ...plugin.name.split("/"));
    const integrity = integrities.get(plugin.name);
    if (integrity === undefined)
      throw new Error(`${plugin.name}: no packed tarball to take its integrity from`);
    const laid = await layOutEntry(stage, pkgDir, prefix, { stringifyToml, integrity });
    const dest = entryDir(tree, laid.name, laid.version, laid.integrity);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.rename(stage, dest);
    index.push(laid.manifest);
  }
  await fsp.rm(stage, { recursive: true, force: true });
  const rebuilt = sortIndex(index);
  await fsp.writeFile(path.join(tree, INDEX_FILE), `${JSON.stringify(rebuilt, null, 2)}\n`);
  return rebuilt;
}

/** The prefix as a file map, relative to the prefix, each value an absolute source path. */
export function prefixLayout(built) {
  return new Map(built.files.map((rel) => [rel, { path: path.join(built.dir, rel) }]));
}

/** Writes the prefix into `dest`, replacing what was there. */
export async function stagePrefix(built, dest) {
  await fsp.rm(dest, { recursive: true, force: true });
  for (const [rel, source] of prefixLayout(built)) {
    const target = path.join(dest, ...rel.split("/"));
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(source.path, target);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outIdx = process.argv.indexOf("--out");
  const out = outIdx === -1 ? null : process.argv[outIdx + 1];
  const tarIdx = process.argv.indexOf("--tarballs");
  const tarDest = tarIdx === -1 ? null : process.argv[tarIdx + 1];
  const built = await buildBuiltinPlugins({ log: (m) => console.log(`[build-plugins] ${m}`) });
  if (tarDest) {
    const dest = path.resolve(tarDest);
    await fsp.rm(dest, { recursive: true, force: true });
    await fsp.mkdir(dest, { recursive: true });
    const files = (await fsp.readdir(built.tarballs)).filter((f) => f.endsWith(".tgz"));
    for (const f of files) await fsp.copyFile(path.join(built.tarballs, f), path.join(dest, f));
    console.log(`[build-plugins] copied ${files.length} packed tarballs into ${dest}`);
  }
  if (out) {
    await stagePrefix(built, path.resolve(out));
    console.log(
      `[build-plugins] staged ${built.plugins.length} plugins (${built.files.length} files) into ${path.resolve(out)}`,
    );
  }
}
