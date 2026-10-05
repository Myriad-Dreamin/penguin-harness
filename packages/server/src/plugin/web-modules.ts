/**
 * The enabled plugins' web modules, forwarded: for every plugin this process loaded, the modules
 * its generated `ifaces.json` places on the web side (`side: "web"`, scripts/gen-ifaces.mjs),
 * with the URLs of their built files. Nothing here reads a slot or checks a manifest — the web
 * app does both against its own tree — so a new web slot needs nothing from the server.
 *
 * A package's built web files (`dist/web/`, scripts/build-plugin.mjs) are served under a build
 * id, a hash of their contents: `/api/plugins/<package>/web/<build>/<file>`. The id changes with
 * any byte, so the files are cached for good, and a page holding an old id after a rebuild gets
 * 404 for it rather than a mix of two builds (http/routes/plugin-ui.ts).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { WebModulePackage } from "../api/web-modules.js";
import { IFACES_FILE } from "./loader.js";

/** Where a package's built web files live, relative to the package. Same as lib/plugin-sides.mjs. */
export const WEB_DIR = "dist/web";
/** The stylesheet the plugin build emits beside the modules when the package has one. */
const STYLES_FILE = "styles.css";
/** Beside it, the class prefix the build put its classes under (scripts/build-plugin.mjs STYLES_META). */
const STYLES_META = "styles.json";

/** The prefix a built web directory's STYLES_META names, or undefined when it names none. */
function stylePrefixOf(webDir: string): string | undefined {
  try {
    const { prefix } = JSON.parse(readFileSync(path.join(webDir, STYLES_META), "utf8")) as {
      prefix?: unknown;
    };
    return typeof prefix === "string" && prefix !== "" ? prefix : undefined;
  } catch {
    return undefined;
  }
}

/** The package above an entry file — its directory and its manifest's name and version — or null. */
export function packageOf(file: string): { dir: string; name: string; version: string } | null {
  let dir = path.dirname(file);
  for (;;) {
    try {
      const { name, version } = JSON.parse(
        readFileSync(path.join(dir, "package.json"), "utf8"),
      ) as {
        name?: unknown;
        version?: unknown;
      };
      if (typeof name !== "string") return null;
      return { dir, name, version: typeof version === "string" ? version : "0.0.0" };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") return null;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The files under `dir`, relative and sorted; empty when it does not exist. */
function filesUnder(dir: string, prefix = ""): string[] {
  let entries;
  try {
    entries = readdirSync(path.join(dir, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const rel = prefix === "" ? e.name : `${prefix}/${e.name}`;
    if (e.isDirectory()) out.push(...filesUnder(dir, rel));
    else if (e.isFile()) out.push(rel);
  }
  return out.sort();
}

/** Build ids by web directory, kept while every file's size and mtime stay what they were. */
const buildIds = new Map<string, { stamp: string; id: string }>();

/** The content hash of a package's built web files (16 hex digits), or null when it has none. */
export function webBuildId(pkgDir: string): string | null {
  const dir = path.join(pkgDir, WEB_DIR);
  const files = filesUnder(dir);
  if (files.length === 0) return null;
  const stamp = files
    .map((f) => {
      const st = statSync(path.join(dir, f));
      return `${f}:${st.size}:${st.mtimeMs}`;
    })
    .join("|");
  const held = buildIds.get(dir);
  if (held?.stamp === stamp) return held.id;
  const hash = createHash("sha256");
  for (const f of files)
    hash
      .update(f)
      .update("\0")
      .update(readFileSync(path.join(dir, f)));
  const id = hash.digest("hex").slice(0, 16);
  buildIds.set(dir, { stamp, id });
  return id;
}

/** A package's web part, or null when it ships no web module (or no table, or no build). */
export function webModulesOfPackage(pkg: {
  dir: string;
  name: string;
  version: string;
}): WebModulePackage | null {
  let table: {
    ifaces?: Record<string, unknown>;
    types?: Record<string, unknown>;
    modules?: Record<string, Record<string, unknown>>;
  };
  try {
    table = JSON.parse(readFileSync(path.join(pkg.dir, IFACES_FILE), "utf8"));
  } catch {
    return null;
  }
  // Every web module has a built file under WEB_DIR (scripts/build-plugin.mjs); one without is
  // not forwarded.
  const web = Object.values(table.modules ?? {}).filter(
    (m): m is Record<string, unknown> & { file: string } =>
      m.side === "web" && typeof m.file === "string" && m.file.startsWith(`${WEB_DIR}/`),
  );
  if (web.length === 0) return null;
  const build = webBuildId(pkg.dir);
  // Files not built yet: nothing of the package can be offered.
  if (build === null) return null;
  const base = `/api/plugins/${pkg.name}/web/${build}/`;
  /** A package-relative file under WEB_DIR as its URL. */
  const urlOf = (file: string) => base + file.slice(WEB_DIR.length + 1);
  const hasStyles = filesUnder(path.join(pkg.dir, WEB_DIR)).includes(STYLES_FILE);
  const stylePrefix = hasStyles ? stylePrefixOf(path.join(pkg.dir, WEB_DIR)) : undefined;
  return {
    package: pkg.name,
    version: pkg.version,
    ifaces: { ifaces: table.ifaces ?? {}, types: table.types ?? {} },
    modules: web.map((manifest) => ({ manifest, url: urlOf(manifest.file) })),
    styles: hasStyles ? [base + STYLES_FILE] : [],
    ...(stylePrefix !== undefined ? { stylePrefix } : {}),
  };
}

/** The web part of every loaded plugin with one, in load order; one package once. */
export function webModulesOf(entries: Iterable<string | null | undefined>): WebModulePackage[] {
  const out: WebModulePackage[] = [];
  const seen = new Set<string>();
  for (const file of entries) {
    if (file == null) continue;
    const pkg = packageOf(file);
    if (pkg === null || seen.has(pkg.name)) continue;
    seen.add(pkg.name);
    const part = webModulesOfPackage(pkg);
    if (part !== null) out.push(part);
  }
  return out;
}
