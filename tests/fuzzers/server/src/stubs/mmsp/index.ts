/**
 * Scripted stand-in for `@prismshadow/mmsp` (demo only) — the ONLY mock this harness installs.
 *
 * Why it exists: this machine's node_modules predates the harness's adoption of MMSP, and the
 * demo runs with no network egress, so the package cannot be installed. The isolation is at the
 * model boundary, which is where a mocked model belongs: every session the demo runs is a real
 * core Session (real Agent, real ContextEngine, real Environment and tools); only the model's
 * stream is scripted. A session the manager LOADS and one it CREATES go through the same client,
 * so there is no second seam to keep in step.
 *
 * The script is one list of turns; the fuzz target sets it per call from the call's own bytes
 * (see `model-script.ts`), so a mutation moves the model's reply the same way it moves a request
 * or an argv — a tool call, an a2ui block, a provider failure, or plain text.
 *
 * This stub speaks MMSP's event grammar as core's EventTranslator reads it (generative-
 * model.ts): items stream as `.delta` fragments closed by their `.done` item, and the stream
 * ends with one `stop` event carrying the usage. A tool call is emitted as its complete `.done`
 * item alone — the translator closes an item that never opened, allocating the id itself.
 * `listModels` stays a hard throw: nothing in the demo may reach a provider.
 */

export const constructions = { count: 0 };
/** streamingResponseStateful invocations — one per real LLM request the scripted client served. */
export const requests = { count: 0 };
/** How many requests played each turn kind (the end-of-run report quotes these). */
export const plays = { text: 0, tool: 0, fail: 0, abort: 0 };

/** One turn of the scripted model. */
export type ModelTurn =
  | { kind: "text"; text: string }
  /** One tool call; arguments are already an object (the translator stringifies them). */
  | { kind: "tool"; name: string; args: Record<string, unknown> }
  /** The provider fails the request: the stream rejects, core classifies it as retryable. */
  | { kind: "fail"; error: string }
  /** The user stops the request mid-stream. */
  | { kind: "abort" };

/** What a session plays when the fuzz target set nothing (setup runs, self-check of an empty input). */
const DEFAULT_TURNS: readonly ModelTurn[] = [{ kind: "text", text: "fuzzer scripted reply (mmsp stub)" }];

let plan: readonly ModelTurn[] = DEFAULT_TURNS;
let cursor = 0;

/** Install the turns the next model requests play, in order, cycling. Called once per fuzz call. */
export function setModelPlan(turns: readonly ModelTurn[]): void {
  plan = turns.length === 0 ? DEFAULT_TURNS : turns;
  cursor = 0;
}

/** Back to the default reply (a run that leaves no plan behind must not leak into the next). */
export function resetModelPlan(): void {
  plan = DEFAULT_TURNS;
  cursor = 0;
}

/** The turn the next request will play — the driver's own reading, for a finding's report. */
export function nextModelTurn(): ModelTurn {
  return plan[cursor % plan.length]!;
}

const USAGE = {
  prompt_tokens: 11,
  response_tokens: 7,
  cached_tokens: 0,
  thoughts_tokens: 0,
};

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
    const turn = plan[cursor % plan.length]!;
    cursor += 1;
    switch (turn.kind) {
      case "fail": {
        plays.fail += 1;
        // A thrown provider error is what core classifies (retryable unless it names auth),
        // and it is the shape a real outage takes at this seam.
        throw new Error(turn.error);
      }
      case "abort": {
        plays.abort += 1;
        throw Object.assign(new Error("aborted by the user"), { name: "AbortError" });
      }
      case "tool": {
        plays.tool += 1;
        yield {
          event_type: "content",
          content_items: [
            {
              type: "tool_call.done",
              name: turn.name,
              // The translator reads a complete call's arguments as an object.
              arguments: turn.args,
              tool_call_id: `fuzz-tc-${requests.count}`,
            },
          ],
        };
        yield { event_type: "stop", finish_reason: "tool_call", usage_metadata: USAGE };
        return;
      }
      case "text": {
        plays.text += 1;
        yield { event_type: "content", content_items: [{ type: "text.delta", text: turn.text }] };
        yield { event_type: "content", content_items: [{ type: "text.done", text: turn.text }] };
        yield { event_type: "stop", finish_reason: "stop", usage_metadata: USAGE };
        return;
      }
    }
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
