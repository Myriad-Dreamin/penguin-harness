/**
 * The in-process harness both fuzzers boot.
 *
 * It is the repository's own test shape — `bootAppDeps` → `seedAdmin` → `createApp` — with
 * the two mocks the prototype proved: `FuzzerClock` through the `Replacements` array and
 * `FuzzerSessionLoader` through `CoreSessionLoaders`' `create()`. SQLite stays the real
 * engine, redirected to a disposable root, so the API fuzzer can introspect it from a
 * second, read-only connection. The loopback listener is the same `@hono/node-server`
 * `serve()` the production entry uses, bound to an ephemeral port: the CLI fuzzer answers its
 * own requests from the app in memory (cli/src/fetch-shim.ts), and the listener stays the way
 * in for anything that reaches for a socket instead of the global fetch.
 *
 * Everything the legs hit is the repository's own production code: Hono routing,
 * `validate.ts`, the services, the SessionManager, SQLite persistence.
 */
import { assembleDemo, type DemoApp } from "./assemble.js";
import { FuzzerSessionLoader } from "./fake-loader.js";
import { FuzzerClock } from "./fuzzer-clock.js";
import type { TurnScript } from "./fuzzer-llm.js";
import type { VirtualTime } from "./virtual-time.js";

/**
 * The fake loader's script rotation: every session the harness loads cycles through these —
 * a plain reply, a turn with a tool call, and one contract-visible LLM failure (the failure
 * the API leg's invariants account for against the scripted play count).
 */
export const SERVER_SCRIPTS: TurnScript[][] = [
  [{ kind: "text", text: "fuzzer scripted reply" }],
  [
    {
      kind: "text_then_tool",
      text: "fuzzer scripted turn with a tool call",
      toolName: "exec_command",
      args: JSON.stringify({ cmd: "echo must-not-run" }),
    },
  ],
  [{ kind: "request_fail" }],
];

export interface Harness {
  app: DemoApp;
  loader: FuzzerSessionLoader;
  clock: FuzzerClock;
}

export interface HarnessOptions {
  /**
   * The leg's own clock. The server's Clock seam then follows it instead of standing still, so
   * a jump the leg makes is 2026-10-26 plus the same jump on the server side.
   */
  vtime?: VirtualTime;
}

/** Boot a disposable server the two fuzzers share the shape of. Call `app.cleanup()` when done. */
export async function bootHarness(options: HarnessOptions = {}): Promise<Harness> {
  const loader = new FuzzerSessionLoader(
    (_row, index) => SERVER_SCRIPTS[index % SERVER_SCRIPTS.length]!,
  );
  const vtime = options.vtime;
  const clock = new FuzzerClock(
    "2026-10-26T00:00:00Z",
    vtime === undefined ? undefined : () => vtime.now(),
  );
  const app = await assembleDemo(loader, clock);
  return { app, loader, clock };
}
