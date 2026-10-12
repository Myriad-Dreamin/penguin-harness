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
  log: (line: string) => void;
}

export function attachTerminalWebSocket(server: HttpServer, deps: TerminalWebSocketDeps): void {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const match = STREAM_PATH.exec(url.pathname);
    // Not ours: leave the socket alone so another upgrade handler (or the default
    // "no handler -> destroy" behaviour) can deal with it.
    if (!match) return;

    if (!isAllowedOrigin(req)) return refuse(socket, 403, "Forbidden");

    const cookies = sessionCookies(parseCookieHeader(req.headers.cookie), req.headers.host);
    if (cookies.length === 0) return refuse(socket, 401, "Unauthorized");

    // Resolve credentials, terminals and the stream protocol from the same platform.
    // A plugin re-assembly can dispose a tree without replacing the platform instance.
    void deps.hmr
      .ensure()
      .then((platform) => {
        const auth = authOf(platform);
        if (auth === null) {
          deps.log("[terminal] stream upgrade refused: no Auth in the current platform");
          return refuse(socket, 503, "Service Unavailable");
        }
        const authed =
          cookies.map(({ token }) => auth.authenticateWithMeta(token)).find((a) => a !== null) ??
          null;
        if (!authed) return refuse(socket, 401, "Unauthorized");
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

/** Read the serving App's Auth; a missing or disposed tree must fail closed. */
function authOf(platform: Awaited<ReturnType<ServerHmrHost["ensure"]>>): Auth | null {
  try {
    const business =
      typeof platform.api.business === "function" ? platform.api.business() : null;
    return business?.api<Auth>("IdentityModule", "Auth") ?? null;
  } catch {
    return null;
  }
}

/**
 * A WebSocket handshake bypasses CORS entirely, so any origin may attempt one and the cookie
 * still rides along. Only a genuinely same-origin page may connect: host AND port must match
 * the Host the browser targeted — the same rule every write is held to (auth/middleware.ts).
 */
function isAllowedOrigin(req: IncomingMessage): boolean {
  return isOwnOrigin(req.headers.origin, req.headers.host);
}

function refuse(socket: Duplex, status: number, text: string): void {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}
