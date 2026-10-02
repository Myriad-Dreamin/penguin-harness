/**
 * One plugin entry — one package at one version with one content — as the build, a machine's
 * plugin store and the index repository (Prism-Shadow/penguin-plugins) all file it:
 *
 *   packages/[<@scope>/]<bucket>/<name>/<version>/<key>/
 *     manifest.toml      the index manifest, `integrity` required
 *     package.tgz        the package's tarball — the bytes `integrity` is the sha512 of
 *
 * A plugin packs itself: its tarball is the whole of it, and nothing here installs what it
 * declares as dependencies. A machine unpacks an entry under the same path in
 * `<data root>/plugins/` to load it (packages/server/src/plugin/activation.ts).
 *
 * The bucket keeps every directory narrow however many plugins there are. It is read off the
 * name without its scope, lower-cased, the way the crates.io index files a crate: a name of 1
 * or 2 characters sits in `1` or `2`, one of 3 in `3/<first character>`, a longer one in
 * `<characters 1–2>/<characters 3–4>` — `@penguinharness/sandbox-bwrap` is under
 * `packages/@penguinharness/sa/nd/sandbox-bwrap/`. The index repository has a line-for-line
 * copy of this rule (`plugin-index/src/entry.ts`); both test the same path vectors.
 *
 * Plain JavaScript because scripts/build-plugins.mjs runs it directly and the server bundles
 * it (packages/server/src/plugin/store.ts); the types are in plugin-entry.d.mts.
 *
 * THE KEY IS THE CONTENT, AND THE CONTENT IS NPM'S. `integrity` is npm's own `dist.integrity`:
 * `sha512-<base64>` of the bytes of the tarball the registry serves — the value in the registry's
 * metadata and in every npm lockfile, which anyone can check with `npm view <name>@<version>
 * dist.integrity`. The build computes it over the very tarball it publishes; a machine checks
 * every tarball against it before storing it (`tarballIntegrity`).
 * An entry's directory, its KEY, is the integrity's own first 16 base64 characters made path
 * safe (`+` → `-`, `/` → `_`, as base64url writes them): `sha512-I9XMINsuCWQOUXWr…` is filed
 * under `I9XMINsuCWQOUXWr/`, so a directory and the integrity it holds read alike. Base64 is
 * case-sensitive and a case-insensitive filesystem (macOS, Windows) is not: two keys differing
 * only in case would share a directory. Sixteen characters keep that out of reach (over 80
 * bits survive case folding), and the store checks a found entry's manifest anyway.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export const MANIFEST_FILE = "manifest.toml";
/** An entry's tarball. */
export const TARBALL_FILE = "package.tgz";
/** An unpacked entry's package directory: the top directory of every npm tarball. */
export const PACKAGE_DIR = "package";
/** The flat listing rebuilt from a tree, beside it. */
export const INDEX_FILE = "index.json";

/** `sha512-<base64 of 64 bytes>`: an entry's integrity, npm's `dist.integrity`. */
export const INTEGRITY = /^sha512-([A-Za-z0-9+/]{86}==)$/;
/** How many base64 characters of the integrity name an entry's directory. */
export const KEY_LENGTH = 16;

