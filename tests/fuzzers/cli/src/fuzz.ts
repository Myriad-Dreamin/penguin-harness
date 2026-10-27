/**
 * CLI-surface fuzz target — the module Jazzer.js loads and calls.
 *
 * It boots the same in-process harness the API leg uses (a disposable data root, the real
 * server, the scripted LLM) and drives the repository's own `cli(argv)` — commander over that
 * server, reached through `PENGUIN_API_URL` on the harness's loopback port. What changed from
 * the hand-driven run is who picks the command line: libFuzzer does, from the bytes it hands
 * `fuzz()`, guided by coverage of the instrumented CLI and server code.
 *
 * One input is a sequence of commands, cut at every newline byte (`splitRecords`), and each
 * command's exit code must be inside the set its spec allows. A command that throws, hangs past
 * the soft timeout, reaches `process.exit` where the table does not expect it, or makes a
 * non-loopback connection is thrown here — Jazzer.js records that as a crash and saves the input,
 * which is the whole sequence, so the commands that led to the finding replay with it.
 *
 * Boot also runs the setup pipeline the commands need (a project model, an agent, one real
 * run) and the write-after-read oracle: the CLI writes `.project_config.toml` locally, and
 * after the server's freshness window the same server must see that write through
 * `GET /api/projects/<id>/models`. A failure there is a boot error, not a fuzz finding.
 *
 * Run it through `run.mjs cli`, or replay the corpus without Jazzer.js:
 *
 *   node --import ./resolve-hook.mjs build/tests/fuzzers/cli/src/fuzz.js --self-check
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { captureStdout, cliSpecs, exitsFor } from "../../specs/cli/main.js";
import { splitRecords, type Pools } from "../../specs/decode.js";
import { ByteChoices } from "../../server/src/choices.js";
import { permitLoopback } from "../../server/src/bug-detectors.js";
import { installOutboundGuard } from "../../server/src/guards.js";
import { bootHarness } from "../../server/src/harness.js";
import { runOneCommand } from "./command.js";
import { decodeCliControls } from "./input.js";

const PROJECT_ID = "default_project";
/** The I-11 oracle's wait: FRESH_MS (2000) + slack, so the server's read sees a stable mtime. */
const CONFIG_FRESH_WAIT_MS = 2_200;
/**
 * How many commands one input may run. A command costs more than a request — process-level
 * guards, stdio capture, and a few commands wait on their own timeout — so four keeps the search
 * rate useful while still reaching the shapes that need a sequence: create, list, read, delete.
 */
const MAX_CALLS = 4;
/** No new command once this much of the input has been used (libFuzzer's watchdog is 30 s). */
const SEQUENCE_BUDGET_MS = 8_000;
/** A command worth naming in the run's account — see the API leg's own slow-call reading. */
const SLOW_CALL_MS = 1_000;
const OUT_DIR = process.env.FUZZ_OUT_DIR ?? path.join(process.cwd(), "out");
const CORPUS_DIR = process.env.FUZZ_CORPUS_DIR ?? path.join(OUT_DIR, "corpus");
const startedAt = performance.now();

const stats = {
  calls: 0,
  inputs: 0,
  /** How many commands each input asked for, after the cap: `{1: 120, 2: 34, …}`. */
  lengths: {} as Record<number, number>,
  capped: 0,
  budgetCuts: 0,
  /** Commands at or over `SLOW_CALL_MS`, and the five slowest of them. */
  slow: 0,
  slowest: [] as { specId: string; ms: number }[],
  exits: {} as Record<string, number>,
  specHits: new Set<string>(),
  exitGuardCatches: 0,
};

const guard = installOutboundGuard();
const harness = await bootHarness();
// The SSRF bug detector would otherwise report the harness's own loopback traffic.
await permitLoopback(harness.app.listener.port);

