/**
 * The DSH chain sandbox-dsh runs, carried inside the plugin's own package as
 * `dist/node_modules/` — so the package loads wherever it is unpacked, with nothing installed
 * beside it. Node resolves `dist/index.js`'s imports from `dist/node_modules` first.
 *
 * Why a nested tree rather than a bundle: the chain finds its parts by path at run time. It
 * spawns the Windows ACL runner as a file (`import.meta.resolve(".../runner")`), koffi loads
 * its native module from `../../../@koromix/koffi-<os>-<cpu>` relative to its own source, and
 * the Landlock launcher is a binary resolved from `node-addon-landlock-run-<os>-<cpu>`. A
 * bundle breaks all three; npm's `bundleDependencies` would keep them, but pnpm refuses it
 * under the workspace's isolated linker.
 *
 * koffi is not Windows-only in practice: dsh-sandbox-local imports the Windows ACL package
 * statically, which builds koffi types at import time, so every platform loads koffi's native
 * module — and the per-platform packages of every target below are carried.
 *
 * The tree is exactly what pnpm-lock.yaml resolves: the closure of the carried packages is read
 * from the lockfile's snapshots, npm installs those exact versions, and any package npm puts in
 * the tree that the closure does not name (or names at another version) fails the build. So does
 * any package whose content differs from the lockfile's: the integrity npm records for each
 * tarball it installed (its hidden `.package-lock.json`) must equal the `resolution.integrity`
 * pnpm-lock.yaml pins for that `name@version`, so a republished or tampered tarball cannot pass
 * under a locked version number.
 *
 * npm installs from the registry, so the build needs registry access (the npm cache serves a
 * repeat build).
 *
 * Beside the tree it writes `dist/THIRD_PARTY_NOTICES.md` (scripts/lib/third-party-notices.mjs):
 * each carried package's license id, source and full license text, which the MIT and BSD
 * licenses of the chain require to travel with every copy. A package without license text fails
 * the build.
 *
 * Usage (run by the package's build, after tsup):
 *   node scripts/vendor-dsh-deps.mjs        vendor into plugins/sandbox-dsh/dist/node_modules/
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./lib/run-command.mjs";
import { readVendoredPackages, thirdPartyNotices } from "./lib/third-party-notices.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "plugins", "sandbox-dsh", "dist", "node_modules");
const NOTICES = path.join(ROOT, "plugins", "sandbox-dsh", "dist", "THIRD_PARTY_NOTICES.md");
const NOTICES_MODULE = fileURLToPath(new URL("./lib/third-party-notices.mjs", import.meta.url));
/** Beside the repository's node_modules, so the finished tree is renamed into place, not copied. */
const CACHE = path.join(ROOT, "node_modules", ".cache");
/** What `src/index.ts` imports; the rest of the chain follows from the lockfile. */
const CARRIED = ["@deepseek-ai/cordis", "@deepseek-ai/dsh-sandbox-local"];
/** The hosts the package may land on. */
const TARGETS = ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64", "win32-x64"];

const yaml = createRequire(path.join(ROOT, "packages", "core", "package.json"))("yaml");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/** The parsed pnpm-lock.yaml. */
function readLock() {
  return yaml.parse(fs.readFileSync(path.join(ROOT, "pnpm-lock.yaml"), "utf8"));
}

