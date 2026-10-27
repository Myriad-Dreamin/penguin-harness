/**
 * Write the API leg's seed corpus: one entry per spec, for each control-byte combination
 * worth starting from.
 *
 * The specs come from the route metadata (`specs/server/main.ts`), and they are a seed source
 * now, not a scheduler: these files give libFuzzer a first input per handler, and from there
 * it is the fuzzer's own mutation and coverage feedback that decide which requests exist. An
 * entry that is already on disk is left alone — the corpus directory is where the fuzzer
 * keeps what it found.
 *
 * Usage (from run.mjs): `node seed.js <corpus-dir>`.
 */
import fs from "node:fs";
import path from "node:path";
import { httpSpecs } from "../../specs/server/main.js";

const dir = process.argv[2];
if (dir === undefined) {
  console.error("usage: seed.js <corpus-dir>");
  process.exit(2);
}
fs.mkdirSync(dir, { recursive: true });

/** Bits 0-1 pick the auth mode; bit 2 asks for a bad body (see input.ts). */
const SEEDS: ReadonlyArray<{ flags: number; suffix: string }> = [
  { flags: 0b000, suffix: "anon-ok" },
  { flags: 0b001, suffix: "bearer-ok" },
  { flags: 0b010, suffix: "cookie-ok" },
  { flags: 0b100, suffix: "anon-bad" },
];

const specs = httpSpecs();
let written = 0;
for (const [index, spec] of specs.entries()) {
  for (const seed of SEEDS) {
    const name = `seed-${String(index).padStart(3, "0")}-${seed.suffix}`;
    const file = path.join(dir, name);
    if (fs.existsSync(file)) continue;
    fs.writeFileSync(file, Buffer.from([index, seed.flags]));
    written += 1;
  }
}
console.log(`[seed] ${specs.length} specs, ${written} new seed(s) in ${path.resolve(dir)}`);
