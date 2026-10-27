/**
 * The in-process harness both fuzzers boot.
 *
 * It is the repository's own test shape — `bootAppDeps` → `seedAdmin` → `createApp` — with
 * the two mocks the prototype proved: `FuzzerClock` through the `Replacements` array and
 * `FuzzerSessionLoader` through `CoreSessionLoaders`' `create()`. SQLite stays the real
 * engine, redirected to a disposable root, so the API fuzzer can introspect it from a
 * second, read-only connection. The loopback listener is the same `@hono/node-server`
 * `serve()` the production entry uses, bound to an ephemeral port — the CLI fuzzer drives
 * real HTTP over it while the API fuzzer calls `app.request()` directly.
 *
 * Everything the legs hit is the repository's own production code: Hono routing,
 * `validate.ts`, the services, the SessionManager, SQLite persistence.
 */
import { assembleDemo, type DemoApp } from "./assemble.js";
import { FuzzerSessionLoader } from "./fake-loader.js";
import { FuzzerClock } from "./fuzzer-clock.js";
import type { TurnScript } from "./fuzzer-llm.js";

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

/** Boot a disposable server the two fuzzers share the shape of. Call `app.cleanup()` when done. */
export async function bootHarness(): Promise<Harness> {
  const loader = new FuzzerSessionLoader(
    (_row, index) => SERVER_SCRIPTS[index % SERVER_SCRIPTS.length]!,
  );
  const clock = new FuzzerClock("2026-10-26T00:00:00Z");
  const app = await assembleDemo(loader, clock);
  return { app, loader, clock };
}
