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
 *   leg target corpusDir buildDir coverageDir mode maxTotalTime runs artifactPrefix dict
 */
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { OptionSource, OptionsManager, startFuzzing } from "@jazzer.js/core";

const [
  leg,
  target,
  corpusDir,
  buildDir,
  coverageDir,
  mode,
  maxTotalTime,
  runs,
  artifactPrefix,
  dict,
] = process.argv.slice(2);
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
      // The call skeletons the seed step writes: the one mutation source that inserts a
      // well-formed call instead of hoping a random byte lands on the separator.
      ...(dict === undefined || dict === "" ? [] : [`-dict=${dict}`]),
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

/**
 * Load the dependencies the product reaches for lazily, before the fuzzer installs its hooks.
 *
 * The server loads its TypeScript compiler at run time (`packages/server/src/plugin/typescript.ts`)
 * and only when something needs it — a workbench compile, an interface check. Behind Jazzer's
 * instrumentation that first load means a nine-megabyte file parsed through Babel, and it lands
 * inside a fuzz call: measured at 5.4 s and about a gigabyte of RSS, once per process, which is
 * both a false soft-timeout finding and a large part of the fuzzer's memory limit. Loading it
 * here makes the product's own first compile an ordinary one. Resolution starts where the
 * product resolves it, so the module the fuzzer later asks for is already in the registry.
 */
async function warmLazyDependencies() {
  const bases = [
    path.join(buildDir, "packages", "server", "src", "plugin", "typescript.js"),
    path.join(buildDir, "packages", "server", "src", "platform.js"),
  ];
  for (const base of bases) {
    try {
      const file = createRequire(base).resolve("typescript");
      await import(pathToFileURL(file).href);
      console.log(`[fuzz] ${leg}: warmed the TypeScript compiler (${file})`);
      return;
    } catch {
      // Try the next base; the product itself has the same three-place fallback.
    }
  }
  console.log(`[fuzz] ${leg}: no TypeScript compiler to warm, the run starts cold`);
}

let code = 1;
let started = false;
await warmLazyDependencies();
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
