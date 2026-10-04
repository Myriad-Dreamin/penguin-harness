#!/usr/bin/env node
/**
 * Verifies the web's builtin module tree at build time: the kernel's full check (structural
 * interface satisfaction, contribution shapes — everything `bootModules` would check at boot)
 * over the manifests and interfaces in `src/ifaces.json`, which `gen:ifaces` has just written.
 *
 * The page boots that tree through the kernel's arktype-free runtime entry, which wires by
 * interface identity and checks nothing structural (src/web-root.ts). This step is why that is
 * safe: a tree that does not verify fails `pnpm build` here, so it cannot ship. The same check
 * runs under vitest (test/builtin-tree.test.ts).
 *
 * Needs core's dist (the web build always comes after core's in `pnpm -r build`). An optional
 * argument names another table to check (the test feeds it a broken one).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkTables, describeProblem } from "@prismshadow/penguin-core/kernel";

const tablePath =
  process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/ifaces.json");
const table = JSON.parse(fs.readFileSync(tablePath, "utf8"));
let problems;
try {
  problems = checkTables(table).map(describeProblem);
} catch (err) {
  problems = [err instanceof Error ? err.message : String(err)];
}
if (problems.length > 0) {
  console.error("verify-builtin-tree: the builtin module tree does not verify:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`verify-builtin-tree: ${Object.keys(table.modules).length} modules verify`);
