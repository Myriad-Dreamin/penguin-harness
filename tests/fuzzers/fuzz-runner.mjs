#!/usr/bin/env node
/**
 * Start Jazzer.js from our own process, so a fuzz run has a defined end.
 *
 * The packaged CLI only ends the process itself when a finding stops the run; after a clean
 * `-max_total_time` it merely returns, and the process then lives as long as anything holds
 * the event loop. In this harness the in-process server is listening — that is forever, and
 * the run would never come back. This runner does what the CLI does (same option object, same
 * instrumented load, same coverage report written when the fuzzer stops) and then closes the
 * harness and exits with libFuzzer's own code.
 *
 * Arguments, in order (run.mjs passes them):
 *   leg target corpusDir buildDir coverageDir mode maxTotalTime runs artifactPrefix
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { OptionSource, OptionsManager, startFuzzing } from "@jazzer.js/core";

const [leg, target, corpusDir, buildDir, coverageDir, mode, maxTotalTime, runs, artifactPrefix] =
  process.argv.slice(2);
if (leg === undefined || target === undefined) {
  console.error("usage: node fuzz-runner.mjs <leg> <target> <corpus> <build> <coverage> …");
  process.exit(2);
}

const options = new OptionsManager(OptionSource.DefaultCLIOptions);
options.merge(
  {
    fuzzTarget: pathToFileURL(target).href,
    fuzzerOptions: [
      corpusDir,
      `-max_total_time=${maxTotalTime}`,
      "-print_final_stats=1",
      `-artifact_prefix=${artifactPrefix}`,
      ...(runs === undefined || runs === "" ? [] : [`-runs=${runs}`]),
    ],
    // Instrument the compiled tree only; `node_modules` stays out via the default excludes.
    includes: [`${buildDir}${path.sep}`],
    // libFuzzer's own watchdog, in ms. The targets' soft timeouts (5 s per request, 15 s per
    // command) are shorter on purpose: they end a call as a finding anybody can read, instead
    // of letting the watchdog abort the process.
    timeout: 30_000,
    coverage: true,
    coverageDirectory: coverageDir,
    coverageReporters: ["json", "text-summary"],
    mode,
  },
  OptionSource.CommandLineArguments,
);

let code = 1;
let started = false;
try {
  const result = await startFuzzing(options);
  started = true;
  code = result.returnCode;
  console.log(`[fuzz] ${leg}: libFuzzer returned ${result.returnCode}`);
} catch (err) {
  // The cause is where Node puts the interesting part of a failed `fetch` or module load.
  const cause = err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : "";
  console.error(
    `[fuzz] ${leg}: the run failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}${cause}`,
  );
}

// The harness holds the loop open (a listening server, SQLite, the boot's own watchers).
// Closing it lets the target's `exit` handler write the run summary and the process end.
if (started) {
  try {
    const loaded = await import(pathToFileURL(path.resolve(target)).href);
    await loaded.shutdown?.();
  } catch {
    // The target is already loaded; a failure here leaves the process exiting anyway.
  }
}
process.exit(code);
