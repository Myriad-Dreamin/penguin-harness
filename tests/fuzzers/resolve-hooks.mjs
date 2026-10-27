/**
 * Apply the fuzz build's module table to the running process.
 *
 * Loaded with `--import` before Jazzer.js starts (see run.mjs), so it is in place before the
 * first product module is imported. It answers exactly one question — where a
 * `@prismshadow/*` specifier lives in `build/` — and hands every other specifier to Node's own
 * resolver.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** `[{ pattern, targets: [absolute compiled paths] }]`, written by build.mjs. */
function loadMappings() {
  const file = path.join(here, "build", "paths.json");
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`[fuzz] ${file} is missing or unreadable (${err.message}); run build.mjs first`);
    return [];
  }
}

const mappings = loadMappings();

function candidates(specifier) {
  const found = [];
  for (const { pattern, targets } of mappings) {
    const star = pattern.indexOf("*");
    if (star === -1) {
      if (specifier === pattern) found.push(...targets);
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    const middle = specifier.slice(prefix.length, specifier.length - suffix.length);
    for (const target of targets) found.push(target.replace("*", middle));
  }
  return found;
}

export function resolveWorkspaceSpecifiers(specifier, context, nextResolve) {
  if (specifier.startsWith("@prismshadow/")) {
    for (const candidate of candidates(specifier)) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true, format: "module" };
      }
    }
  }
  return nextResolve(specifier, context);
}
