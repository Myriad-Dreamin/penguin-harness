/**
 * API-surface fuzzer — entry point.
 *
 * Boots the in-process harness (see `harness.ts`) and drives the API cross-section: a
 * fixed-seed, *stateful* request sequence against the real Hono app through
 * `app.request()` — resource pools are captured from successful responses and fed back
 * into later `:param` slots, credentials rotate between anon / bearer / cookie, and the
 * clock jumps 31 days every 40 steps to cross the 30-day session TTL. After every step the
 * leg opens a second, read-only SQLite connection and checks the three invariants (no
 * exception escapes a handler, no process-level error row appears, no unexpected error row
 * outside the scripted LLM failures). One step samples the real loopback event stream.
 *
 * Run from the repository root (Node 24):
 *
 *   node tests/fuzzers/run.mjs server
 *
 * Artifacts (written next to this package, gitignored):
 *   out/api-sequence.jsonl   one serialized request per line
 *   out/api-transcript.md    the same sequence as a table plus per-run counters
 *   out/run-summary.md       the run's own account, findings included
 *
 * Exit code 0 when no finding was recorded, 1 otherwise (90 when the hard cap fires).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { runApiLeg } from "./api-leg.js";
import type { Finding } from "./finding.js";
import { installOutboundGuard } from "./guards.js";
import { bootHarness } from "./harness.js";

/** Whole-run ceiling: the plan's 180s, after which the process gives up with partial results. */
const HARD_LIMIT_MS = 180_000;
const OUT_DIR = path.resolve(import.meta.dirname, "../out");

const hardTimer: NodeJS.Timeout = setTimeout(() => {
  console.error("FUZZ HARD TIME LIMIT REACHED — exiting with partial results (exit 90)");
  process.exit(90);
}, HARD_LIMIT_MS);
hardTimer.unref?.();

const findings: Finding[] = [];
const transcript: string[] = [];

// A crash outside the legs' own guards is a finding, not a lost run: the process-level
// handlers record it and the legs keep going.
process.on("uncaughtException", (err) => {
  findings.push({
    leg: "process",
    step: 0,
    kind: "uncaught_exception",
    detail: `uncaughtException during the run: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
  });
});
process.on("unhandledRejection", (reason) => {
  findings.push({
    leg: "process",
    step: 0,
    kind: "unhandled_rejection",
    detail: `unhandledRejection during the run: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`,
  });
});

const guard = installOutboundGuard();
const savedPenguinHome = process.env.PENGUIN_HOME;
const startedAt = performance.now();
let cleanup: (() => Promise<void>) | null = null;

try {
  console.log(
    "[fuzz:server] booting the in-process harness (bootAppDeps → seedAdmin → createApp → loopback)",
  );
  const harness = await bootHarness();
  cleanup = () => harness.app.cleanup();
  console.log(`[fuzz:server] app ready (disposable root, loopback :${harness.app.listener.port})`);

  console.log("[fuzz:server] API section (request sequence, state introspection, invariants)");
  const api = await runApiLeg(harness.app, harness.loader, OUT_DIR, transcript);
  findings.push(...api.findings);
  console.log(
    `[fuzz:server] API done: ${api.steps} steps, ${api.signatures} state signatures, statuses ${JSON.stringify(api.statusCounts)}, findings=${api.findings.length}`,
  );

  // The mmsp stub is the deeper LLM seam: every createSession builds a real core session
  // that calls it. Its counters are code coverage, not violations — the no-real-LLM
  // guarantee is that it answers locally, and the outbound guard below is the independent
  // proof for the whole process. Imported by path, so the reading is the same module the
  // product's `@prismshadow/mmsp` specifier resolves to under tsconfig.run.json.
  const mmsp = await import("./stubs/mmsp/index.js");
  if (guard.attempts.length !== 0) {
    findings.push({
      leg: "process",
      step: 0,
      kind: "outbound_attempt",
      detail: `${guard.attempts.length} non-loopback network attempt(s): ${guard.attempts
        .slice(0, 5)
        .map((attempt) => `${attempt.kind}→${attempt.target}`)
        .join("; ")}`,
    });
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, "api-transcript.md"), `${transcript.join("\n")}\n`, "utf8");

  const elapsed = Math.round(performance.now() - startedAt);
  const summary = [
    "# API fuzzer — run summary",
    "",
    `- Elapsed: ${elapsed}ms (hard cap ${HARD_LIMIT_MS}ms)`,
    `- API: ${api.steps} steps; ${api.signatures} distinct state signatures; status counts ${JSON.stringify(api.statusCounts)}; auth ${JSON.stringify(api.authModeCounts)}; cookie re-logins ${api.reLogins}`,
    `- API error_records at end: llm-injected rows ${api.llmFailureRows} (script plays ${api.llmFailurePlays})`,
    `- mmsp stub: ${mmsp.constructions.count} client constructions, ${mmsp.requests.count} scripted requests served (all local)`,
    `- Outbound attempts (non-loopback): ${guard.attempts.length}`,
    `- Findings: ${findings.length}`,
    "",
    findings.length > 0 ? "## Findings" : "## Findings (none)",
    "",
    ...findings.map(
      (finding) => `- [${finding.leg}#${finding.step}] ${finding.kind}: ${finding.detail}`,
    ),
    "",
  ];
  await fs.writeFile(path.join(OUT_DIR, "run-summary.md"), summary.join("\n"), "utf8");
  console.log(summary.join("\n"));
} catch (err) {
  // The driver's own failure is a finding like any other: recorded, written, exit non-zero.
  findings.push({
    leg: "process",
    step: 0,
    kind: "driver_crashed",
    detail: `the fuzz driver itself failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
  });
  try {
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(
      path.join(OUT_DIR, "run-summary.md"),
      [
        "# API fuzzer — run summary (CRASHED)",
        "",
        ...findings.map((f) => `- [${f.leg}#${f.step}] ${f.kind}: ${f.detail}`),
        "",
      ].join("\n"),
      "utf8",
    );
  } catch {
    // even the summary write failed; the console line below is all that is left
  }
  console.error(
    `[fuzz:server] DRIVER CRASHED: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
  );
} finally {
  guard.uninstall();
  try {
    await cleanup?.();
  } catch {
    // cleanup is best-effort; the temp root is disposable
  }
  if (savedPenguinHome === undefined) delete process.env.PENGUIN_HOME;
  else process.env.PENGUIN_HOME = savedPenguinHome;
  clearTimeout(hardTimer);
}

process.exit(findings.length > 0 ? 1 : 0);
