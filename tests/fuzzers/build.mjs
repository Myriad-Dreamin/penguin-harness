#!/usr/bin/env node
/**
 * Compile the fuzz targets — and every product module they reach — to plain ESM JavaScript
 * under `build/`, the tree Jazzer.js instruments.
 *
 * Why a build step exists at all: Jazzer.js instruments modules as they are loaded, through
 * a Babel pipeline that carries no TypeScript syntax plugin, so a `.ts` target loads
 * uninstrumented — coverage stays empty and the fuzzer gets no feedback (measured on
 * Jazzer.js 4.0.0, see the ticket). esbuild strips the types, keeps the module layout, and
 * writes an *inline* source map; the instrumentor lifts that map for stack traces.
 *
 * The layout mirrors the repository, one output file per input file, so a stack frame still
 * names `packages/server/src/http/routes/projects.js` and `build/<repo-relative path>.js` maps
 * back to `packages/server/src/http/routes/projects.ts` without a table.
 *
 * Two runtime resolutions an installed, unbuilt tree does not provide on its own are handled
 * here rather than by editing the product:
 *
 *  - the workspace packages (`@prismshadow/*`) resolve through `dist/` in their manifests,
 *    which only a build produces. `paths.mjs` rewrites the tsconfig's own `paths` table to
 *    build targets, and `resolve-hook.mjs` applies it at run time.
 *  - a package's third-party dependencies (`hono`, `commander`, …) live in that package's
 *    own `node_modules`. A symlink per package puts them on the walk-up path from `build/`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const outDir = path.join(here, "build");
const tsconfigPath = path.join(here, "tsconfig.run.json");

function fail(message) {
  console.error(`[build] ${message}`);
  process.exit(1);
}

const parsed = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
if (parsed.error !== undefined) {
  fail(ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"));
}
const config = ts.parseJsonConfigFileContent(parsed.config, ts.sys, here);
if (config.errors.length > 0) {
  fail(ts.flattenDiagnosticMessageText(config.errors[0].messageText, "\n"));
}

// The program's own file list, not the tsconfig's `include` patterns: the fuzzers reach
// `packages/*/src` and a test fixture, and every one of those files has to reach the build.
const program = ts.createProgram({ rootNames: config.fileNames, options: config.options });
const sources = program
  .getSourceFiles()
  .filter(
    (file) =>
      !file.isDeclarationFile &&
      file.fileName.startsWith(repo + path.sep) &&
      !file.fileName.includes(`${path.sep}node_modules${path.sep}`),
  )
  .map((file) => file.fileName);

if (sources.length === 0) fail("the tsconfig program resolved no source files");

await build({
  absWorkingDir: repo,
  entryPoints: sources,
  outdir: outDir,
  outbase: repo,
  // One output file per input file: a bundle would report coverage against one artefact and
  // lose the per-source reading the report exists for.
  bundle: false,
  format: "esm",
  platform: "node",
  target: "node24",
  // Inline, not external: `@jazzer.js/instrumentor` reads the map off the module source.
  sourcemap: "inline",
  tsconfig: tsconfigPath,
  logLevel: "warning",
});

// Non-TypeScript files the product imports by relative path (`ifaces.json`, the builtin
// plugin index) are copied beside their compiled neighbours.
let assets = 0;
for (const dir of new Set(sources.map((file) => path.dirname(file)))) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const from = path.join(dir, entry.name);
    const to = path.join(outDir, path.relative(repo, from));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    assets += 1;
  }
}

// One symlink per package, so a dependency import from `build/packages/<pkg>/src/…` walks up
// into that package's installed dependencies exactly as it does from the source tree.
let links = 0;
const packageDirs = new Set();
for (const file of sources) {
  const relative = path.relative(path.join(repo, "packages"), file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
  const pkg = relative.split(path.sep)[0];
  packageDirs.add(pkg);
  const modules = path.join(repo, "packages", pkg, "node_modules");
  if (!fs.existsSync(modules)) continue;
  const link = path.join(outDir, "packages", pkg, "node_modules");
  if (fs.existsSync(link)) continue;
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(modules, link, "dir");
  links += 1;
}

// A bare specifier imported from the fuzz tree itself (not from `packages/`) has no such
// walk-up: `specs/cli/main.ts` reads the commander tree with the CLI's own `commander`, which
// is installed under `packages/cli`. One link at the build root puts that package on the
// walk-up path from `build/tests/fuzzers/…`, so the specs are built by the same commander
// version the product parses argv with.
for (const name of ["commander"]) {
  const from = path.join(repo, "packages", "cli", "node_modules", name);
  if (!fs.existsSync(from)) continue;
  const link = path.join(outDir, "node_modules", name);
  if (fs.existsSync(link)) continue;
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(from, link, "dir");
  links += 1;
}

// Each package's manifest is part of the tree the product walks: the plugin library finds its
// host package by reading `package.json` above the loader (`packages/core/…` does that on the
// boot path), and a build without the manifest cannot resolve the plugins it declares.
for (const pkg of packageDirs) {
  const from = path.join(repo, "packages", pkg, "package.json");
  if (!fs.existsSync(from)) continue;
  const to = path.join(outDir, "packages", pkg, "package.json");
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  assets += 1;
}

// The tsconfig's `paths` table, rewritten to compiled targets. Only targets that point at
// TypeScript sources are kept: a bare specifier mapped into someone's `node_modules` (the
// `hono` entries) resolves normally through the symlinks above.
const base = path.resolve(here, config.options.baseUrl ?? ".");
const mappings = [];
for (const [pattern, targets] of Object.entries(config.options.paths ?? {})) {
  const compiled = [];
  for (const target of targets) {
    const abs = path.resolve(base, target);
    if (!abs.endsWith(".ts") || abs.endsWith(".d.ts")) continue;
    compiled.push(path.join(outDir, path.relative(repo, abs)).replace(/\.ts$/, ".js"));
  }
  if (compiled.length > 0) mappings.push({ pattern, targets: compiled });
}
// TypeScript's own precedence: an exact pattern first, then wildcards by longest prefix.
mappings.sort((a, b) => {
  const exactA = a.pattern.includes("*") ? 1 : 0;
  const exactB = b.pattern.includes("*") ? 1 : 0;
  if (exactA !== exactB) return exactA - exactB;
  return b.pattern.split("*")[0].length - a.pattern.split("*")[0].length;
});
fs.writeFileSync(path.join(outDir, "paths.json"), `${JSON.stringify(mappings, null, 2)}\n`, "utf8");

console.log(
  `[build] ${sources.length} modules, ${assets} assets, ${links} node_modules links → ${path.relative(repo, outDir)}/`,
);
