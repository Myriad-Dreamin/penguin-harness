/**
 * The in-process harness both fuzzers boot.
 *
 * It is the repository's own test shape — `bootAppDeps` → `seedAdmin` → `createApp` — with two
 * replacements and nothing else: `FuzzerClock` through the `Replacements` array, and SQLite's
 * path redirected to a disposable root (the real engine, so the API fuzzer can introspect it
 * from a second, read-only connection). The SessionLoader is the production one: a Session the
 * manager loads is rebuilt by core (`createAgent` → `resumeSession` / `createSession`), and a
 * Session it creates is adopted the same way, so the Agent, the ContextEngine, the Environment
 * and the tools are the product's own code on both paths.
 *
 * The model is the one mock (stubs/mmsp), installed by the build's module table before anything
 * imports it. `model-script.ts` turns each fuzz call's bytes into the turns that mock plays, so
 * the model's behaviour is part of the input space instead of a fixed sentence.
 *
 * The loopback listener is the same `@hono/node-server` `serve()` the production entry uses,
 * bound to an ephemeral port: the CLI fuzzer answers its own requests from the app in memory
 * (cli/src/fetch-shim.ts), and the listener stays the way in for anything that reaches for a
 * socket instead of the global fetch.
 */
import { assembleDemo, type DemoApp } from "./assemble.js";
import { FuzzerClock } from "./fuzzer-clock.js";
import type { VirtualTime } from "./virtual-time.js";

export interface Harness {
  app: DemoApp;
  clock: FuzzerClock;
}

export interface HarnessOptions {
  /**
   * The leg's own clock. The server's Clock seam then follows it instead of standing still, so
   * a jump the leg makes is 2026-10-26 plus the same jump on the server side.
   */
  vtime?: VirtualTime;
}

/** Boot a disposable server the two fuzzers share the shape of; `app.cleanup()` when done. */
export async function bootHarness(options: HarnessOptions = {}): Promise<Harness> {
  const vtime = options.vtime;
  const clock = new FuzzerClock(
    "2026-10-26T00:00:00Z",
    vtime === undefined ? undefined : () => vtime.now(),
  );
  const app = await assembleDemo(clock);
  return { app, clock };
}
