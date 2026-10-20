/**
 * The aggregate stream (`GET /api/projects/:projectId/machines/events`): one response per tab,
 * carrying every watched machine's own events, each tagged with the machine it came from.
 *
 * Each machine is one ORDINARY HTTP STREAM through the forward held to it
 * (machines/forwards.ts): `GET /api/events` on that machine's server, read as text/event-stream
 * and re-tagged. There is no socket, no hub and no buffer in the middle — the machine's own
 * channel already replays from its last event id and answers `resync_required` when it cannot,
 * so a reconnecting reader is told to resync here too rather than being replayed from a copy
 * this server would have to keep and bound.
 *
 * The set of machines is not fixed when the stream opens. A tab keeps its one stream for as
 * long as it shows the Project, so a machine this server connects to later joins the stream it
 * already holds; that is re-read on every beat. A machine that goes away is detached, and one
 * that comes back is attached again.
 */
import http from "node:http";
import { HEARTBEAT_MS } from "../http/sse.js";
import { formatSseEvent } from "../socket/sse-text.js";
import type { StreamAnswer } from "../socket/stream-answer.js";

/** Where a watched machine's server answers on this side, and the session to reach it with. */
export interface WatchedTarget {
  host: string;
  port: number;
  /** Its server's port OVER THERE — what the Host header must name. */
  remotePort: number;
  cookie: string;
}

/** A machine a tab watches: its own id, and how to read its connection right now. */
export interface WatchedMachine {
  machineId: string;
  /** The machine's forward, or null while this server holds none to it. */
  target: () => Promise<WatchedTarget | null>;
}

export interface AggregateOptions {
  /** The stream's own beat, so a tab can tell a live aggregate from a stalled one. */
  heartbeatMs?: number;
  /** How many bytes a tab may fall behind on its own stream before it is ended and left to re-issue. */
  highWaterBytes?: number;
  /** The socket transport's own answer, when it is the caller (socket/stream-answer.ts). */
  answer?: StreamAnswer | null;
  /** How long to wait before re-opening a machine's stream; doubles up to the cap. */
  retryMs?: { first: number; max: number };
}

/** A tab that stops reading is ended rather than buffered for: this is its queue, in bytes. */
const SUBSCRIBER_HIGH_WATER_BYTES = 4 << 20;

/** One parsed event off a text/event-stream response. */
interface SseFrame {
  id: string | null;
  event: string;
  data: string;
}

/** Splits a text/event-stream body into frames; comments and blank lines are structure, not events. */
class SseReader {
  #pending = "";
  #id: string | null = null;
  #event: string | null = null;
  #data: string[] = [];

  feed(chunk: string): SseFrame[] {
    const out: SseFrame[] = [];
    this.#pending += chunk;
    for (;;) {
      const nl = this.#pending.indexOf("\n");
      if (nl === -1) break;
      let line = this.#pending.slice(0, nl);
      this.#pending = this.#pending.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line === "") {
        const frame = this.#take();
        if (frame !== null) out.push(frame);
        continue;
      }
      this.#line(line);
    }
    return out;
  }

  #line(line: string): void {
    if (line.startsWith(":")) return; // a comment: the far side's heartbeat
    const colon = line.indexOf(":");
    const name = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (name === "id") this.#id = value;
    else if (name === "event") this.#event = value;
    else if (name === "data") this.#data.push(value);
  }

  #take(): SseFrame | null {
    if (this.#event === null && this.#data.length === 0) {
      this.#id = null;
      return null;
    }
    const frame = {
      id: this.#id,
      event: this.#event ?? "message",
      data: this.#data.join("\n"),
    };
    this.#id = null;
    this.#event = null;
    this.#data = [];
    return frame;
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Opens one tab's aggregate. `watched` answers which machines the tab watches right now: it is
 * read once as the stream opens and again on every beat, and a machine is attached once its
 * forward answers. The stream opens at once whatever the machines behind it are doing.
 */
