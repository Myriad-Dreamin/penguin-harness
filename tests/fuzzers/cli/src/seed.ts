/**
 * Write the CLI leg's seed corpus: one entry per spec in both variants the decode step knows,
 * and the sequences a single command cannot reach.
 *
 * The specs come from the commander tree (`specs/cli/main.ts`), and they are a seed source now,
 * not a schedule — libFuzzer mutates these and keeps what its coverage feedback says is new.
 * Entries already on disk are left alone. The libFuzzer dictionary is written next to the corpus
 * directory, as `dict.txt`.
 *
 * Every seed carries a payload. An empty payload is a degenerate input: `ByteChoices` reads 0
 * for every decision, so `chance(p)` is true for every p and the command line collapses into the
 * one "everything on, first value" shape — the fuzzer then explores nothing but that shape. The
 * payloads below are written to keep each slot's decision alive (the first byte carries the
 * option toggles, the rest is the text a `-m`/`-t` slot receives), and the long ones also set the
 * starting `lim` for libFuzzer's mutations: `-max_len` only raises the ceiling, the engine still
 * starts at the longest seed it was given.
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
/** One command: the two control bytes, then the payload its slots draw from. */
const call = (index: number, payload: string, flags = 0): Buffer =>
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
const writeSequence = (name: string, bytes: Buffer): void => {
  sequences += 1;
  write(name, bytes);
};

/** Deterministic filler: printable, distinct per spec, so no two seeds share a payload. */
const filler = (index: number, length: number): string => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  for (let step = 0; step < length; step += 1) {
    out += alphabet[(index * 7 + step * 3) % alphabet.length];
  }
  return out;
};

/**
 * The payload shapes the text slots have to survive: a plain word, a path, a quoting accident,
 * a value long enough to trip a length bound, and bytes that turn the option toggles off
 * (`chance(p)` is false once the first byte is ≥ 0x80).
 */
const PAYLOADS: readonly string[] = [
  "",
  "fuzz",
  "fuzz message with spaces",
  "../../etc/passwd",
  "a\"b'c\\d",
  "x".repeat(200),
  "é ünïcode ✓",
  "\u00ff\u00ff\u00ff", // ≥ 0x80 first byte: every optional option stays off
  '{"json":true}',
  "--not-an-option",
];

for (const [index, spec] of specs.entries()) {
  for (const flags of [0, 1]) {
    // Two payload sizes per variant: the short one keeps the input cheap, the long one pushes
    // the text slot into the length-bounded paths.
    for (const [slot, payload] of [
      [0, PAYLOADS[index % PAYLOADS.length]!],
      [1, `${filler(index, 1 + (index % 3) * 11)} ${PAYLOADS[(index + 3) % PAYLOADS.length]!}`],
    ] as const) {
      write(
        `seed-${String(index).padStart(3, "0")}-${flags === 0 ? "ok" : "bad"}-${slot}`,
        call(index, payload, flags),
      );
    }
  }
}

/** One named id, if the tree has it: a sequence step that does not exist here is skipped. */
const at = (id: string): number | undefined => indexOf.get(id);

/**
 * The pipelines a single command cannot express, each record carrying its own payload:
 * create → look → act on the id the look printed. The ids come out of the earlier command's
 * `--json` line (the run captures them into the pools the decode step reads), which is why
 * every read here is the `--json` form.
 */
const PIPELINES: ReadonlyArray<{ name: string; steps: ReadonlyArray<{ id: string; payload: string }> }> = [
  {
    name: "run-lifecycle",
    steps: [
      { id: "run", payload: "fuzz first turn with a message" },
      { id: "session ls", payload: "fuzz" },
      { id: "session log", payload: "fuzz tail" },
      { id: "session rename", payload: "fuzz renamed title" },
      { id: "session input", payload: "fuzz second turn after the rename" },
    ],
  },
  {
    name: "run-twice",
    steps: [
      { id: "run", payload: "fuzz run one" },
      { id: "run", payload: "fuzz run two, a second session in the same input" },
      { id: "session ls", payload: "fuzz all" },
    ],
  },
  {
    name: "schedule-lifecycle",
    steps: [
      { id: "schedule add", payload: "fuzz scheduled prompt" },
      { id: "schedule ls", payload: "fuzz" },
      { id: "schedule update", payload: "fuzz updated prompt" },
      { id: "schedule rm", payload: "fuzz" },
      { id: "schedule ls", payload: "fuzz after removal" },
    ],
  },
  {
    name: "cost-window",
    steps: [
      { id: "cost", payload: "fuzz 7" },
      { id: "cost", payload: "fuzz 30 model" },
      { id: "session ls", payload: "fuzz after cost" },
    ],
  },
];

for (const pipeline of PIPELINES) {
  const steps = pipeline.steps
    .map((step) => ({ index: at(step.id), payload: step.payload }))
    .filter((step): step is { index: number; payload: string } => step.index !== undefined);
  if (steps.length !== pipeline.steps.length) continue;
  writeSequence(
    `seq-${pipeline.name}`,
    sequence(...steps.map((step) => call(step.index, step.payload))),
  );
}

/**
 * Every driven command followed by the two reads that see what it changed: the list it may have
 * appended to, and the trace. This is the breadth seed — one per spec — while the pipelines
 * above are the depth ones.
 */
const sessionLs = at("session ls");
const sessionLog = at("session log");
for (const [index] of specs.entries()) {
  if (sessionLs === undefined) break;
  const steps = [call(index, `${filler(index, 9)} fuzz`)];
  steps.push(call(sessionLs, "fuzz list after the command"));
  if (sessionLog !== undefined) steps.push(call(sessionLog, "fuzz trace"));
  writeSequence(`seq-${String(index).padStart(3, "0")}-then-reads`, sequence(...steps));
}

/**
 * libFuzzer's own dictionary: for every spec, the two bytes that insert one command of it — the
 * separator, then its index. The value tokens are the second half: the words a command line is
 * made of, and the shapes the text slots must survive.
 */
const words = [
  "\\x0a",
  "--json",
  "--limit",
  "--days",
  "--title",
  "--message",
  "-m",
  "--approve",
  "allow-all",
  "--timeout",
  "1s",
  "10s",
  "--period",
  "1h",
  "/",
  "..",
  "../../etc/passwd",
  "%s",
  // Non-ASCII as its UTF-8 bytes: libFuzzer's dictionary parser rejects raw high bytes.
  "\\xc3\\xa9",
  "\\xff\\xff",
];
const dict =
  [
    ...specs.map((_, index) => `"\\x0a${hex(index)}"`),
    ...words.map((word) => `"${word}"`),
  ].join("\n") + "\n";
fs.writeFileSync(path.join(outDir, "dict.txt"), dict, "utf8");

console.log(
  `[seed] ${specs.length} specs, ${written} new seed(s) in ${path.resolve(dir)} ` +
    `(${sequences} sequence seed(s)), ${specs.length + words.length}-entry dictionary in ${outDir}`,
);
