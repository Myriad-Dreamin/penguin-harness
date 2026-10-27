#!/usr/bin/env node
/**
 * Run one fuzz package's entry with the repository's own tsx.
 *
 * tsconfig.run.json keeps the LLM hermetic (`@prismshadow/mmsp` → the scripted stub in
 * server/src/stubs) and points the workspace packages at their sources, so tsx has to be
 * told which tsconfig to use; running the entry straight from the repository root would
 * pick the root tsconfig and let the real client through.
 *
 *   node tests/fuzzers/run.mjs server
 *   node tests/fuzzers/run.mjs cli
 *
 * The child runs from the package directory, so `out/` artifacts land there and the
 * package's relative imports resolve as written.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const which = process.argv[2];
if (which !== "server" && which !== "cli") {
  console.error("usage: node tests/fuzzers/run.mjs server|cli");
  process.exit(2);
}

const tsx = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const dir = fileURLToPath(new URL(`./${which}/`, import.meta.url));
const tsconfig = fileURLToPath(new URL("./tsconfig.run.json", import.meta.url));

const child = spawn(process.execPath, [tsx, "--tsconfig", tsconfig, "src/main.ts"], {
  cwd: dir,
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code, signal) => {
  if (signal !== null) {
    console.error(`[fuzz] ${which} terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