// The CLI leg's environment: the data root is the server's, the API URL points at the
// in-process loopback listener (client.ts's resolution step 2 — the lock and auto-start are
// never reached), the proxy never applies to loopback, and dates are UTC.
//
// SCRUBBED FIRST: running inside a server-driven Session injects PENGUIN_API_TOKEN /
// PENGUIN_PROJECT_ID / PENGUIN_AGENT_ID / PENGUIN_SESSION_ID into tool subprocesses, and the
// CLI prefers PENGUIN_API_TOKEN over the token file — the parent's token would be sent to the
// demo's server and 401 with a misleading "rotated" message.
const savedEnv: Record<string, string | undefined> = {};
const setEnv = (key: string, value: string): void => {
  savedEnv[key] = process.env[key];
  process.env[key] = value;
};
const clearEnv = (key: string): void => {
  savedEnv[key] = process.env[key];
  delete process.env[key];
};
for (const key of [
  "PENGUIN_API_TOKEN",
  "PENGUIN_PROJECT_ID",
  "PENGUIN_AGENT_ID",
  "PENGUIN_SESSION_ID",
]) {
  clearEnv(key);
}
setEnv("PENGUIN_HOME", harness.app.root);
// localhost, not 127.0.0.1: the canonical-host guard treats 127.0.0.1 as the preview host.
setEnv("PENGUIN_API_URL", `http://localhost:${harness.app.listener.port}`);
setEnv("NO_PROXY", "127.0.0.1,localhost,::1");
setEnv("TZ", "UTC");

// Imported after the environment is in place: the CLI resolves its data root at module load.
const { cli } = await import("../../../../packages/cli/src/index.js");

const specs = cliSpecs();
/**
 * Ids the run has seen, by the key the contract gives them: the boot run's session, plus
 * whatever the commands answer with (`captureStdout`). A `session show` therefore has a real
 * id to name, and a mutation of the pool key reaches the "no such session" path instead.
 */
const pools: Pools = {};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The setup pipeline every command's premise rests on; a failure here stops the run. */
async function setup(): Promise<boolean> {
  const steps = [
    {
      id: "setup.config.model.add",
      argv: [
        "config",
        "model",
        "add",
        "--model-id",
        "fuzz-model",
        "--provider",
        "fuzz-group",
        "--project-id",
        PROJECT_ID,
        "--root",
        harness.app.root,
        "--set-default",
      ],
      exits: [0],
    },
    {
      id: "setup.agent.create",
      argv: ["agent", "create", "--agent-id", "fuzz_cli", "--project-id", PROJECT_ID],
      exits: [0, 1],
    },
    {
      id: "setup.run.first",
      argv: ["run", "-m", "fuzz cli first run", "--json", "--timeout", "10s"],
      exits: [0],
    },
  ];
  for (const step of steps) {
    const outcome = await runOneCommand(cli, step.argv);
    if (outcome.threw !== null) {
      throw new Error(`[cli] setup ${step.id} threw: ${outcome.threw.message}`);
    }
    if (outcome.exitCode === null || !step.exits.includes(outcome.exitCode)) {
      throw new Error(
        `[cli] setup ${step.id} exited ${outcome.exitCode ?? "null"} outside {${step.exits.join(",")}} — ${outcome.stderr.slice(0, 200)}`,
      );
    }
    if (step.id === "setup.run.first") {
      const parsed = lastJsonLine(outcome.stdout) as { sessionId?: string } | null;
      if (parsed !== null && typeof parsed.sessionId === "string") {
        pools.sessionId = [...(pools.sessionId ?? []), parsed.sessionId];
      }
    }
    harness.clock.step(1_000);
  }

  // The oracle: the file the CLI just wrote must become the server's answer.
  await sleep(CONFIG_FRESH_WAIT_MS);
  const res = await harness.app.app.request(`/api/projects/${PROJECT_ID}/models`, {
    headers: { authorization: `Bearer ${harness.app.apiToken}` },
  });
  const body = JSON.stringify(await res.json().catch(() => null));
  const visible = body.includes("fuzz-model");
  if (!visible) {
    throw new Error(
      `[cli] the config write did not reach the server after ${CONFIG_FRESH_WAIT_MS}ms ` +
        `(GET /api/projects/${PROJECT_ID}/models answered ${res.status})`,
    );
  }
  return visible;
}

function lastJsonLine(stdout: string): unknown | null {
  const lines = stdout.trim().split("\n");
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]!.trim();
    if (line === "") continue;
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }
  return null;
}

const oracleVisible = await setup();

interface SpecSweep {
  inside: number;
  total: number;
  outside: string[];
}

