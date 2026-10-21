/**
 * The text/event-stream wire format: what this server writes, and what a reader of a stream
 * reads back.
 *
 * Where a stream can cross as the events it already are, it does: the socket transport
 * answers them directly (socket/stream-answer.ts), and hono's own `writeSSE` writes the
 * Session and user channels (http/sse.ts). `formatSseEvent` is the writer for the two faces
 * that build a Response by hand — the machine aggregate and the socket relay (machines/) —
 * whose HTTP readers still get text. `SseReader` is the reader, for the one place this server
 * consumes another server's stream: the machine aggregate, reading each machine's
 * `/api/events` over its forward (machines/aggregate-stream.ts).
 *
 * Only the fields this server's own SSE protocol uses are modelled: `id`, `event`, `data`.
 * `data` is a single line in this server's protocol (single-line JSON); the writer splits a
 * multi-line payload as the spec says, so a foreign payload would still come out well-formed.
 */

export interface SseEvent {
  /** The `id:` line, or null when the event carried none. */
  id: string | null;
  /** The `event:` line; "message" when absent (the browser's EventSource default). */
  event: string;
  /** The joined `data:` lines. */
  data: string;
}

/** One event in wire form, terminated by its blank line. */
export function formatSseEvent(event: SseEvent): string {
  let text = "";
  if (event.id !== null) text += `id: ${event.id}\n`;
  if (event.event !== "message") text += `event: ${event.event}\n`;
  for (const line of event.data.split("\n")) text += `data: ${line}\n`;
  return `${text}\n`;
}

/**
 * Incremental reader: feed chunks in any split, collect events as they complete. A trailing
 * partial line is held until the next chunk; `flush()` at end-of-stream dispatches an event
 * whose terminating blank line never came (a stream cut mid-event). A comment line is
 * structure, not an event — which is how a heartbeat crosses without being one — and a field
 * this protocol does not use (`retry`) is ignored.
 */
export class SseReader {
  #pending = "";
  #id: string | null = null;
  #event: string | null = null;
  #data: string[] = [];

  feed(chunk: string): SseEvent[] {
    const out: SseEvent[] = [];
    this.#pending += chunk;
    for (;;) {
      const nl = this.#pending.indexOf("\n");
      if (nl === -1) break;
      let line = this.#pending.slice(0, nl);
      this.#pending = this.#pending.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      const event = this.#line(line);
      if (event !== null) out.push(event);
    }
    return out;
  }

  /** Dispatches what a cut stream left unterminated; null once nothing is pending. */
  flush(): SseEvent | null {
    if (this.#pending !== "") {
      const line = this.#pending;
      this.#pending = "";
      const event = this.#line(line);
      if (event !== null) return event;
    }
    return this.#dispatch();
  }

  #line(line: string): SseEvent | null {
    if (line === "") return this.#dispatch();
    if (line.startsWith(":")) return null; // comment (heartbeat)
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (field) {
      case "id":
        this.#id = value;
        break;
      case "event":
        this.#event = value;
        break;
      case "data":
        this.#data.push(value);
        break;
      default:
        break; // retry and unknown fields: ignored
    }
    return null;
  }

  #dispatch(): SseEvent | null {
    if (this.#data.length === 0 && this.#event === null && this.#id === null) return null;
    const event: SseEvent = {
      id: this.#id,
      event: this.#event ?? "message",
      data: this.#data.join("\n"),
    };
    this.#id = null;
    this.#event = null;
    this.#data = [];
    return event;
  }
}
