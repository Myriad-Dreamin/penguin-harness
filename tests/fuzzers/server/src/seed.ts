/**
 * Write the API leg's seed corpus: one entry per spec for each control-byte combination worth
 * starting from, plus the sequences a single call cannot reach.
 *
 * The specs come from the route metadata (`specs/server/main.ts`), and they are a seed source
 * now, not a scheduler: these files give libFuzzer a first input per handler and a first
 * sequence per lifecycle, and from there it is the fuzzer's own mutation and coverage feedback
 * that decide which requests exist. An entry that is already on disk is left alone — the corpus
 * directory is where the fuzzer keeps what it found.
 *
 * Usage (from run.mjs): `node seed.js <corpus-dir>`. The libFuzzer dictionary is written next to
 * that directory, as `dict.txt`.
 */
import fs from "node:fs";
import path from "node:path";
import { RECORD_SEPARATOR } from "../../specs/decode.js";
import { httpSpecs } from "../../specs/server/main.js";

const dir = process.argv[2];
if (dir === undefined) {
  console.error("usage: seed.js <corpus-dir>");
  process.exit(2);
}
fs.mkdirSync(dir, { recursive: true });
const outDir = path.dirname(path.resolve(dir));

/** A spec index fits one dictionary byte (the table is far shorter than 256). */
const hex = (value: number): string => `\\x${value.toString(16).padStart(2, "0")}`;
/** One call: the two control bytes and no payload, so its choices come out of the id pools. */
const call = (index: number, flags = 0): Buffer => Buffer.from([index, flags]);
/** A sequence: records joined by the byte a mutation inserts to add a call. */
const sequence = (...calls: Buffer[]): Buffer =>
  Buffer.concat(
    calls.flatMap((bytes, position) =>
      position === 0 ? [bytes] : [Buffer.from([RECORD_SEPARATOR]), bytes],
    ),
  );

const specs = httpSpecs();
let written = 0;
let sequences = 0;
const write = (name: string, bytes: Buffer): void => {
  const file = path.join(dir, name);
  if (fs.existsSync(file)) return;
  fs.writeFileSync(file, bytes);
  written += 1;
};

/** Bits 0-1 pick the auth mode; bit 2 asks for a bad body (see input.ts). */
const SEEDS: ReadonlyArray<{ flags: number; suffix: string }> = [
  { flags: 0b000, suffix: "anon-ok" },
  { flags: 0b001, suffix: "bearer-ok" },
  { flags: 0b010, suffix: "cookie-ok" },
  { flags: 0b100, suffix: "anon-bad" },
];

for (const [index, spec] of specs.entries()) {
  for (const seed of SEEDS) {
    write(
      `seed-${String(index).padStart(3, "0")}-${seed.suffix}`,
      Buffer.from([index, seed.flags]),
    );
  }
}

const indexOf = new Map<string, number>(specs.map((spec, index) => [spec.id, index]));
/** A sequence entry: the same write, counted apart so the log says how many there are. */
const writeSequence = (name: string, bytes: Buffer): void => {
  sequences += 1;
  write(name, bytes);
};
/** Bearer auth on the writes: the row a later read comes back for only exists if the write that
 * made it was allowed at all. */
const AUTHED = 1;

for (const [createdIndex, created] of specs.entries()) {
  if (created.method !== "POST") continue;
  for (const [readIndex, read] of specs.entries()) {
    if (read.method !== "GET") continue;
    // The collection the POST appends to, or an item under it.
    const isItem = read.path.startsWith(`${created.path}/`);
    if (read.path !== created.path && !isItem) continue;
    writeSequence(
      `seq-${createdIndex}-${readIndex}-create-read`,
      sequence(call(createdIndex, AUTHED), call(readIndex, AUTHED)),
    );
    const removedIndex = isItem ? indexOf.get(`DELETE ${read.path}`) : undefined;
    if (removedIndex !== undefined) {
      writeSequence(
        `seq-${createdIndex}-${readIndex}-${removedIndex}-create-read-delete`,
        sequence(call(createdIndex, AUTHED), call(readIndex, AUTHED), call(removedIndex, AUTHED)),
      );
    }
  }
}

for (const [readIndex, read] of specs.entries()) {
  if (read.method !== "GET") continue;
  for (const [changedIndex, changed] of specs.entries()) {
    if (changed.method === "GET" || changed.method === "POST") continue;
    if (changed.path !== read.path) continue;
    writeSequence(
      `seq-${readIndex}-${changedIndex}-read-${changed.method.toLowerCase()}`,
      sequence(call(readIndex, AUTHED), call(changedIndex, AUTHED)),
    );
  }
}

/**
 * libFuzzer's own dictionary: for every spec, the two bytes that insert one call of it — the
 * separator, then its index. Without it, "insert a call" has to find the separator by luck
 * (1/256 per byte) and then a useful index by luck again; with it, the engine's "add a word from
 * the dictionary" mutation inserts a well-formed call directly.
 */
const dict = specs.map((_, index) => `"\\x0a${hex(index)}"`).join("\n") + "\n";
fs.writeFileSync(path.join(outDir, "dict.txt"), dict, "utf8");

console.log(
  `[seed] ${specs.length} specs, ${written} new seed(s) in ${path.resolve(dir)} ` +
    `(${sequences} sequence seed(s)), ${specs.length}-entry dictionary in ${outDir}`,
);