/**
 * One pass over the whole spec table before fuzzing: every command, both variants, drawn from a
 * zero-byte input. This is the table's own premise check — a line outside its contract here is
 * either a wrong expectation to correct or the first finding, and either way it is reported
 * once at boot instead of surfacing later as an unexplained crash in the middle of a run.
 */
async function sweepSpecs(): Promise<SpecSweep> {
  const sweep: SpecSweep = { inside: 0, total: 0, outside: [] };
  for (const spec of specs) {
    for (const variant of ["ok", "bad"] as const) {
      const argv = spec.argv(variant, new ByteChoices(Buffer.alloc(0)), "", pools);
      const outcome = await runOneCommand(cli, argv);
      sweep.total += 1;
      const exits = exitsFor(spec, variant);
      const refused = outcome.exitCode !== null && exits.includes(outcome.exitCode);
      if (outcome.threw === null && !outcome.timedOut && refused) {
        sweep.inside += 1;
      } else {
        const why =
          outcome.threw !== null
            ? `threw out of cli(): ${outcome.threw.message}`
            : outcome.timedOut
              ? "exceeded the command soft timeout"
              : `exited ${outcome.exitCode ?? "null"} outside {${exits.join(",")}} — ${outcome.stderr.slice(0, 140).replace(/\n/g, " ")}`;
        sweep.outside.push(`${spec.id} (${variant}) \`${argv.join(" ")}\` ${why}`);
      }
      harness.clock.step(1_000);
    }
  }
  console.log(
    `[spec sweep] ${sweep.inside}/${sweep.total} lines inside their own contract` +
      (sweep.outside.length === 0 ? "" : `, ${sweep.outside.length} outside:`),
  );
  for (const line of sweep.outside.slice(0, 20)) console.log(`  - ${line}`);
  return sweep;
}

const sweep = await sweepSpecs();

/**
 * One command of a sequence: decode its record, run it, check its contract. A throw is the
 * finding, and the input Jazzer.js saves is the whole sequence.
 */
async function runOneCall(record: Buffer, position: number, total: number): Promise<void> {
  const controls = decodeCliControls(record, specs.length);
  const spec = specs[controls.specIndex]!;
  const call = stats.calls + 1;
  stats.calls = call;
  stats.specHits.add(spec.id);

  const rng = new ByteChoices(controls.rest);
  const argv = spec.argv(controls.variant, rng, controls.text, pools);

  const outcome = await runOneCommand(cli, argv);
  const where = `[cli] call ${position}/${total} ${spec.id} \`${argv.join(" ")}\``;
  if (outcome.threw !== null) {
    throw new Error(`${where} threw out of cli(): ${outcome.threw.stack ?? outcome.threw.message}`);
  }
  if (outcome.timedOut) {
    throw new Error(`${where} exceeded the command soft timeout`);
  }
  const exits = exitsFor(spec, controls.variant);
  if (outcome.exitCode === null || !exits.includes(outcome.exitCode)) {
    throw new Error(
      `${where} exited ${outcome.exitCode ?? "null"} outside {${exits.join(",")}} — stderr: ${outcome.stderr.slice(0, 200).replace(/\n/g, " ")}`,
    );
  }
  if (outcome.exitGuardCatch !== null) {
    // The one hard-exit face the build knows: `run --approve <unparsable>` reaches
    // resolveApprovalMode's own process.exit(1). Any other process.exit is the finding.
    if (!(spec.id === "run" && argv.includes("--approve"))) {
      throw new Error(
        `${where} called process.exit(${outcome.exitGuardCatch.code ?? ""}) at ${outcome.exitGuardCatch.where}`,
      );
    }
    stats.exitGuardCatches += 1;
  }
  if (guard.attempts.length > 0) {
    const attempts = guard.attempts
      .slice(0, 5)
      .map((attempt) => `${attempt.kind}→${attempt.target}`)
      .join("; ");
    throw new Error(`${where} attempted a non-loopback connection: ${attempts}`);
  }

  stats.exits[String(outcome.exitCode)] = (stats.exits[String(outcome.exitCode)] ?? 0) + 1;
  recordSlowCall(spec.id, outcome.ms);
  captureStdout(outcome.stdout, pools);
  harness.clock.step(1_000);
}

