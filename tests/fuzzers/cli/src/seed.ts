/**
 * Write the CLI leg's seed corpus: one entry per spec, in both variants the decode step knows.
 *
 * The specs come from the commander tree (`specs/cli/main.ts`), and they are a seed source
 * now, not a schedule — libFuzzer mutates these and keeps what its coverage feedback says is
 * new. Entries already on disk are left alone.
 *
 * Usage (from run.mjs): `node seed.js <corpus-dir>`.
 */
import fs from "node:fs";
import path from "node:path";
import { cliSpecs } from "../../specs/cli/main.js";

const dir = process.argv[2];
if (dir === undefined) {
  console.error("usage: seed.js <corpus-dir>");
  process.exit(2);
}
fs.mkdirSync(dir, { recursive: true });

/** Bit 0 asks for the bad variant (see input.ts). */
const SEEDS: ReadonlyArray<{ flags: number; suffix: string }> = [
  { flags: 0b0, suffix: "ok" },
  { flags: 0b1, suffix: "bad" },
];

const specs = cliSpecs();
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
