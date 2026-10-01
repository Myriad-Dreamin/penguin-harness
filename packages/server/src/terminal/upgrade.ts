/**
 * Terminal stream handshake: `GET /api/terminals/:id/stream` (Upgrade).
 *
 * Platform code. The entry hands every upgrade to the current generation through the
 * upgrade seam (hmr/upgrade-seam.ts) and reads nothing of it; this is where the handshake
 * is decided — the path, the Origin check, the session cookie and the terminal's owner —
 * so changing any of it ships by push. Once the socket is live it is bound to the stream
 * protocol (terminal/stream.ts, or the machine relay for a remote pty).
 *
 * Auth: the session cookie rides along on the upgrade request, so the same credential as
 * the REST API is used, plus an Origin check — a WebSocket handshake is not subject to
 * CORS, so without it any page the user visits could open a shell on this machine.
 */
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { SESSION_COOKIE } from "../auth/middleware.js";
import { refuseUpgrade } from "../hmr/upgrade-seam.js";
import type { AuthenticatesSessions } from "./identity.js";
import type { TerminalManager } from "./manager.js";
import type { TerminalSession } from "./session.js";

const STREAM_PATH = /^\/api\/terminals\/([^/]+)\/stream$/;

export interface TerminalUpgradeDeps {
  /** This App's auth; null on a bare kernel, which authenticates nobody (fail-closed). */
  auth: AuthenticatesSessions | null;
  terminals: () => TerminalManager;
  /** Binds a live socket to its session's stream protocol. */
  attach: (ws: WebSocket, session: TerminalSession, url: URL) => void;
}

/**
 * The platform's `upgrade` for terminal streams: true when the path is a terminal stream
 * (the socket is then answered or refused here), false for any other path.
 */
export function terminalUpgrade(
  deps: TerminalUpgradeDeps,
): (req: IncomingMessage, socket: Duplex, head: Buffer) => boolean {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  return (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const match = STREAM_PATH.exec(url.pathname);
    if (!match) return false;

    if (!isAllowedOrigin(req)) {
      refuseUpgrade(socket, 403, "Forbidden");
      return true;
    }
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    const authed =
      token !== null && deps.auth !== null ? deps.auth.authenticateWithMeta(token) : null;
    if (!authed) {
      refuseUpgrade(socket, 401, "Unauthorized");
      return true;
    }
    const session = deps.terminals().get(match[1] as string);
    if (!session || session.ownerUserId !== authed.user.userId) {
      refuseUpgrade(socket, 404, "Not Found");
      return true;
    }
    wss.handleUpgrade(req, socket, head, (ws) => deps.attach(ws, session, url));
    return true;
  };
}

/**
 * A WebSocket handshake bypasses CORS entirely, so any origin may attempt one and the cookie
 * still rides along. Only a genuinely same-origin page may connect: host AND port must match
 * the Host the browser targeted. Cookies are port-agnostic, so anything looser (hostname-only,
 * or a blanket loopback allowance) would let a page served by any other local server ride the
 * session cookie into a shell. The Vite dev server proxies with `changeOrigin: false`, so the
 * browser's own Host survives the proxy and this comparison holds in development too.
 */
function isAllowedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser client (CLI, tests): no ambient cookie to abuse
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return parsed.host === (req.headers.host ?? "");
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      // A malformed percent escape is an invalid credential, not a server error.
      return null;
    }
  }
  return null;
}