export function machineEventsStream(
  watched: () => readonly WatchedMachine[],
  lastEventId: string | null,
  log: (line: string) => void = () => undefined,
  options: AggregateOptions = {},
): Response {
  const answer = options.answer ?? null;
  const encoder = new TextEncoder();
  const highWater = options.highWaterBytes ?? SUBSCRIBER_HIGH_WATER_BYTES;
  const retry = options.retryMs ?? { first: 500, max: 10_000 };
  /** The machines this tab is listening to, by id; `stop` ends that machine's reader. */
  const feeds = new Map<string, () => void>();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let ended = false;
  let beat: ReturnType<typeof setInterval> | null = null;
  /** Event ids this stream mints: opaque to the tab, unique across the machines it carries. */
  let sequence = 0;

  const stop = (): void => {
    if (ended) return;
    ended = true;
    if (beat !== null) clearInterval(beat);
    beat = null;
    for (const stopFeed of feeds.values()) stopFeed();
    feeds.clear();
    try {
      controller?.close();
    } catch {
      // Already closed by the consumer.
    }
    answer?.end("closed");
  };

  /** Writes one frame. Nothing is buffered here: the machine's own channel does the replay. */
  const write = (event: string, data: string, id: string | null): void => {
    if (ended) return;
    if (answer !== null) {
      answer.event(event, id, data);
      return;
    }
    if (controller === null) return;
    controller.enqueue(encoder.encode(formatSseEvent({ id, event, data })));
    if (controller.desiredSize !== null && controller.desiredSize <= 0) {
      log(
        `[machines] an aggregate event stream is over ${highWater} bytes behind; ending it so the tab re-issues`,
      );
      stop();
    }
  };

  /**
   * Follows one machine's `/api/events` for as long as the tab lives: opens through its
   * forward, re-tags every `server_event` frame, and re-opens — with the machine's own last
   * event id, so its channel replays what this reader missed — after a drop, with a backoff.
   */
  const follow = (machine: WatchedMachine): (() => void) => {
    let closed = false;
    let request: http.ClientRequest | null = null;
    let resumeFrom: string | null = null;

    const pump = async (): Promise<void> => {
      let wait = retry.first;
      while (!closed && !ended) {
        const target = await machine.target().catch(() => null);
        if (closed || ended) return;
        if (target === null) {
          // No forward yet: the machine is not connected. The beat re-reads the set, and this
          // loop keeps asking in its own time — a connect that lands later is picked up here.
          await sleep(wait);
          wait = Math.min(wait * 2, retry.max);
          continue;
        }
        const opened = await new Promise<boolean>((resolve) => {
          const headers: Record<string, string> = {
            accept: "text/event-stream",
            host: `localhost:${target.remotePort}`,
            cookie: target.cookie,
          };
          if (resumeFrom !== null) headers["last-event-id"] = resumeFrom;
          const req = http.request(
            {
              agent: false,
              host: target.host,
              port: target.port,
              path: "/api/events",
              method: "GET",
              headers,
            },
            (res) => {
              const kind = res.headers["content-type"] ?? "";
              if ((res.statusCode ?? 0) !== 200 || !kind.includes("text/event-stream")) {
                res.resume();
                resolve(false);
                return;
              }
              const reader = new SseReader();
              res.setEncoding("utf8");
              res.on("data", (chunk: string) => {
                for (const frame of reader.feed(chunk)) {
                  if (frame.id !== null) resumeFrom = frame.id;
                  if (frame.event !== "server_event" || frame.data === "") continue;
                  sequence += 1;
                  write(
                    "machine_event",
                    `{"machineId":${JSON.stringify(machine.machineId)},"event":${frame.data}}`,
                    `${machine.machineId}:${sequence}`,
                  );
                }
              });
              res.on("end", () => resolve(true));
              // A reader torn down while its machine's server is restarting ends with `close`
              // and not always with `end`: either way the stream that opened is over.
              res.on("close", () => resolve(true));
              res.on("error", () => resolve(true));
            },
          );
          request = req;
          req.on("error", () => resolve(false));
          req.end();
        });
        request = null;
        if (closed || ended) return;
        if (opened) {
          // The stream opened and then ended: the machine restarted, or its channel closed
          // this reader. Re-open after the first backoff rather than at once.
          wait = retry.first;
          await sleep(wait);
        } else {
          log(
            `[machines] ${machine.machineId}: its /api/events stream could not be opened; retrying`,
          );
          await sleep(wait);
          wait = Math.min(wait * 2, retry.max);
        }
      }
    };
    void pump();

    return () => {
      closed = true;
      request?.destroy();
      request = null;
    };
  };

  /** Attaches the machines this tab watches and has not attached yet; drops the ones gone. */
  const join = (machines: readonly WatchedMachine[]): void => {
    const current = new Set(machines.map((machine) => machine.machineId));
    for (const [machineId, stopFeed] of feeds) {
      if (current.has(machineId)) continue;
      stopFeed();
      feeds.delete(machineId);
    }
    for (const machine of machines) {
      if (feeds.has(machine.machineId)) continue;
      feeds.set(machine.machineId, follow(machine));
    }
  };

  // The stream opens before anything is written into it — an HTTP reader gets the Response
  // with its own queue, the socket's answer its start frame — so the handshake below is
  // written into an open stream, never dropped.
  let response: Response;
  if (answer === null) {
    response = new Response(
      new ReadableStream<Uint8Array>(
        {
          start: (c) => {
            controller = c;
          },
          cancel: () => stop(),
        },
        new ByteLengthQueuingStrategy({ highWaterMark: highWater }),
      ),
      {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          "x-accel-buffering": "no",
        },
      },
    );
  } else {
    answer.start(200, { "content-type": "text/event-stream" });
    // The one release path (socket/serve.ts): a cancel frame or the socket closing aborts
    // the call's Request, which ends this stream the way cancelling the HTTP body does.
    answer.signal.addEventListener("abort", stop, { once: true });
    if (answer.signal.aborted) stop();
    response = new Response(null, { status: 200 });
  }

  if (lastEventId === null) {
    // As on /api/events: a fresh subscriber is handed the handshake, not the history.
    write("server_event", JSON.stringify({ type: "hello" }), null);
  } else {
    // This stream keeps no buffer of its own: the id a reconnecting tab brings back cannot be
    // turned into "what you missed" here (the machines' channels are where replay lives, and
    // they are addressed per machine). The tab re-reads what it shows instead.
    write("server_event", JSON.stringify({ type: "resync_required" }), null);
  }
  join(watched());

  beat = setInterval(() => {
    write("heartbeat", "{}", null);
    if (ended) return;
    try {
      join(watched());
    } catch (err) {
      log(
        `[machines] could not read the machines an aggregate event stream watches: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, options.heartbeatMs ?? HEARTBEAT_MS);
  beat.unref?.();

  return response;
}
