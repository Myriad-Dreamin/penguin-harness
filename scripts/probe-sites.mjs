/**
 * Where each telemetry probe (PRFC-0008) is recorded, as a bundler `define`: the performance
 * panel links a probe's name to that line on GitHub, at the commit the build was made from.
 *
 * The table is read off the source while the build runs, because only then are the lines and
 * the commit known together — a bundle sitting in `<root>/hmr/store/` has neither. The commit,
 * the dirty flag and the origin come from the same checkout facts the build stamp uses
 * (build-git-stamp.mjs), so the lines always belong to the commit they are linked at; a build
 * from uncommitted changes says so, and the panel warns that the line may be off.
 *
 * What counts as a probe site is the three spellings the code uses: `probe: "name"` (every
 * `record`/`emit` and the browser's samples), `timed("name", …)` (the platform's boot steps),
 * and `` probe: `prefix.${…}` `` (a family named per segment, recorded as `prefix.*`). A probe
 * spelled any other way is not found and its name shows as plain text; the scan's test lists
 * the names it must find.
 *
 * Deterministic for identical source, like the build stamp: the HMR store addresses bundles
 * by content, so nothing here may vary between two builds of the same tree.
 */
import fs from "node:fs";
import path from "node:path";
import { checkoutFacts, originUrl } from "./build-git-stamp.mjs";

/** The identifier the bundlers replace; telemetry/sites.ts and lib/perf/sites.ts read it. */
export const PROBE_SITES_DEFINE = "__PENGUIN_PROBE_SITES__";

/** Repository root (this file sits in `scripts/`). */
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

/** Where a link goes when the checkout's origin is not a GitHub repository. */
const CANONICAL_REPO = "https://github.com/Prism-Shadow/penguin-harness";

const SITE_PATTERNS = [
  /\bprobe:\s*"([a-z][\w.-]*)"/g,
  /\btimed\(\s*"([a-z][\w.-]*)"/g,
  /\bprobe:\s*`([a-z][\w.-]*)\.\$\{/g,
];

function* sourceFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      yield* sourceFiles(full);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      yield full;
    }
  }
}

/**
 * `{ name: "path:line" }` for every probe site under `dirs` (relative to the repository root),
 * the path POSIX-style from the root. A name recorded in more than one place keeps the first
 * site in path order.
 */
export function probeSites(dirs, root = ROOT) {
  const files = dirs.flatMap((dir) => [...sourceFiles(path.join(root, dir))]).sort();
  const sites = {};
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const code = line.trimStart();
      if (code.startsWith("*") || code.startsWith("//") || code.startsWith("/*")) return;
      SITE_PATTERNS.forEach((pattern, kind) => {
        for (const m of line.matchAll(pattern)) {
          const name = kind === 2 ? `${m[1]}.*` : m[1];
          sites[name] ??= `${rel}:${i + 1}`;
        }
      });
    });
  }
  return Object.fromEntries(Object.entries(sites).sort(([a], [b]) => a.localeCompare(b)));
}

/** An origin remote as a GitHub https URL, or the canonical repository when it is not one. */
export function githubRepo(origin) {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(origin ?? "");
  return m === null ? CANONICAL_REPO : `https://github.com/${m[1]}/${m[2]}`;
}

/**
 * `{ [PROBE_SITES_DEFINE]: <JS expression> }` for a bundler's `define`, or `{}` outside a
 * checkout with a commit (nothing to link at). Double-encoded like the build stamp: the
 * expression is a string literal whose contents are the JSON the runtime parses.
 */
export function probeSitesDefine(dirs) {
  const facts = checkoutFacts();
  if (facts === null || facts.commit === null) return {};
  const table = {
    repo: githubRepo(originUrl()),
    commit: facts.commit,
    dirty: facts.dirty === true,
    sites: probeSites(dirs),
  };
  return { [PROBE_SITES_DEFINE]: JSON.stringify(JSON.stringify(table)) };
}
