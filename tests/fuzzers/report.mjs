#!/usr/bin/env node
/**
 * Turn Jazzer.js's `coverage-final.json` into the reading a person asks for.
 *
 * The coverage keys are compiled files under `build/` (one output per input, same relative
 * path); the report renames each key back to the TypeScript source it was compiled from and
 * writes `<leg>/out/coverage/coverage-summary.md` beside the raw JSON.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import libCoverage from "istanbul-lib-coverage";

const here = path.dirname(fileURLToPath(import.meta.url));
const leg = process.argv[2];
if (leg !== "server" && leg !== "cli") {
  console.error("usage: node tests/fuzzers/report.mjs server|cli");
  process.exit(2);
}

const coverageDir = path.join(here, leg, "out", "coverage");
const rawFile = path.join(coverageDir, "coverage-final.json");
const buildPrefix = `${path.join(here, "build")}${path.sep}`;

const raw = JSON.parse(fs.readFileSync(rawFile, "utf8"));
const remapped = {};
for (const [file, data] of Object.entries(raw)) {
  const relative = file.startsWith(buildPrefix) ? file.slice(buildPrefix.length) : file;
  const source = relative.replace(/\.js$/, ".ts");
  remapped[source] = { ...data, path: source };
}
fs.writeFileSync(
  path.join(coverageDir, "coverage-mapped.json"),
  `${JSON.stringify(remapped, null, 2)}\n`,
  "utf8",
);

const map = libCoverage.createCoverageMap(remapped);
const total = map.getCoverageSummary();
const percent = (metric) => `${metric.covered}/${metric.total} (${metric.pct.toFixed(1)}%)`;

const rows = map
  .files()
  .sort()
  .map((file) => {
    const summary = map.fileCoverageFor(file).toSummary();
    return [
      file,
      summary.lines.pct.toFixed(1),
      summary.statements.pct.toFixed(1),
      summary.functions.pct.toFixed(1),
      summary.branches.pct.toFixed(1),
    ];
  });

const lines = [
  `# Coverage — ${leg} leg`,
  "",
  `Instrumented files: ${map.files().length}`,
  "",
  `- Lines: ${percent(total.lines)}`,
  `- Statements: ${percent(total.statements)}`,
  `- Functions: ${percent(total.functions)}`,
  `- Branches: ${percent(total.branches)}`,
  "",
  "| file | lines % | statements % | functions % | branches % |",
  "| --- | --- | --- | --- | --- |",
  ...rows.map((row) => `| \`${row[0]}\` | ${row.slice(1).join(" | ")} |`),
  "",
];
fs.writeFileSync(path.join(coverageDir, "coverage-summary.md"), lines.join("\n"), "utf8");

console.log(
  `[report] ${map.files().length} files — lines ${total.lines.pct.toFixed(1)}%, ` +
    `statements ${total.statements.pct.toFixed(1)}%, functions ${total.functions.pct.toFixed(1)}%, ` +
    `branches ${total.branches.pct.toFixed(1)}%`,
);