/**
 * One fuzz call: run the sequence of commands the input encodes.
 *
 * The input is `record (0x0a record)*` — see `splitRecords` for why a separator byte and not a
 * length prefix. Two bounds keep one input's cost predictable: at most `MAX_CALLS` commands, and
 * no new command once `SEQUENCE_BUDGET_MS` has gone by. An empty input asks for nothing.
 */
export async function fuzz(data: Buffer): Promise<void> {
  const all = splitRecords(data);
  if (all.length === 0) return;
  const records = all.slice(0, MAX_CALLS);
  if (all.length > MAX_CALLS) stats.capped += 1;
  stats.inputs += 1;
  stats.lengths[records.length] = (stats.lengths[records.length] ?? 0) + 1;
  const deadline = performance.now() + SEQUENCE_BUDGET_MS;
  for (const [index, record] of records.entries()) {
    if (performance.now() > deadline) {
      stats.budgetCuts += 1;
      break;
    }
    await runOneCall(record, index + 1, records.length);
  }
}

/**
 * Keep the slow commands visible: a count for the summary, the five slowest by name.
 */
function recordSlowCall(specId: string, ms: number): void {
  if (ms < SLOW_CALL_MS) return;
  stats.slow += 1;
  stats.slowest.push({ specId, ms });
  stats.slowest.sort((a, b) => b.ms - a.ms);
  stats.slowest.length = Math.min(stats.slowest.length, 5);
  console.log(`[cli] slow call ${specId} took ${ms}ms`);
}

/** Replay every corpus input once, in order — the reading a machine without Jazzer.js can take. */
async function selfCheck(): Promise<void> {
  const files = fs
    .readdirSync(CORPUS_DIR)
    .filter((name) => !name.startsWith("."))
    .sort();
  let failed = 0;
  for (const name of files) {
    const bytes = fs.readFileSync(path.join(CORPUS_DIR, name));
    try {
      await fuzz(bytes);
    } catch (err) {
      failed += 1;
      console.error(`[self-check] ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`[self-check] ${files.length} inputs, ${failed} failures`);
  // The harness would hold the loop open; close it and give the exit code.
  await shutdown();
  process.exit(failed > 0 ? 1 : 0);
}

/** `{1: 120, 3: 8}` → `1:120, 3:8`, shortest sequence first. */
function formatLengths(lengths: Record<number, number>): string {
  const entries = Object.entries(lengths).sort((a, b) => Number(a[0]) - Number(b[0]));
  if (entries.length === 0) return "-";
  return entries.map(([length, count]) => `${length}:${count}`).join(", ");
}

process.on("exit", () => {
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const summary = [
      "# CLI fuzz run",
      "",
      `- Commands: ${stats.calls} across ${stats.inputs} inputs, sequence lengths ${formatLengths(stats.lengths)}`,
      `- Sequence bounds: ${stats.capped} input(s) cut at ${MAX_CALLS} commands, ${stats.budgetCuts} cut by the ${SEQUENCE_BUDGET_MS}ms budget`,
      `- Slow commands (≥${SLOW_CALL_MS}ms): ${stats.slow}` +
        (stats.slowest.length === 0
          ? ""
          : ` — ${stats.slowest.map((entry) => `${entry.specId} ${entry.ms}ms`).join(", ")}`),
      `- Exit codes: ${JSON.stringify(stats.exits)}`,
      `- Spec sweep: ${sweep.inside}/${sweep.total} lines inside their own contract, ${sweep.outside.length} outside`,
      ...sweep.outside.slice(0, 10).map((line) => `  - outside: ${line}`),
      `- Commands hit: ${stats.specHits.size}/${specs.length}`,
      `- Exit-guard catches (process.exit intercepted): ${stats.exitGuardCatches}`,
      `- Config write-after-read oracle: ${oracleVisible ? "visible" : "NOT visible"}`,
      `- Outbound attempts (non-loopback): ${guard.attempts.length}`,
      `- Elapsed: ${Math.round(performance.now() - startedAt)}ms`,
      "",
    ];
    fs.writeFileSync(path.join(OUT_DIR, "summary.md"), summary.join("\n"), "utf8");
  } catch {
    // An exit handler has nobody left to tell; the fuzzer's own console output stands.
  }
});

/** Close the harness — the runner calls this once the fuzzer has stopped (see fuzz-runner.mjs). */
export async function shutdown(): Promise<void> {
  await harness.app.cleanup().catch(() => {});
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await selfCheck();
}
