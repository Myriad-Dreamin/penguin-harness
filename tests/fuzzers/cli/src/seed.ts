/**
 * Write the CLI leg's seed corpus: one entry per spec in both variants the decode step knows,
 * plus the sequences a single command cannot reach.
 *
 * The specs come from the commander tree (`specs/cli/main.ts`), and they are a seed source now,
 * not a schedule — libFuzzer mutates these and keeps what its coverage feedback says is new.
 * Entries already on disk are left alone. The libFuzzer dictionary is written next to the corpus
 * directory, as `dict.txt`.
 *
 * Usage (from run.mjs): `node seed.js <corpus-dir>`.
 */
import fs from "node:fs";
import path from "node:path";
import { cliSpecs } from "../../specs/cli/main.js";
import { RECORD_SEPARATOR } from "../../specs/decode.js";

const dir = process.argv[2];
if (dir === undefined) {
  console.error("usage: seed.js <corpus-dir>");
  process.exit(2);
}
fs.mkdirSync(dir, { recursive: true });
const outDir = path.dirname(path.resolve(dir));

/** A spec index fits one dictionary byte (the table is far shorter than 256). */
const hex = (value: number): string => `\\x${value.toString(16).padStart(2, "0")}`;
/** One command: the two control bytes, then whatever payload its slots should draw from. */
const call = (index: number, flags = 0, payload = ""): Buffer =>
  Buffer.concat([Buffer.from([index, flags]), Buffer.from(payload, "utf8")]);
/** A sequence: records joined by the byte a mutation inserts to add a command. */
const sequence = (...calls: Buffer[]): Buffer =>
  Buffer.concat(
    calls.flatMap((bytes, position) =>
      position === 0 ? [bytes] : [Buffer.from([RECORD_SEPARATOR]), bytes],
    ),
  );

const specs = cliSpecs();
const indexOf = new Map<string, number>(specs.map((spec, index) => [spec.id, index]));
let written = 0;
let sequences = 0;
const write = (name: string, bytes: Buffer): void => {
  const file = path.join(dir, name);
  if (fs.existsSync(file)) return;
  fs.writeFileSync(file, bytes);
  written += 1;
};

/** Bit 0 asks for the bad variant (see input.ts). */
const SEEDS: ReadonlyArray<{ flags: number; suffix: string }> = [
  { flags: 0b0, suffix: "ok" },
  { flags: 0b1, suffix: "bad" },
];

const sessionLs = indexOf.get("session ls");
for (const [index, spec] of specs.entries()) {
  for (const seed of SEEDS) {
    write(
      `seed-${String(index).padStart(3, "0")}-${seed.suffix}`,
      Buffer.from([index, seed.flags]),
    );
  }
  // Every command followed by the list it may have changed: "did this write land" is the
  // question one command cannot ask, and `session ls` is the read that sees the most.
  if (sessionLs !== undefined) {
    write(
      `seq-${String(index).padStart(3, "0")}-${String(sessionLs).padStart(3, "0")}-then-session-ls`,
      sequence(call(index), call(sessionLs)),
    );
    sequences += 1;
  }
}

/**
 * The lifecycle worth naming: a run makes a session, and the reads below it take the id from the
 * pool the run's own `--json` line fills. The message is in the payload so the run actually
 * starts instead of stopping at commander's missing-argument path.
 */
const run = indexOf.get("run");
const lifecycle = ["session show", "session log", "session ls"].map((id) => indexOf.get(id));
if (run !== undefined && lifecycle.every((index) => index !== undefined)) {
  write(
    "seq-run-session-lifecycle",
    sequence(call(run, 0, "fuzz sequence"), ...lifecycle.map((index) => call(index!))),
  );
  sequences += 1;
}

/**
 * libFuzzer's own dictionary: for every spec, the two bytes that insert one command of it — the
 * separator, then its index. Without it, "insert a command" has to find the separator by luck
 * (1/256 per byte) and then a useful index by luck again; with it, the engine's own
 * add-a-word-from-the-dictionary mutation inserts a well-formed command directly.
 */
const dict = specs.map((_, index) => `"\\x0a${hex(index)}"`).join("\n") + "\n";
fs.writeFileSync(path.join(outDir, "dict.txt"), dict, "utf8");

console.log(
  `[seed] ${specs.length} specs, ${written} new seed(s) in ${path.resolve(dir)} ` +
    `(${sequences} sequence seed(s)), ${specs.length}-entry dictionary in ${outDir}`,
);
