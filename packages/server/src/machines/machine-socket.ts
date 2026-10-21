/**
 * A machine's API socket, through the forward held to it.
 *
 * One WebSocket at the machine's own `apiSocketPath()` over the forward
 * (machines/forwards.ts) — the same `ws` the terminal relay speaks — carrying the socket's
 * frames (socket/frames.ts): a `call` names an endpoint, a streaming call is answered
 * `stream`, then one `event` per server event, then `end`. Nothing here reads
 * text/event-stream: the machine's channel frames its own events, and the id on each `event`
 * is that machine's, which is what a re-open resumes from.
 *
 * One socket per stream, not a cache: the aggregate opens one per watched machine per tab,
 * and a socket that ends is the caller's to open again. That is all the multiplexing this
 * path needs — the ssh session under the forward is already the multiplexer.
 */
import { WebSocket } from "ws";
import { apiSocketPath } from "../socket/ref.js";
import type { ServerFrame } from "../socket/frames.js";

/** Where a machine's server answers on this side, and the session to open its socket with. */
export interface MachineSocketTarget {
  host: string;
  port: number;
  /** Its server's port OVER THERE — what the Host header must name. */
  remotePort: number;
  cookie: string;
}

/** One streaming call on a machine's socket. */
export interface MachineStream {
  /** True once the machine started the stream; false when it never did. */
  readonly opened: Promise<boolean>;
  /** Why the stream is over, in the machine's own words where there are any. */
  readonly ended: Promise<string | null>;
  /** Unsubscribes and closes the socket. */
  close(): void;
}

/** The one call id this client uses: one call per socket, so no bookkeeping is needed. */
const CALL_ID = 1;

/**
 * Opens `path` on the machine's server as a stream, over a socket of its own, and calls
 * `onEvent` for each event the machine sends until the stream ends.
 */
export function openMachineStream(
  target: MachineSocketTarget,
  path: string,
  lastEventId: string | null,
  onEvent: (event: string, eventId: string | null, data: string) => void,
): MachineStream {
  let started = false;
  let done = false;
  let settleOpened: (opened: boolean) => void = () => undefined;
  let settleEnded: (reason: string | null) => void = () => undefined;
  const opened = new Promise<boolean>((resolve) => (settleOpened = resolve));
  const ended = new Promise<string | null>((resolve) => (settleEnded = resolve));

  const socket = new WebSocket(`ws://${target.host}:${target.port}${apiSocketPath()}`, {
    headers: { host: `localhost:${target.remotePort}`, cookie: target.cookie },
    perMessageDeflate: false,
    handshakeTimeout: 10_000,
  });

  const finish = (reason: string | null): void => {
    if (done) return;
    done = true;
    settleOpened(started);
    settleEnded(reason);
    try {
      socket.close();
    } catch {
      // Already closed.
    }
  };

  socket.on("open", () => {
    socket.send(
      JSON.stringify({
        id: CALL_ID,
        call: {
          method: "GET",
          path,
          // The one header of its own a call may set (socket/frames.ts, CALL_HEADERS) is what
          // marks it a stream; `last-event-id` is the machine's own resume point.
          headers: {
            accept: "text/event-stream",
            ...(lastEventId !== null ? { "last-event-id": lastEventId } : {}),
          },
        },
      }),
    );
  });

  socket.on("message", (raw, isBinary) => {
    if (isBinary) return finish("the machine sent a binary frame");
    let frame: ServerFrame;
    try {
      frame = JSON.parse(raw.toString()) as ServerFrame;
    } catch {
      return finish("the machine sent a frame that is not JSON");
    }
    if ("heartbeat" in frame) return;
    if (frame.id !== CALL_ID) return;
    if ("stream" in frame) {
      started = true;
      return;
    }
    if ("event" in frame) return onEvent(frame.event, frame.eventId, frame.data);
    if ("end" in frame) return finish(frame.reason ?? null);
    return finish(`the machine answered ${frame.status}`);
  });

  socket.on("close", () => finish("closed"));
  socket.on("error", (err) => finish(err.message));

  return { opened, ended, close: () => finish("closed") };
}
