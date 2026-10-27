/**
 * FuzzerLLM — DESIGN.md §4.1's recommended mount (interface injection): implements core's
 * LLMInterface, never throws (the contract), records every newMessages list it receives, and
 * plays an editable script per call with error-injection variants. It is the single scripted
 * brain for both demo legs:
 *  - the core leg hands it straight to a real ContextEngine (engine.test.ts's FakeLLM shape);
 *  - the server leg's fake SessionLoader returns session doubles whose run() replays it,
 *    so the server-side runtime (manager, SSE, usage recording) is exercised for real.
 */
import type {
  GenerativeModelParameters,
  LLMInterface,
  LLMOutcome,
} from "../../../../packages/core/src/interfaces/llm.js";
import type { OmniMessage } from "../../../../packages/core/src/omnimessage/index.js";
import {
  assistantText,
  emptyTokenCounts,
  partialText,
  requestEnd,
  tokenUsage,
  toolCall,
} from "../../../../packages/core/src/omnimessage/index.js";

export type TurnScript =
  | { kind: "text"; text: string }
  | { kind: "tool_call"; toolName: string; args?: string }
  | {
      /** engine.test.ts's first-call shape: a text segment AND a tool call in one turn, so the engine goes around a second time. */
      kind: "text_then_tool";
      text: string;
      toolName: string;
      args?: string;
    }
  | {
      /**
       * Injects an LLM request failure THROUGH THE CONTRACT: the stream carries a
       * `request_end` event with a fatal status, so the server leg's stream-error-watcher
       * records source='llm' the way a real provider outage would — no exception is thrown,
       * the LLMInterface never-throws contract holds.
       */
      kind: "request_fail";
    }
  | { kind: "retryable" }
  | { kind: "fatal" }
  | { kind: "aborted" };

export const DEFAULT_SCRIPT: TurnScript[] = [{ kind: "text", text: "fuzzer scripted reply" }];

export class FuzzerLLM implements LLMInterface {
  /** Number of streamGenerate calls (one per engine turn). */
  calls = 0;
  /** Every newMessages list the engine handed in — for assertions and state signatures. */
  received: OmniMessage[][] = [];
  /** How many turns this instance played as a contract-visible request failure. */
  failurePlays = 0;

  constructor(private readonly script: TurnScript[] = DEFAULT_SCRIPT) {}

  async *streamGenerate(
    parameters: GenerativeModelParameters,
  ): AsyncGenerator<OmniMessage, LLMOutcome> {
    this.calls += 1;
    this.received.push(parameters.newMessages);
    const turn = this.script[(this.calls - 1) % this.script.length]!;
    switch (turn.kind) {
      case "text": {
        yield partialText("start", "");
        yield partialText("delta", turn.text);
        yield partialText("stop", "", "completed");
        yield assistantText(turn.text);
        yield tokenUsage(emptyTokenCounts(), {
          cache_read: 0,
          cache_write: 0,
          output: 5,
          total: 12,
        });
        return { status: "completed" };
      }
      case "tool_call": {
        yield toolCall({
          name: turn.toolName,
          arguments: turn.args ?? "{}",
          toolCallId: `tc-${this.calls}`,
          stopReason: "completed",
        });
        yield tokenUsage(emptyTokenCounts(), {
          cache_read: 0,
          cache_write: 0,
          output: 5,
          total: 12,
        });
        return { status: "completed" };
      }
      case "text_then_tool": {
        yield partialText("start", "");
        yield partialText("delta", turn.text);
        yield partialText("stop", "", "completed");
        yield assistantText(turn.text);
        yield toolCall({
          name: turn.toolName,
          arguments: turn.args ?? "{}",
          toolCallId: `tc-${this.calls}`,
          stopReason: "completed",
        });
        yield tokenUsage(emptyTokenCounts(), {
          cache_read: 0,
          cache_write: 0,
          output: 5,
          total: 12,
        });
        return { status: "completed" };
      }
      case "request_fail": {
        this.failurePlays += 1;
        yield requestEnd("fatal", {
          errorCode: "rate_limited",
          errorMessage: "fuzzer-injected LLM request failure",
        });
        return { status: "fatal", errorCode: "rate_limited", errorMessage: "fuzzer-injected" };
      }
      case "retryable":
        return { status: "retryable", errorCode: "timeout", errorMessage: "fuzzer-injected" };
      case "fatal":
        return { status: "fatal", errorCode: "rate_limited", errorMessage: "fuzzer-injected" };
      case "aborted":
        return { status: "aborted" };
    }
  }
}
