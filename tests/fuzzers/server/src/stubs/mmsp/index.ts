/**
 * Scripted stand-in for `@prismshadow/mmsp` (demo only).
 *
 * Why this exists: this machine's node_modules is a stale 2026-09-21 install that predates
 * the harness's adoption of MMSP, and the demo runs with no network egress, so the package
 * cannot be installed. The demo's LLM isolation happens HERE for every session the harness
 * CREATES (createSession → createAgent → manager.adopt builds a real core Session whose
 * GenerativeModel calls this client), and one level up at core's LLMInterface for sessions
 * the manager LOADS (FuzzerLLM behind the fake SessionLoader), per fuzzer-mock-design
 * DESIGN.md §4.1/§4.3.
 *
 * This stub speaks MMSP's event grammar as core's EventTranslator reads it (generative-
 * model.ts): items stream as `.delta` fragments closed by their `.done` item, and the stream
 * ends with one `stop` event carrying the usage. It answers every request locally, from a
 * fixed script — no socket, no provider, no key: a real LLM call is unreachable by
 * construction, and the demo's outbound guard independently confirms zero non-loopback
 * attempts. `constructions` and `requests` are the observability counters the end-of-run
 * report quotes; `listModels` stays a hard throw because nothing in the demo may reach it.
 */

export const constructions = { count: 0 };
/** streamingResponseStateful invocations — one per real LLM request the scripted client served. */
export const requests = { count: 0 };

/** The one reply every scripted request plays (text only: no tool call, so no server-leg tool can ever execute). */
const SCRIPTED_REPLY = "fuzzer scripted reply (mmsp stub)";

export class AutoLLMClient {
  constructor(..._args: unknown[]) {
    constructions.count += 1;
  }

  /** MMSP keeps the conversation history; the demo's client is stateless by design. */
  setHistory(_messages: unknown[]): void {}

  async *streamingResponseStateful(args: {
    message: unknown;
    config: unknown;
    signal: AbortSignal;
  }): AsyncGenerator<Record<string, unknown>> {
    requests.count += 1;
    void args;
    yield { event_type: "content", content_items: [{ type: "text.delta", text: SCRIPTED_REPLY }] };
    yield { event_type: "content", content_items: [{ type: "text.done", text: SCRIPTED_REPLY }] };
    yield {
      event_type: "stop",
      finish_reason: "stop",
      usage_metadata: {
        prompt_tokens: 7,
        response_tokens: 5,
        cached_tokens: 0,
        thoughts_tokens: 0,
      },
    };
  }

  listModels(..._args: unknown[]): never {
    throw new Error("demo mmsp stub: AutoLLMClient.listModels must never be called");
  }
}

/** The ThinkingLevel names mapThinkingLevel's table indexes; the wire values are MMSP's own and never reach a request in the demo. */
export const ThinkingLevel = {
  NONE: "none",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  XHIGH: "xhigh",
  MAX: "max",
} as const;
export type ThinkingLevel = (typeof ThinkingLevel)[keyof typeof ThinkingLevel];

export class UnsupportedParameterError extends Error {
  constructor(message = "unsupported parameter") {
    super(message);
    this.name = "UnsupportedParameterError";
  }
}

export class ApiKeyRequiredError extends Error {
  constructor(message = "api key required") {
    super(message);
    this.name = "ApiKeyRequiredError";
  }
}