const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** The directory key of an integrity: its first 16 base64 characters, path safe; null when malformed. */
export function entryKey(integrity) {
  const b64 = INTEGRITY.exec(integrity)?.[1];
  return b64 === undefined
    ? null
    : b64.slice(0, KEY_LENGTH).replace(/\+/g, "-").replace(/\//g, "_");
}

/** npm's integrity of a tarball file: `sha512-<base64>` of its bytes (what `dist.integrity` is). */
export async function tarballIntegrity(file) {
  const hash = createHash("sha512");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return `sha512-${hash.digest("base64")}`;
}

/**
 * The file name `npm pack` gives a package's tarball: the name without its scope's `@`, `/` as
 * `-`, then `-<version>.tgz` — `@penguinharness/sandbox-bwrap` 0.2.3 is
 * `penguinharness-sandbox-bwrap-0.2.3.tgz`. A build's bundled plugin directory holds them so.
 */
export function tarballFileName(name, version) {
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
}

/** The directory under a tree root that holds every entry: `<root>/packages`. */
export const PACKAGES_DIR = "packages";

/** The bucket directories of a package name, as path segments (see the header). */
export function bucketOf(name) {
  const bare = (name.startsWith("@") ? name.slice(name.indexOf("/") + 1) : name).toLowerCase();
  if (bare.length <= 2) return [String(bare.length)];
  if (bare.length === 3) return ["3", bare[0]];
  return [bare.slice(0, 2), bare.slice(2, 4)];
}

/** Where a package name's entries sit under a tree root, as posix segments: `packages/…/<name>`. */
export function nameSegments(name) {
  const parts = name.split("/");
  const bare = parts[parts.length - 1];
  const scope = parts.length === 2 ? [parts[0]] : [];
  return [PACKAGES_DIR, ...scope, ...bucketOf(name), bare];
}

/** An entry's directory under a tree root: `<root>/packages/…/<name>/<version>/<key>`. */
export function entryDir(root, name, version, integrity) {
  const key = entryKey(integrity);
  if (key === null) throw new Error(`'${integrity}' is not a sha512 integrity`);
  return path.join(root, ...nameSegments(name), version, key);
}

/** The subdirectories of `dir` whose names do not start with a dot; empty when it cannot be read. */
async function subdirs(dir) {
  try {
    return (await fsp.readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort(byCodeUnit);
  } catch {
    return [];
  }
}

/**
 * Every package name a tree root files entries under, with its directory, sorted. A directory
 * whose place does not spell its name's bucket is not a name (the path is the entry): it is
 * left out, as is anything outside `packages/`.
 */
export async function treeNames(root) {
  const packages = path.join(root, PACKAGES_DIR);
  const out = [];
  const containers = [{ scope: null, dir: packages }];
  for (const top of await subdirs(packages)) {
    if (top.startsWith("@")) containers.push({ scope: top, dir: path.join(packages, top) });
  }
  for (const { scope, dir } of containers) {
    for (const b1 of await subdirs(dir)) {
      if (b1.startsWith("@")) continue;
      // `1` and `2` hold names directly; `3` and a two-character bucket have a second level.
      const levels =
        b1 === "1" || b1 === "2"
          ? [[b1]]
          : (await subdirs(path.join(dir, b1))).map((b2) => [b1, b2]);
      for (const bucket of levels) {
        for (const bare of await subdirs(path.join(dir, ...bucket))) {
          const name = scope === null ? bare : `${scope}/${bare}`;
          if (bucketOf(name).join("/") !== bucket.join("/")) continue;
          out.push({ name, dir: path.join(dir, ...bucket, bare) });
        }
      }
    }
  }
  return out.sort((a, b) => byCodeUnit(a.name, b.name));
}

/** The package.json under `dir`, or null. */
export async function readPackageJson(dir) {
  try {
    return JSON.parse(await fsp.readFile(path.join(dir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

/** An author as the index repository writes one: a display name, optionally `<contact>`. */
function authorOf(value) {
  if (typeof value === "string") return value.trim() === "" ? null : value.trim();
  if (value === null || typeof value !== "object") return null;
  if (typeof value.name !== "string" || value.name.trim() === "") return null;
  const contact =
    typeof value.email === "string"
      ? value.email
      : typeof value.url === "string"
        ? value.url
        : null;
  return contact === null ? value.name.trim() : `${value.name.trim()} <${contact}>`;
}

const strings = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === "string") : []);

/**
 * The index manifest of a package, from its own package.json, with `integrity`. `categories`
 * is the package's own top-level field (the shape VS Code's extension manifests use): npm
 * has no such field, and the index needs one to group the catalogue.
 */
export function manifestOf(pkg, name, version, integrity) {
  const authors = [pkg.author, ...(Array.isArray(pkg.contributors) ? pkg.contributors : [])]
    .map(authorOf)
    .filter((a) => a !== null);
  const repository =
    typeof pkg.repository === "string"
      ? pkg.repository
      : pkg.repository !== null &&
          typeof pkg.repository === "object" &&
          typeof pkg.repository.url === "string"
        ? pkg.repository.url.replace(/^git\+/, "")
        : undefined;
  const keywords = strings(pkg.keywords);
  const categories = strings(pkg.categories);
  return {
    name,
    version,
    description: typeof pkg.description === "string" ? pkg.description : "",
    authors,
    license: typeof pkg.license === "string" ? pkg.license : "",
    ...(repository !== undefined ? { repository } : {}),
    ...(typeof pkg.homepage === "string" ? { homepage: pkg.homepage } : {}),
    ...(keywords.length > 0 ? { keywords } : {}),
    ...(categories.length > 0 ? { categories } : {}),
    integrity,
  };
}

/** Index entries in the order a tree's index is written: name, then version, then integrity. */
export function sortIndex(entries) {
  return [...entries].sort(
    (a, b) =>
      byCodeUnit(a.name, b.name) ||
      byCodeUnit(a.version, b.version) ||
      byCodeUnit(a.integrity, b.integrity),
  );
}
