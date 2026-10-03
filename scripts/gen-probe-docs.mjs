#!/usr/bin/env node
/**
 * Keeps the probe reference (packages/server/src/telemetry/probes.<lang>.md) pointing at the
 * lines that record each probe. The performance panel links a probe's name to its section
 * there, on GitHub at the build's commit; the section's site line links on to the code with a
 * path relative to the document, so it opens at that same commit and the line number holds.
 *
 * The prose is written by hand; only the line carrying `<!-- probe-site -->` in each
 * `### <probe>` section is rewritten here, from the same scan the build uses
 * (probe-sites.mjs). A probe the scan finds with no section, or a section naming no probe the
 * scan finds, is an error: the reference covers exactly the probes the code records.
 *
 *   node scripts/gen-probe-docs.mjs          rewrite the site lines
 *   node scripts/gen-probe-docs.mjs --check  exit 1 when a file is out of date (the test runs this)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { probeSites } from "./probe-sites.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Where the reference lives, relative to the repository root; the web links to it by this path. */
export const PROBE_DOCS_DIR = "packages/server/src/telemetry";
export const PROBE_DOCS_LANGS = ["en", "zh"];
/** The directories the build scans; the reference covers both bundles' probes. */
const SCANNED = ["packages/server/src", "packages/web/src"];
const MARK = "<!-- probe-site -->";

/** `{ "<dir>/probes.<lang>.md": content }` as it should be, or throws naming what is wrong. */
export function renderProbeDocs(root = ROOT) {
  const sites = probeSites(SCANNED, root);
  const out = {};
  for (const lang of PROBE_DOCS_LANGS) {
    const rel = `${PROBE_DOCS_DIR}/probes.${lang}.md`;
    const lines = fs.readFileSync(path.join(root, rel), "utf8").split("\n");
    const seen = new Set();
    let current = null;
    let placed = false;
    const close = () => {
      if (current !== null && !placed)
        throw new Error(`${rel}: ### ${current} has no ${MARK} line`);
    };
    for (let i = 0; i < lines.length; i++) {
      const heading = /^### (\S+)$/.exec(lines[i]);
      if (heading !== null) {
        close();
        current = heading[1];
        placed = false;
        if (sites[current] === undefined)
          throw new Error(`${rel}: ### ${current} is not a probe the code records`);
        if (seen.has(current)) throw new Error(`${rel}: ### ${current} appears twice`);
        seen.add(current);
        continue;
      }
      if (!lines[i].includes(MARK)) continue;
      if (current === null || placed)
        throw new Error(`${rel}:${i + 1}: a ${MARK} line outside one probe's section`);
      const site = sites[current];
      const at = site.lastIndexOf(":");
      const target = path.posix.relative(PROBE_DOCS_DIR, site.slice(0, at));
      const lead = lines[i].slice(0, lines[i].indexOf("["));
      lines[i] = `${lead}[\`${site}\`](${target}#L${site.slice(at + 1)}) ${MARK}`;
      placed = true;
    }
    close();
    const missing = Object.keys(sites).filter((name) => !seen.has(name));
    if (missing.length > 0) throw new Error(`${rel}: no section for ${missing.join(", ")}`);
    out[rel] = lines.join("\n");
  }
  return out;
}

/**
 * Each section's opening paragraph per language — the one-sentence summary the panel shows
 * behind the "?" beside a probe's name: `{ en: { name: text }, zh: { … } }`.
 */
export function probeSummaries(root = ROOT) {
  const out = {};
  for (const lang of PROBE_DOCS_LANGS) {
    const lines = fs
      .readFileSync(path.join(root, PROBE_DOCS_DIR, `probes.${lang}.md`), "utf8")
      .split("\n");
    const summaries = {};
    for (let i = 0; i < lines.length; i++) {
      const heading = /^### (\S+)$/.exec(lines[i]);
      if (heading === null) continue;
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      const para = [];
      while (j < lines.length && lines[j].trim() !== "" && !lines[j].startsWith("#")) {
        para.push(lines[j].trim());
        j++;
      }
      summaries[heading[1]] = para.join(" ");
    }
    out[lang] = summaries;
  }
  return out;
}

/** The identifier the web bundle reads (lib/perf/sites.ts). */
export const PROBE_SUMMARIES_DEFINE = "__PENGUIN_PROBE_SUMMARIES__";

/** `{ [PROBE_SUMMARIES_DEFINE]: <JS expression> }` for a bundler's `define`; double-encoded like the others. */
export function probeSummariesDefine(root = ROOT) {
  return { [PROBE_SUMMARIES_DEFINE]: JSON.stringify(JSON.stringify(probeSummaries(root))) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const [rel, content] of Object.entries(renderProbeDocs())) {
    const file = path.join(ROOT, rel);
    if (fs.readFileSync(file, "utf8") === content) continue;
    stale += 1;
    if (check) console.error(`[gen-probe-docs] ${rel} is out of date`);
    else fs.writeFileSync(file, content);
  }
  if (check && stale > 0) {
    console.error("[gen-probe-docs] run `pnpm gen:probe-docs`");
    process.exit(1);
  }
}
