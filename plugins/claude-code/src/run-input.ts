/**
 * Typing into a running run's program (`POST …/runs/:id/input`): what a caller that is not a
 * signed-in browser — the server's API token, an employee's Session — uses to hand an idle
 * Claude Code a line, where the terminal's own `/keys` route answers only a browser sign-in.
 *
 * The text is LITERAL and printable: every C0 control, DEL and every C1 control is refused, so
 * the route cannot be used to send key sequences (Ctrl-C, Escape, a cursor key, a bracketed
 * paste end) — the only key it presses is Enter, after the text, and only when asked.
 */
import { PROMPT_MAX, QueueError } from "./runs.js";

/** Any C0 control (Tab, CR and LF included), DEL, or C1 control. */
const CONTROL = /[\x00-\x1f\x7f-\x9f]/;

/**
 * The pause between the text and its Enter. Claude Code reads a chunk that carries text and a
 * carriage return together as a PASTE, and a pasted CR is a newline in the prompt, not a submit;
 * two writes this far apart arrive as typing and then a key press.
 */
export const ENTER_DELAY_MS = 150;

/** What a caller asks to type. */
export interface RunInput {
  text: string;
  /** Press Enter after the text. */
  enter: boolean;
}

/** The body's text and `enter` (default true), or a 400 saying what is wrong with them. */
export function runInputOf(body: Record<string, unknown>): RunInput {
  const text = body.text;
  if (typeof text !== "string" || text.trim() === "") {
    throw new QueueError(400, "text_required", "Input needs a non-empty `text`.");
  }
  if (text.length > PROMPT_MAX) {
    throw new QueueError(400, "text_too_long", `Input is at most ${PROMPT_MAX} characters.`);
  }
  if (CONTROL.test(text)) {
    throw new QueueError(
      400,
      "control_characters",
      "Input is printable text only: control characters (newlines included) are refused.",
    );
  }
  const enter = body.enter;
  if (enter !== undefined && typeof enter !== "boolean") {
    throw new QueueError(400, "bad_enter", "`enter` is a boolean.");
  }
  return { text, enter: enter ?? true };
}
