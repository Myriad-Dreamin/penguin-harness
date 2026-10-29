/**
 * Terminal stream transport: `GET /api/terminals/:id/stream` (Upgrade).
 *
 * Runtime, and only the transport. A WebSocket cannot cross the platform seam — a seam
 * handler returns one whole Response — so the runtime keeps what an upgrade needs: the
 * handshake itself, the Origin check, and the session-cookie authentication it already
 * owns. The moment the socket is live it is handed to the platform, which owns the
 * protocol that flows over it (terminal/stream.ts): frames, coalescing, restore
 * and backpressure are all pushable, the socket plumbing is not.
 *
 * Auth: the session cookie rides along on the upgrade request, so the same credential as
 * the REST API is used, plus an Origin check — a WebSocket handshake is not subject to
 * CORS, so without it any page the user visits could open a shell on this machine.
 */
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { isOwnOrigin, parseCookieHeader, sessionCookies } from "../auth/middleware.js";
import type { ServerHmrHost } from "../hmr/platform.js";
import type { Auth } from "../mechanisms/identity.js";
import { clientOrigin, forwardedHeaders } from "../http/forwarded.js";

const STREAM_PATH = /^\/api\/terminals\/([^/]+)\/stream$/;

/**
 * Per-viewer backpressure watermarks. `ws.send` queues without limit when the peer cannot
 * drain, so a viewer more than HIGH_WATER behind stops receiving live output — the bytes
 * keep feeding the server emulator, nothing of the session is lost — and once its socket
 * drains below LOW_WATER it is repainted with one fresh Restore frame (the same
 * self-contained repaint an attach uses) and live output resumes. Skipping ahead beats
 * both alternatives: replaying megabytes the viewer could only fast-forward through, or
 * disconnecting it (the client treats a closed stream as a dead pane, not a retry). The
 * high watermark is therefore a LAG bound — how far behind a viewer may fall before it is
 * fast-forwarded — and doubles as the per-viewer memory bound.
 */
const BACKPRESSURE_HIGH_WATER = 1024 * 1024;
const BACKPRESSURE_LOW_WATER = 64 * 1024;
const BACKPRESSURE_POLL_MS = 250;

export interface TerminalWebSocketDeps {
  /** The booted platform owns the terminals; the runtime asks it per upgrade. */
  hmr: ServerHmrHost;
  /**
   * The current App's auth service, read per handshake — the runtime's wiring resolves
   * the App of the moment behind the read, so a tree mid-swap or a generation without
   * one throws out of it, and the listener answers from the generation it captured
   * instead (see attachTerminalWebSocket).
   */
  authService: Auth;
  log: (line: string) => void;
  /** PENGUIN_TRUST_PROXY: whether the upgrade's forwarded scheme and host name the browser's origin. */
  trustProxy?: boolean;
}

export function attachTerminalWebSocket(server: HttpServer, deps: TerminalWebSocketDeps): void {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

  // The last-good shape the app face already gives its per-call resolutions (app.ts's
  // `current`): the auth service of the generation that last answered is held here, taken
  // once at attach and re-taken by every handshake the tree of the moment resolves. A
  // handshake that lands in the window between one generation's dispose and the next
  // generation's first answer is authenticated by that captured generation — its modules
  // are gone, but the singletons behind them (the db, the channels) are the runtime's
  // and still answer. Nothing captured and nothing live (a bare kernel) is the 503 below.
  let captured: Auth | undefined;
  const resolveAuth = (): Auth | null => {
    try {
      captured = deps.authService;
    } catch {
      // The tree is mid-swap or belongs to a generation without one: the capture stands.
    }
    return captured ?? null;
  };
  resolveAuth();

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = upgradeUrl(req, deps.trustProxy === true);
    const match = STREAM_PATH.exec(url.pathname);
    // Not ours: leave the socket alone so another upgrade handler (or the default
    // "no handler -> destroy" behaviour) can deal with it.
    if (!match) return;

    if (!isAllowedOrigin(req)) return refuse(socket, 403, "Forbidden");

    // This origin's own cookie first, then the plain one (auth/middleware.ts): a browser
    // holds the port-named one, a non-browser client the plain one, and either may be the
    // token this handshake is signed in with.
    const tokens = sessionCookies(parseCookieHeader(req.headers.cookie), req.headers.host).map(
      ({ token }) => token,
    );
    if (tokens.length === 0) return refuse(socket, 401, "Unauthorized");

    // Request-time authentication of the handshake: nothing here may throw — an escape
    // out of an `upgrade` listener is an uncaughtException that takes the whole process
    // down, which one handshake in a swap window was enough to do. No auth face to
    // authenticate with (nothing live, nothing captured) is the designed 503, the same
    // refusal the extension's gate gives for a generation without one.
    let authed: ReturnType<Auth["authenticateWithMeta"]> | null = null;
    try {
      const auth = resolveAuth();
      if (auth === null) return refuse(socket, 503, "Service Unavailable");
      authed =
        tokens.map((token) => auth.authenticateWithMeta(token)).find((a) => a !== null) ?? null;
    } catch (err: unknown) {
      deps.log(
        `[terminal] stream handshake could not authenticate: ${err instanceof Error ? err.message : String(err)}`,
      );
      return refuse(socket, 503, "Service Unavailable");
    }
    if (!authed) return refuse(socket, 401, "Unauthorized");

    // The platform may be mid-swap; ensure() resolves the instance that owns the
    // terminals right now, which is also the one whose protocol should serve this socket.
    void deps.hmr
      .ensure()
      .then((platform) => {
        const manager = platform.api.terminals?.();
        const session = manager?.get(match[1] as string);
        if (!session || session.ownerUserId !== authed.user.userId) {
          return refuse(socket, 404, "Not Found");
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          platform.api.attachStream?.(ws, session, url, deps.log);
        });
      })
      .catch((err: unknown) => {
        deps.log(`[terminal] stream upgrade failed: ${err instanceof Error ? err.message : err}`);
        refuse(socket, 500, "Internal Server Error");
      });
  });
}

/**
 * A WebSocket handshake bypasses CORS entirely, so any origin may attempt one and the cookie
 * still rides along. Only a genuinely same-origin page may connect: host AND port must match
 * the Host the browser targeted — the same rule every write is held to (auth/middleware.ts).
 */
function isAllowedOrigin(req: IncomingMessage): boolean {
  return isOwnOrigin(req.headers.origin, req.headers.host);
}

/**
 * The upgrade's URL as the browser addressed it — the origin every call on the API socket is
 * then made under (hmr/platform.ts), so a route that names this server back to the browser (a
 * provider's redirect, a preview link, the hub's forwarded host for a machine) names the host
 * and port the page is on. `localhost` only when the handshake carried no usable Host.
 */
function upgradeUrl(req: IncomingMessage, trustProxy: boolean): URL {
  const path = req.url ?? "/";
  const host = req.headers.host;
  if (host === undefined || host === "") return new URL(path, "http://localhost");
  try {
    const header = (name: string): string | undefined => {
      const value = req.headers[name];
      return Array.isArray(value) ? value[0] : value;
    };
    return new URL(path, clientOrigin(`http://${host}/`, forwardedHeaders(header), trustProxy));
  } catch {
    return new URL(path, "http://localhost");
  }
}

function refuse(socket: Duplex, status: number, text: string): void {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}
