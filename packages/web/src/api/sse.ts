/**
 * SSE (EventSource) wrapper.
 *
 * - OmniMessage uses the default event (no `event:` line); data is the message envelope as
 *   raw JSON;
 * - Server events use `event: server_event` (approval_request / task_state / resync_required /
 *   credentials_updated / hello);
 * - EventSource can't set custom request headers, so auth relies on same-origin cookies; on
 *   disconnect, the browser auto-reconnects and attaches a `Last-Event-ID` header (the server
 *   replays from its ring buffer; if the event was already evicted, it pushes resync_required
 *   instead).
 * - Liveness: a connection can die without any error (half-open TCP, a stuck proxy or NAT).
 *   Once a stream has sent a `ping` (the server's heartbeat, every 20 s), {@link SILENCE_MS}
 *   without any event closes it and opens a new one with `?lastEventId=` set to the last id
 *   seen; the tab becoming visible checks at once, since background timers run late. A stream
 *   that never pinged (an older server), or that the browser gave up on, is left as it is.
 * Docs: /docs/server-api § "Streaming (SSE)".
 */
import type { OmniMessage } from "@prismshadow/penguin-core/omnimessage";
import type {
  HostedBrowserFrame,
  HostedBrowserViewport,
  ServerEvent,
} from "@prismshadow/penguin-server/api";
import { apiUrl } from "../lib/server-context";
import { machineForSession } from "../lib/session-machines";

/** The server pings every 20 s: this much silence means the connection is gone. */
const SILENCE_MS = 50_000;

export interface StreamHandlers {
  /**
   * A single OmniMessage (full/streaming/event, envelope as-is). `eventId` is the SSE
   * event id assigned by the server channel (`<epoch>-<seq>`; null if the event carried
   * none) — stream-controller uses it to align buffered events with the live-tail cursor
   * that GET /messages returns.
   */
  onOmniMessage: (msg: OmniMessage, eventId: string | null) => void;
  /** A single server event (`eventId`: same as onOmniMessage). */
  onServerEvent: (event: ServerEvent, eventId: string | null) => void;
  /** Connection established (including a successful auto-reconnect, and a reopen after silence). */
  onOpen?: () => void;
  /**
   * Connection error. `closed` is true when the browser has deemed the connection fatally
   * broken and closed it (e.g. the handshake returned 401/403, so it won't auto-reconnect);
   * when false, the browser will auto-reconnect and no manual handling is needed.
   */
  onError?: (closed: boolean) => void;
}

export interface StreamConnection {
  close: () => void;
}

function subscribe(url: string, handlers: StreamHandlers): StreamConnection {
  let source: EventSource | undefined;
  /** The newest event id seen on any of this subscription's connections. */
  let lastEventId = "";
  let lastHeard = 0;
  /** The stream has pinged, so silence means a dead connection. */
  let armed = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;

  const heard = (e: MessageEvent<string>) => {
    lastHeard = Date.now();
    if (e.lastEventId) lastEventId = e.lastEventId;
  };
  const onMessage = (e: MessageEvent<string>) => {
    heard(e);
    try {
      // Every server event carries an `id:` line; lastEventId is "" only if none did.
      handlers.onOmniMessage(JSON.parse(e.data) as OmniMessage, e.lastEventId || null);
    } catch {
      // Ignore lines that fail to parse (the protocol guarantees single-line JSON data, so this shouldn't normally happen).
    }
  };
  const onServerEvent = (e: MessageEvent<string>) => {
    heard(e);
    try {
      handlers.onServerEvent(JSON.parse(e.data) as ServerEvent, e.lastEventId || null);
    } catch {
      // Same as above.
    }
  };
  const onPing = (e: MessageEvent<string>) => {
    heard(e);
    armed = true;
    check();
  };
  const onError = () => {
    const closed = source?.readyState === EventSource.CLOSED;
    // The browser gave up on the connection: what happens next is the caller's call, as before.
    if (closed) disarm();
    handlers.onError?.(closed);
  };
  const connect = () => {
    source?.close();
    lastHeard = Date.now();
    source = new EventSource(
      lastEventId ? `${url}?lastEventId=${encodeURIComponent(lastEventId)}` : url,
    );
    source.onmessage = onMessage;
    source.addEventListener("server_event", onServerEvent);
    source.addEventListener("ping", onPing);
    if (handlers.onOpen) source.onopen = handlers.onOpen;
    source.onerror = onError;
  };

  /** Reopens a stream silent for the whole window; otherwise waits out the rest of it. */
  const check = () => {
    clearTimeout(watchdog);
    if (!armed) return;
    if (Date.now() - lastHeard >= SILENCE_MS) connect();
    watchdog = setTimeout(check, lastHeard + SILENCE_MS - Date.now());
  };
  const disarm = () => {
    armed = false;
    clearTimeout(watchdog);
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") check();
  };

  document.addEventListener("visibilitychange", onVisibility);
  connect();
  return {
    close: () => {
      disarm();
      document.removeEventListener("visibilitychange", onVisibility);
      source?.close();
    },
  };
}

/** Subscribes to a Session's output stream (GET /api/sessions/:sessionId/stream). */
export function openSessionStream(sessionId: string, handlers: StreamHandlers): StreamConnection {
  // Routed like every other Session call: the stream comes from the machine running it.
  const path = `/api/sessions/${encodeURIComponent(sessionId)}/stream`;
  return subscribe(apiUrl(path, machineForSession(sessionId)), handlers);
}

/**
 * Subscribes to the user-level server event stream (GET /api/events) — this server's, or a
 * machine's through the same-origin proxy. A Session on a machine changes state on THAT
 * machine's server, and only its stream says so; the list is assembled from every connected
 * machine, so its liveness has to be too.
 */
export function openUserEvents(
  handlers: StreamHandlers,
  machineId: string | null = null,
): StreamConnection {
  return subscribe(apiUrl("/api/events", machineId), handlers);
}

export interface BrowserViewHandlers {
  /** One frame of the tab's picture. */
  onFrame: (frame: HostedBrowserFrame) => void;
  /**
   * The stream is over: the server ended it (the tab closed, its Chrome exited), refused it, or
   * the connection broke. Called once; the connection is closed by then.
   */
  onEnd: () => void;
}

/**
 * Watches a hosted tab (GET /api/builtin-browser/tabs/:id/view): the picture of a tab of the
 * Chrome that `server` runs — this server, or a machine through the same-origin proxy — laid out
 * to `viewport`. Unlike the event channels this stream has no replay and ends for good with its
 * tab, so the browser's own reconnect is switched off: the first error closes it and the caller
 * decides whether to watch again.
 */
export function openBrowserView(
  tabId: number,
  viewport: HostedBrowserViewport,
  server: string | null,
  handlers: BrowserViewHandlers,
): StreamConnection {
  const query = `width=${viewport.width}&height=${viewport.height}`;
  const source = new EventSource(
    apiUrl(`/api/builtin-browser/tabs/${tabId}/view?${query}`, server),
  );
  source.addEventListener("frame", (e: MessageEvent<string>) => {
    try {
      handlers.onFrame(JSON.parse(e.data) as HostedBrowserFrame);
    } catch {
      // A frame that fails to parse is skipped; the next one replaces it anyway.
    }
  });
  source.onerror = () => {
    source.close();
    handlers.onEnd();
  };
  return { close: () => source.close() };
}
