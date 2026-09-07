/**
 * Event streams: a Session's output and the user-level server events.
 *
 * - OmniMessage uses the default event (no `event:` line); data is the message envelope as
 *   raw JSON;
 * - Server events use `event: server_event` (approval_request / task_state / resync_required /
 *   credentials_updated / hello);
 * - A stream is a call on the page's one API socket (api/socket.ts, PRFC-0011), which
 *   re-issues it with `last-event-id` after any interruption (the server replays from its
 *   ring buffer; if the event was already evicted, it pushes resync_required instead). When
 *   the socket is not to be had, the same stream is an EventSource: the browser then
 *   auto-reconnects with the same header, and auth rides the same-origin cookie either way.
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
import { apiSocket } from "./socket";

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
  /** Connection established (including a successful auto-reconnect). */
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
  return apiSocket.stream(url, handlers, () => subscribeEventSource(url, handlers));
}

/** The EventSource form of a stream: the fallback when the page has no socket. */
function subscribeEventSource(url: string, handlers: StreamHandlers): StreamConnection {
  const source = new EventSource(url);
  source.onmessage = (e: MessageEvent<string>) => {
    try {
      // Every server event carries an `id:` line; lastEventId is "" only if none did.
      handlers.onOmniMessage(JSON.parse(e.data) as OmniMessage, e.lastEventId || null);
    } catch {
      // Ignore lines that fail to parse (the protocol guarantees single-line JSON data, so this shouldn't normally happen).
    }
  };
  source.addEventListener("server_event", (e: MessageEvent<string>) => {
    try {
      handlers.onServerEvent(JSON.parse(e.data) as ServerEvent, e.lastEventId || null);
    } catch {
      // Same as above.
    }
  });
  if (handlers.onOpen) source.onopen = handlers.onOpen;
  const { onError } = handlers;
  if (onError) source.onerror = () => onError(source.readyState === EventSource.CLOSED);
  return { close: () => source.close() };
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
