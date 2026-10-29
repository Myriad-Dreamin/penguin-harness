/**
 * The scripted model's turns, read out of one fuzz call's own bytes.
 *
 * The model is the harness's only mock (stubs/mmsp), and this is the seam that makes it
 * fuzzable: before a call runs, the leg installs a short turn list here, so the same bytes that
 * choose an endpoint or an argv also choose whether the model answers in prose, calls a tool,
 * renders an a2ui block, or fails the request. Without this the mocked model answers one fixed
 * sentence and every path behind a tool call (Environment, the tool layer, the engine's second
 * round) is unreachable no matter how long the fuzzer runs.
 *
 * Deterministic by construction: the same record always yields the same script, which is what
 * keeps a libFuzzer finding replayable.
 */
import { payloadText } from "./input.js";
import type { ModelTurn } from "./stubs/mmsp/index.js";

/** Where a file tool is pointed: inside the workspace, then the escape shapes a guard must refuse. */
const FILE_TARGETS = ["fuzz.txt", "notes/fuzz.txt", "../../escape.txt", "/tmp/fuzz-outside.txt"] as const;

/** Tools the builtin environment offers; a wrong name is its own (unknown tool) path. */
const TOOL_NAMES = ["exec_command", "read_file", "write_file", "edit_file", "input_command"] as const;

/** A valid a2ui block (the catalog's callout) — the model's structured-output path. */
function a2uiBlock(text: string): string {
  const body = text === "" ? "fuzzed" : text;
  return "```a2ui\n" + JSON.stringify({ type: "callout", tone: "info", text: body }) + "\n```";
}

export function modelScriptFor(record: Buffer): ModelTurn[] {
  const bytes = record.length === 0 ? Buffer.from([0]) : record;
  const at = (index: number): number => bytes[index % bytes.length]!;
  const text = payloadText(bytes.subarray(2), 72);
  const reply = text === "" ? "fuzzer scripted reply" : `done: ${text}`;
  const target = FILE_TARGETS[at(3) % FILE_TARGETS.length]!;
  const toolName = TOOL_NAMES[at(3) % TOOL_NAMES.length]!;

  let first: ModelTurn;
  switch (at(2) % 12) {
    case 0:
    case 1:
    case 2:
      first = { kind: "text", text: reply };
      break;
    case 3:
      first = { kind: "text", text: a2uiBlock(text) };
      break;
    case 4:
    case 5:
      first = {
        kind: "tool",
        name: "exec_command",
        // The command is the payload: a shell string the model was handed, which is exactly
        // the surface tools/command/* exists for. Empty payload → the cheapest no-op.
        args: { cmd: text === "" ? "true" : `echo ${text}` },
      };
      break;
    case 6:
      first = { kind: "tool", name: "read_file", args: { file_path: target } };
      break;
    case 7:
      first = { kind: "tool", name: "write_file", args: { file_path: target, content: text } };
      break;
    case 8:
      first = {
        kind: "tool",
        name: "edit_file",
        args: { file_path: target, old_string: "a", new_string: text },
      };
      break;
    case 9:
      // The malformed shapes: no arguments at all, and an argument of the wrong type. Both are
      // the tool-argument validator's own contract (tool-arguments.ts).
      first =
        at(3) % 2 === 0
          ? { kind: "tool", name: toolName, args: {} }
          : { kind: "tool", name: toolName, args: { cmd: at(3), file_path: 42 } };
      break;
    case 10:
      first = { kind: "fail", error: `fuzzer-injected provider failure (${at(3)})` };
      break;
    default:
      first = { kind: "abort" };
      break;
  }

  // The second turn closes the loop: a model that keeps calling tools never ends its run, and a
  // run that never ends is a soft-timeout finding rather than coverage.
  return [first, { kind: "text", text: reply }];
}
