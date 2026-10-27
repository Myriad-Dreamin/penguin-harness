/**
 * CLI-surface fuzzer — entry point.
 *
 * Boots the same in-process harness the API fuzzer uses (it lives in the sibling package,
 * which is why `tsconfig.json` includes `../server/src`) and drives the repository's own
 * `cli(argv)` — commander over the same server, reached through `PENGUIN_API_URL` on the
 * harness's loopback port. Every step records its argv array verbatim: the command line is
 * this surface's serialization format.
 *
 * The run is a fixed setup pipeline followed by a deterministically shuffled corpus pass:
 * `config model add --set-default` writes `.project_config.toml` locally, and after the
 * server's freshness window the same server must see that write through
 * `GET /api/projects/default_project/models` — the config write-after-read oracle. Each
 * command runs behind an exit guard (the one hard `process.exit` face becomes observable)
 * with stdio captured and a soft timeout; an exit code outside the spec's allowed set is a
 * finding.
 *
 * Run from the repository root (Node 24):
 *
 *   node tests/fuzzers/run.mjs cli
 *
 * Artifacts (written next to this package, gitignored):
 *   out/cli-sequence.jsonl   one argv array per line
 *   out/cli-transcript.md    the same sequence as a table plus per-run counters
 *   out/run-summary.md       the run's own account, findings included
 *
 * Exit code 0 when no finding was recorded, 1 otherwise (90 when the hard cap fires).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { bootHarness } from "../../server/src/harness.js";
import type { Finding } from "../../server/src/finding.js";
import { installOutboundGuard } from "../../server/src/guards.js";
import { runCliLeg } from "./cli-leg.js";

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
  console.log("[fuzz:cli] booting the in-process harness (the server the commands talk to)");
  const harness = await bootHarness();
  cleanup = () => harness.app.cleanup();
  console.log(`[fuzz:cli] app ready (disposable root, loopback :${harness.app.listener.port})`);

  console.log("[fuzz:cli] CLI section (setup pipeline + shuffled corpus, argv serialization)");
  const cli = await runCliLeg(harness.app, OUT_DIR, transcript);
  findings.push(...cli.findings);
  console.log(
    `[fuzz:cli] CLI done: ${cli.steps} commands, exits ${JSON.stringify(cli.exitCodeCounts)}, oracle=${cli.oracleVisible ? "visible" : "NOT-VISIBLE"}, findings=${cli.findings.length}`,
  );

  // The mmsp stub is the deeper LLM seam; see the server entry. Imported by path, so the
  // reading is the same module the product's `@prismshadow/mmsp` specifier resolves to
  // under tsconfig.run.json.
  const mmsp = await import("../../server/src/stubs/mmsp/index.js");
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
  await fs.writeFile(path.join(OUT_DIR, "cli-transcript.md"), `${transcript.join("\n")}\n`, "utf8");

  const elapsed = Math.round(performance.now() - startedAt);
  const summary = [
    "# CLI fuzzer — run summary",
    "",
    `- Elapsed: ${elapsed}ms (hard cap ${HARD_LIMIT_MS}ms)`,
    `- CLI: ${cli.steps} commands; exit codes ${JSON.stringify(cli.exitCodeCounts)}; config write-after-read oracle ${cli.oracleVisible ? "visible" : "NOT visible"}; exit-guard catches ${cli.exitGuardCatches}`,
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
        "# CLI fuzzer — run summary (CRASHED)",
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
    `[fuzz:cli] DRIVER CRASHED: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
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