/** `name` → `version` of every package the carried ones need, as pnpm-lock.yaml resolves them. */
function lockedClosure(lock) {
  const importer = lock.importers["plugins/sandbox-dsh"];
  const deps = { ...importer.dependencies, ...importer.devDependencies };
  const queue = CARRIED.map((name) => [name, deps[name].version]);
  const closure = new Map();
  for (const [name, ref] of queue) {
    const version = ref.replace(/\(.*$/, ""); // `0.1.0-rc.7(<peers>)` → `0.1.0-rc.7`
    const { os, cpu } = lock.packages[`${name}@${version}`];
    // A platform package for none of the targets (koffi's freebsd builds, say) stays behind.
    const forTarget = (t) =>
      os.includes(t.split("-")[0]) && (!cpu || cpu.includes(t.split("-")[1]));
    if (os && !TARGETS.some(forTarget)) continue;
    if (closure.has(name)) {
      if (closure.get(name) !== version) throw new Error(`${name}: two versions in the closure`);
      continue;
    }
    closure.set(name, version);
    const snapshot = lock.snapshots[`${name}@${ref}`] ?? {};
    for (const next of [snapshot.dependencies, snapshot.optionalDependencies]) {
      queue.push(...Object.entries(next ?? {}));
    }
  }
  return closure;
}

/**
 * What the build's output depends on besides this plugin's own sources: this script, the notices
 * module it writes THIRD_PARTY_NOTICES.md with, and the lockfile entries it reads (each carried package's `name@version` and integrity) — the cache
 * key scripts/build-plugins.mjs folds in for the package whose build runs this script.
 */
export function vendorCacheInputs() {
  const lock = readLock();
  const entries = [...lockedClosure(lock)].map(
    ([name, version]) => `${name}@${version} ${lockedIntegrity(lock, name, version)}`,
  );
  const sources = [fileURLToPath(import.meta.url), NOTICES_MODULE].map((f) =>
    fs.readFileSync(f, "utf8"),
  );
  return [...sources, ...entries.sort()].join("\0");
}

/** The `resolution.integrity` pnpm-lock.yaml pins for `name@version`, if any. */
function lockedIntegrity(lock, name, version) {
  return lock.packages?.[`${name}@${version}`]?.resolution?.integrity;
}

/**
 * Every way npm's installed tree departs from pnpm-lock.yaml by content, as messages (empty when
 * none). `npmLock` is npm's hidden lockfile (`node_modules/.package-lock.json`): each installed
 * package keyed by its path, with the integrity of the tarball npm verified on download.
 */
export function integrityMismatches(lock, closure, npmLock) {
  const problems = [];
  const seen = new Set();
  for (const [key, entry] of Object.entries(npmLock.packages ?? {})) {
    if (key === "") continue; // the staging directory's own manifest
    const name = entry.name ?? key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
    const id = `${name}@${entry.version}`;
    seen.add(name);
    if (closure.get(name) !== entry.version) {
      problems.push(`${id}: not in the locked closure`);
      continue;
    }
    const want = lockedIntegrity(lock, name, entry.version);
    if (want === undefined) problems.push(`${id}: pnpm-lock.yaml records no integrity`);
    else if (entry.integrity !== want) {
      problems.push(`${id}: npm installed ${entry.integrity ?? "(no integrity)"}, locked ${want}`);
    }
  }
  for (const [name, version] of closure) {
    if (!seen.has(name)) problems.push(`${name}@${version}: not in npm's lockfile`);
  }
  return problems;
}

export async function vendorDshDeps() {
  const lock = readLock();
  const closure = lockedClosure(lock);
  await fsp.mkdir(CACHE, { recursive: true });
  const stage = await fsp.mkdtemp(path.join(CACHE, "penguin-dsh-deps-"));
  try {
    await fsp.writeFile(path.join(stage, "package.json"), '{ "private": true }\n');
    // Every package named at its locked version, so npm resolves nothing itself. --force is what
    // makes npm accept a package whose `os`/`cpu` is not this machine's.
    const specs = [...closure].map(([name, version]) => `${name}@${version}`);
    run(
      "npm",
      [
        "install",
        "--force",
        "--omit=dev",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--",
        ...specs,
      ],
      stage,
    );
    const packages = readVendoredPackages(path.join(stage, "node_modules"));
    const tree = packages.map((p) => [p.name, p.version]);
    const wrong = tree.filter(([name, version]) => closure.get(name) !== version);
    const missing = [...closure.keys()].filter((name) => !tree.some(([n]) => n === name));
    if (wrong.length > 0 || missing.length > 0) {
      throw new Error(
        `vendor-dsh-deps: npm's tree differs from pnpm-lock.yaml — not locked: ${wrong.map((p) => p.join("@")).join(", ") || "none"}; missing: ${missing.join(", ") || "none"}`,
      );
    }
    const npmLockFile = path.join(stage, "node_modules", ".package-lock.json");
    const mismatches = integrityMismatches(lock, closure, readJson(npmLockFile));
    if (mismatches.length > 0) {
      throw new Error(
        `vendor-dsh-deps: npm's tree differs from pnpm-lock.yaml by content:\n  ${mismatches.join("\n  ")}`,
      );
    }
    // Before the old tree is replaced, so a package without license text leaves dist as it was.
    const notices = thirdPartyNotices(packages, {
      carrier: "@penguinharness/sandbox-dsh",
      location: "dist/node_modules/",
    });
    await fsp.rm(path.join(stage, "node_modules", ".bin"), { recursive: true, force: true });
    await fsp.rm(npmLockFile, { force: true });
    await fsp.rm(OUT, { recursive: true, force: true });
    await fsp.rename(path.join(stage, "node_modules"), OUT);
    await fsp.writeFile(NOTICES, notices);
  } finally {
    await fsp.rm(stage, { recursive: true, force: true });
  }
  return OUT;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`[vendor-dsh-deps] ready: ${await vendorDshDeps()}`);
}
