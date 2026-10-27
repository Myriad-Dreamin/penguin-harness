/**
 * CLI cross-section sequence generator (DESIGN.md §5.2): drives the repo's own `cli(argv)`
 * (packages/cli/src/index.ts — commander over the same in-process server) through a fixed
 * setup pipeline and a deterministically shuffled corpus pass. The serialization format for
 * this leg is the command line itself: every step records its argv array verbatim in
 * out/cli-sequence.jsonl.
 *
 * Non-invasive mounting, same as the API leg: the CLI resolves its server through
 * PENGUIN_API_URL (client.ts's resolution order, step 2), so no auto-start is ever attempted;
 * its auth token comes from the boot's own `<root>/api-token`. The exit guard makes the one
 * known hard-exit face (`resolveApprovalMode` → process.exit(1)) observable instead of fatal,
 * and the corpus exercises it on purpose.
 *
 * Invariants (violations are findings, the run continues):
 *  1. every command's exit code is inside its spec's allowed set;
 *  2. no command throws out of cli() (a thrown command is a finding; the exit-guard
 *     sentinel is expected exactly once, on the approve.bogus step);
 *  3. no command exceeds its soft timeout;
 *  4. the I-11 mini-oracle: the setup's `config model add --set-default` (a local
 *     .project_config.toml write by core's addModel) becomes visible to the running server's
 *     GET /api/projects/default_project/models after the mtime-gate freshness window
 *     (FRESH_MS = 2000ms; the leg waits 2.2s) — the CLI and the server reading one file.
 */
import fs from "node:fs/promises";
import type { DemoApp } from "../../server/src/assemble.js";
import { cliCorpus, lastJsonLine, type CliGenCtx, type CliPools, type Variant } from "./corpus.js";
import type { Finding } from "../../server/src/finding.js";
import { DemoProcessExit, captureStdio, installExitGuard } from "../../server/src/guards.js";
import { withSoftTimeout } from "../../server/src/api-leg.js";
import { Rng } from "../../server/src/rng.js";
import { serializeLine, tokensOf } from "../../server/src/serialize.js";

/** Plan's scale ceiling for this leg: at most 60 commands, single process, loopback only. */
export const CLI_STEP_BUDGET = 60;
/** Per-command soft timeout — commands carry their own --timeout caps below this. */
const COMMAND_SOFT_TIMEOUT_MS = 15_000;
/** The I-11 oracle's wait: FRESH_MS (2000) + slack, so the server's read sees a stable mtime. */
const CONFIG_FRESH_WAIT_MS = 2_200;
export const CLI_SEED = 0x5eed_c11a;

export interface CliLegResult {
  steps: number;
  findings: Finding[];
  exitCodeCounts: Record<string, number>;
  oracleVisible: boolean;
  exitGuardCatches: number;
}

/** One serialized command (the artifact out/cli-sequence.jsonl is made of these). */
interface CliSequenceLine {
  step: number;
  spec: string;
  /** The command-line serialization format, verbatim. */
  argv: string[];
  observed: {
    exitCode: number | null;
    ms: number | null;
    /**
     * Which streams the command wrote to — a fact about the command. The byte counts are
     * left out on purpose: a command that prints its own elapsed time (a `run`) prints a
     * different number of bytes on a different machine, and the sequence is the run's
     * reproducible artifact, not a record of this machine's speed.
     */
    output: "none" | "stdout" | "stderr" | "both";
    phase: "setup" | "corpus";
  };
}

interface OneCommandOutcome {
  exitCode: number | null;
  ms: number;
  stdout: string;
  stderr: string;
  /** Non-null exactly when the command reached a process.exit the guard intercepted. */
  exitGuardCatch: { code: number | undefined; where: string } | null;
  /** Non-null when cli() rejected with something other than the exit-guard sentinel. */
  threw: Error | null;
  /** True when the soft timeout decided the race. */
  timedOut: boolean;
}

async function runOneCommand(
  cli: (argv: string[]) => Promise<number>,
  argv: string[],
): Promise<OneCommandOutcome> {
  const guard = installExitGuard();
  const io = captureStdio();
  const t0 = performance.now();
  let exitCode: number | null = null;
  let exitGuardCatch: OneCommandOutcome["exitGuardCatch"] = null;
  let threw: Error | null = null;
  let timedOut = false;
  try {
    const raced = await withSoftTimeout(cli(argv), COMMAND_SOFT_TIMEOUT_MS);
    if (raced.ok) {
      exitCode = raced.value;
    } else if (raced.threw instanceof DemoProcessExit) {
      // The known hard-exit face: the guard's sentinel surfaces here, through the timeout
      // wrapper's rejection channel — the code the command asked process.exit for is in the
      // guard's own record.
      exitGuardCatch = guard.calls[guard.calls.length - 1] ?? {
        code: raced.threw.code,
        where: "?",
      };
      exitCode = exitGuardCatch.code ?? null;
    } else if (raced.threw !== null) {
      threw = raced.threw;
    } else {
      timedOut = true;
    }
  } catch (err) {
    // Defensive: withSoftTimeout settles every path, so this only fires on a bug in the
    // wrapper itself — still recorded rather than crashing the leg.
    threw = err instanceof Error ? err : new Error(String(err));
  } finally {
    io.restore();
    guard.uninstall();
  }
  return {
    exitCode,
    ms: Math.round(performance.now() - t0),
    stdout: io.out.join(""),
    stderr: io.err.join(""),
    exitGuardCatch,
    threw,
    timedOut,
  };
}

