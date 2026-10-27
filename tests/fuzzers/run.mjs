#!/usr/bin/env node
/**
 * Run one fuzz leg: compile, seed the corpus, hand the stop condition to Jazzer.js, report.
 *
 *   node tests/fuzzers/run.mjs server            # API surface, 180 s by default
 *   node tests/fuzzers/run.mjs cli --max-total-time=60
 *   node tests/fuzzers/run.mjs server --self-check   # no Jazzer.js: replay the corpus once
 *
 * The run is coverage-guided end to end: libFuzzer owns the mutation, the scheduling and the
 * decision when to stop (`-max_total_time`), and every module under `build/` is instrumented.
 * Nothing here picks a request or a command.
 *
 * Artifacts land in `<leg>/out/` (ignored by git):
 *   corpus/        seed inputs plus every input libFuzzer kept
 *   coverage/      istanbul coverage-final.json and the summary report.mjs writes
 *   run.log        the fuzzer's own console output, final stats included
 *   summary.md     the target's account of the run, written as the process exits
 *   crash-*        any input that tripped an invariant
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const leg = process.argv[2];
if (leg !== "server" && leg !== "cli") {
  console.error("usage: node tests/fuzzers/run.mjs server|cli [options]");
  process.exit(2);
}

const options = { build: true, selfCheck: false, mode: "fuzzing", maxTotalTime: 180, runs: null };
for (const arg of process.argv.slice(3)) {
  if (arg === "--no-build") options.build = false;
  else if (arg === "--self-check") options.selfCheck = true;
  else if (arg === "--mode=regression") options.mode = "regression";
  else if (arg.startsWith("--max-total-time=")) options.maxTotalTime = Number(arg.split("=")[1]);
  else if (arg.startsWith("--runs=")) options.runs = arg.slice("--runs=".length);
  else {
    console.error(`[fuzz] unknown option ${arg}`);
    process.exit(2);
  }
}

const pkgDir = path.join(here, leg);
const outDir = path.join(pkgDir, "out");
const corpusDir = path.join(outDir, "corpus");
const coverageDir = path.join(outDir, "coverage");
const buildDir = path.join(here, "build");
const target = path.join(buildDir, "tests", "fuzzers", leg, "src", "fuzz.js");
const seed = path.join(buildDir, "tests", "fuzzers", leg, "src", "seed.js");
const hookUrl = pathToFileURL(path.join(here, "resolve-hook.mjs")).href;
const env = {
  ...process.env,
  // The build maps `@prismshadow/*` onto compiled files; see resolve-hooks.mjs.
  NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${hookUrl}`].filter(Boolean).join(" "),
  FUZZ_OUT_DIR: outDir,
  FUZZ_CORPUS_DIR: corpusDir,
};

fs.mkdirSync(corpusDir, { recursive: true });

function step(command, args, what, childEnv = env) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: here, env: childEnv });
  if (result.status !== 0) {
    console.error(`[fuzz] ${what} failed (exit ${result.status ?? result.signal})`);
    process.exit(result.status ?? 1);
  }
}

// The build runs without the resolve hook: it reads the tsconfig itself, and the hook would
// only report the paths.json this very step is about to write.
if (options.build) step(process.execPath, [path.join(here, "build.mjs")], "build", process.env);
step(process.execPath, [seed, corpusDir], "seed corpus");

if (options.selfCheck) {
  step(process.execPath, [target, "--self-check"], "self-check");
  process.exit(0);
}

const jazzerPackage = path.join(here, "node_modules", "@jazzer.js", "core", "package.json");
if (!fs.existsSync(jazzerPackage)) {
  console.error(
    `[fuzz] Jazzer.js is not installed — install the fuzzer once with:\n` +
      `       npm --prefix ${here} install`,
  );
  process.exit(2);
}

// The runner is the Jazzer.js CLI with a defined ending: it starts the fuzzer, writes the
// coverage report, closes the harness and exits (see fuzz-runner.mjs for why the packaged
// CLI cannot be used as-is here).
const runner = path.join(here, "fuzz-runner.mjs");
console.log(
  `[fuzz] ${leg}: jazzer ${path.relative(here, target)} (${options.mode}, ${options.maxTotalTime}s)`,
);
const child = spawn(
  process.execPath,
  [
    runner,
    leg,
    target,
    corpusDir,
    buildDir,
    coverageDir,
    options.mode,
    String(options.maxTotalTime),
    options.runs ?? "",
    `${outDir}${path.sep}`,
    // The per-spec skeletons that insert one call (see the legs' `seed.ts`); libFuzzer's
    // dictionary turns "add a call" from a lucky byte into a mutation it can aim.
    fs.existsSync(path.join(outDir, "dict.txt")) ? path.join(outDir, "dict.txt") : "",
  ],
  { cwd: outDir, env, stdio: ["inherit", "pipe", "pipe"] },
);
// Written through a file descriptor, not a stream: the child's last lines (final stats,
// coverage summary) arrive right before it exits, and a buffered stream would lose them to
// the process.exit below.
const logFd = fs.openSync(path.join(outDir, "run.log"), "w");
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    const text = String(chunk);
    fs.writeSync(1, text);
    fs.writeSync(logFd, text);
  });
}

// `close`, not `exit`: the child's stdio may still carry its last lines when it exits, and
// this handler closes the log file.
child.on("close", (code, signal) => {
  fs.closeSync(logFd);
  if (fs.existsSync(path.join(coverageDir, "coverage-final.json"))) {
    const report = spawnSync(process.execPath, [path.join(here, "report.mjs"), leg], {
      stdio: "inherit",
      cwd: here,
    });
    if (report.status !== 0) console.error("[fuzz] coverage report failed");
  }
  if (signal !== null) {
    console.error(`[fuzz] ${leg} terminated by ${signal}`);
    process.exit(1);
  }
  // Jazzer.js exits 77 on a finding; that is the run's own answer, not a crash of this script.
  process.exit(code ?? 1);
});
