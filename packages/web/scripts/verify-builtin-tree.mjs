#!/usr/bin/env node
/**
 * Verifies the web's builtin module tree at build time, with both checks the tree meets:
 *
 * 1. the kernel's full check (structural interface satisfaction, contribution shapes —
 *    everything `bootModules` would check at boot) over the manifests and interfaces in
 *    `src/ifaces.json`, which `gen:ifaces` has just written;
 * 2. the identity check the page itself runs at boot (`checkExact`, what `bootVerified` runs
 *    through the kernel's arktype-free runtime entry, src/web-root.ts) over the tree under the
 *    app's root module, `WebRoot`.
 *
 * The page boots the tree through the runtime entry, which wires by interface identity and checks
 * nothing structural. The first check is why that is safe; the second is why a build that passes
 * cannot boot into the rescue panel: a requirement only a structural match would meet passes the
 * full check and is refused by the page, so it is refused here too. The same checks run under
 * vitest (test/builtin-tree.test.ts).
 *
 * Needs core's dist (the web build always comes after core's in `pnpm -r build`). An optional
 * argument names another table to check (the test feeds it broken ones).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkExact,
  checkTables,
  describeProblem,
  treesOf,
} from "@prismshadow/penguin-core/kernel";

/** The app's root module (src/web-root.ts `WebRoot`): the tree the page boots. */
const ROOT_MODULE = "WebRoot";

const tablePath =
  process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/ifaces.json");
const table = JSON.parse(fs.readFileSync(tablePath, "utf8"));
let problems;
try {
  problems = checkTables(table).map(describeProblem);
  if (problems.length === 0) {
    const tree = treesOf(table).find((t) => t.manifest.name === ROOT_MODULE);
    problems =
      tree === undefined
        ? [`the table has no root module '${ROOT_MODULE}'`]
        : checkExact(tree, table).problems.map((p) => `${describeProblem(p)} (boot check)`);
  }
} catch (err) {
  problems = [err instanceof Error ? err.message : String(err)];
}
if (problems.length > 0) {
  console.error("verify-builtin-tree: the builtin module tree does not verify:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`verify-builtin-tree: ${Object.keys(table.modules).length} modules verify`);