export async function runCliLeg(
  app: DemoApp,
  outDir: string,
  transcriptLines: string[],
): Promise<CliLegResult> {
  const { cli } = await import("../../../../packages/cli/src/index.js");
  const findings: Finding[] = [];
  const lines: CliSequenceLine[] = [];
  const exitCodeCounts: Record<string, number> = {};
  const pools: CliPools = { sessions: [], schedules: [] };
  const rng = new Rng(CLI_SEED);
  let step = 0;
  let exitGuardCatches = 0;
  let oracleVisible = false;

  // The CLI leg's environment: the data root is the server's, the API URL points at the
  // in-process loopback listener (resolution step 2 — the lock and auto-start are never
  // reached), the proxy never applies to loopback, and dates are UTC.
  //
  // SCRUBBED FIRST: when this demo itself runs inside a server-driven Session (the usual
  // case here — the parent harness injects PENGUIN_API_TOKEN / PENGUIN_PROJECT_ID /
  // PENGUIN_AGENT_ID / PENGUIN_SESSION_ID into its tool subprocesses), those variables
  // would leak in: the CLI prefers PENGUIN_API_TOKEN over the token file (client.ts), so
  // the parent's token would be sent to the demo's server and 401 with a misleading
  // rotation message. Clearing them isolates the leg; the saved values are restored after.
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
  setEnv("PENGUIN_HOME", app.root);
  // localhost, not 127.0.0.1: the canonical-host guard treats 127.0.0.1 as the preview host.
  setEnv("PENGUIN_API_URL", `http://localhost:${app.listener.port}`);
  setEnv("NO_PROXY", "127.0.0.1,localhost,::1");
  setEnv("TZ", "UTC");

  const record = (
    specId: string,
    argv: string[],
    outcome: OneCommandOutcome,
    phase: CliSequenceLine["observed"]["phase"],
  ): void => {
    step += 1;
    exitCodeCounts[String(outcome.exitCode)] = (exitCodeCounts[String(outcome.exitCode)] ?? 0) + 1;
    const wrote = { out: outcome.stdout.length > 0, err: outcome.stderr.length > 0 };
    lines.push({
      step,
      spec: specId,
      argv,
      observed: {
        exitCode: outcome.exitCode,
        ms: outcome.ms,
        output:
          wrote.out && wrote.err ? "both" : wrote.out ? "stdout" : wrote.err ? "stderr" : "none",
        phase,
      },
    });
  };

  const checkExit = (
    spec: { id: string; exits: number[] },
    outcome: OneCommandOutcome,
    phase: string,
  ): void => {
    if (outcome.threw !== null) {
      findings.push({
        leg: "cli",
        step,
        kind: "command_threw",
        detail: `${phase} ${spec.id}: cli() threw ${outcome.threw.message}`,
      });
    } else if (outcome.timedOut) {
      findings.push({
        leg: "cli",
        step,
        kind: "command_timeout",
        detail: `${phase} ${spec.id} exceeded the ${COMMAND_SOFT_TIMEOUT_MS}ms soft timeout`,
      });
    } else if (outcome.exitCode !== null && !spec.exits.includes(outcome.exitCode)) {
      findings.push({
        leg: "cli",
        step,
        kind: "exit_code_out_of_set",
        detail: `${phase} ${spec.id}: exit code ${outcome.exitCode} is outside the allowed set {${spec.exits.join(",")}} — stderr: ${outcome.stderr.slice(0, 160).replace(/\n/g, " ")}`,
      });
    }
  };

  try {
    // ---- Setup phase: config model add (local file write) → I-11 oracle → agent create → one real run ----
    const setupConfig: Array<{ id: string; argv: string[]; exits: number[] }> = [
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
          "default_project",
          "--root",
          app.root,
          "--set-default",
        ],
        exits: [0],
      },
      {
        id: "setup.agent.create",
        argv: ["agent", "create", "--agent-id", "fuzz_cli", "--project-id", "default_project"],
        exits: [0, 1],
      },
      {
        id: "setup.run.first",
        argv: ["run", "-m", "fuzz cli first run", "--json", "--timeout", "10s"],
        exits: [0],
      },
    ];

    for (const spec of setupConfig) {
      const outcome = await runOneCommand(cli, spec.argv);
      record(spec.id, spec.argv, outcome, "setup");
      checkExit(spec, outcome, "setup");
      if (spec.id === "setup.config.model.add" && outcome.exitCode !== 0) {
        findings.push({
          leg: "cli",
          step,
          kind: "setup_model_add_failed",
          detail: `config model add exited ${outcome.exitCode}: ${outcome.stderr.slice(0, 200)}`,
        });
      }
      if (spec.id === "setup.run.first") {
        const parsed = lastJsonLine(outcome.stdout) as { sessionId?: string } | null;
        if (parsed !== null && typeof parsed.sessionId === "string") {
          pools.sessions.push(parsed.sessionId);
        }
      }
      app.clock.step(1_000);
    }

    // ---- I-11 mini-oracle: the file the CLI wrote becomes the server's answer ----
    await new Promise((resolve) => setTimeout(resolve, CONFIG_FRESH_WAIT_MS));
    const modelsRes = await app.app.request("/api/projects/default_project/models", {
      headers: { authorization: `Bearer ${app.apiToken}`, "content-type": "application/json" },
    });
    const modelsBody = JSON.stringify(await modelsRes.json().catch(() => null));
    oracleVisible = modelsBody.includes("fuzz-model");
    if (!oracleVisible) {
      findings.push({
        leg: "cli",
        step,
        kind: "oracle_model_not_visible",
        detail: `after config model add + ${CONFIG_FRESH_WAIT_MS}ms, GET /api/projects/default_project/models does not list fuzz-model (status ${modelsRes.status})`,
      });
    }

    // ---- Corpus pass: deterministic shuffle, ok/bad variants ----
    const corpus = cliCorpus();
    const corpusStart = step;
    const order = corpus.map((spec, i) => ({ spec, k: rng.next() * 1000 + i }));
    order.sort((a, b) => a.k - b.k);
    let executed = 0;
    for (const { spec } of order) {
      if (executed >= CLI_STEP_BUDGET - corpusStart) break;
      executed += 1;
      const ctx: CliGenCtx = { rng, pools, step };
      const variant: Variant = rng.chance(0.25) ? "bad" : "ok";
      const argv = spec.argv(ctx, variant);
      const outcome = await runOneCommand(cli, argv);
      record(spec.id, argv, outcome, "corpus");
      checkExit(spec, outcome, "corpus");
      if (outcome.exitGuardCatch !== null) {
        exitGuardCatches += 1;
        if (spec.id !== "run.approve.bogus") {
          findings.push({
            leg: "cli",
            step,
            kind: "exit_guard_caught",
            detail: `${spec.id} called process.exit(${outcome.exitGuardCatch.code ?? ""}) at ${outcome.exitGuardCatch.where}`,
          });
        }
      }
      spec.capture?.(outcome.stdout, pools, variant);
      app.clock.step(1_000);
    }
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  await fs.mkdir(outDir, { recursive: true });
  // Captured ids and the disposable root are written as their provenance and timing stays
  // in this transcript, so the same seed writes the same bytes (see server/src/serialize.ts).
  const tokens = tokensOf(pools, app.root);
  const jsonl = lines.map((line) => serializeLine(line, tokens)).join("\n") + "\n";
  await fs.writeFile(`${outDir}/cli-sequence.jsonl`, jsonl, "utf8");

  transcriptLines.push(
    `## CLI cross-section (${lines.length} commands, argv serialization format)`,
    "",
  );
  transcriptLines.push(
    "Every line of `cli-sequence.jsonl` is one command line (argv array) plus its exit code — PENGUIN_HOME/PENGUIN_API_URL point every command at the in-process server. The same seed writes the same bytes: ids captured from earlier commands appear as their provenance (`$sessions[0]`) and the disposable root as `$root`, while the wall-clock `ms` column below stays out of the sequence.",
    "",
  );
  transcriptLines.push("| step | spec | argv | exit | ms | phase |", "|---|---|---|---|---|---|");
  for (const line of lines) {
    const argv = line.argv.length === 0 ? "(bare `penguin`)" : `\`${line.argv.join(" ")}\``;
    transcriptLines.push(
      `| ${line.step} | ${line.spec} | ${argv.slice(0, 90)} | ${line.observed.exitCode ?? "—"} | ${line.observed.ms} | ${line.observed.phase} |`,
    );
  }
  transcriptLines.push("");
  transcriptLines.push(
    `- Exit codes: ${Object.entries(exitCodeCounts)
      .sort()
      .map(([c, n]) => `${c}×${n}`)
      .join(", ")}`,
    `- I-11 oracle (CLI file write → server models read after ${CONFIG_FRESH_WAIT_MS}ms): ${oracleVisible ? "visible ✓" : "NOT visible ✗"}`,
    `- Exit-guard catches (process.exit intercepted): ${exitGuardCatches}`,
    `- Session pool captured: ${pools.sessions.length}; schedule pool: ${pools.schedules.length}`,
    "",
  );

  return { steps: lines.length, findings, exitCodeCounts, oracleVisible, exitGuardCatches };
}
