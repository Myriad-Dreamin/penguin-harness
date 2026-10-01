/**
 * The platform's upgrade seam — the WebSocket half of http-seam.ts.
 *
 * The HTTP seam carries a Request in and a whole Response out, so it cannot carry a live
 * socket. This one hands the raw upgrade over instead — the request, the socket and the
 * first bytes — to the generation that is current, exactly as the HTTP seam hands over a
 * request. Which paths upgrade, how the Origin and the session are checked and what protocol
 * runs on the socket afterwards are the platform's (terminal/upgrade.ts): this file reads no
 * cookie, checks no Origin and knows no path, so changing any of that ships by push.
 *
 * - **A platform that declines** (returns false, or has no `upgrade` — one pushed before
 *   this seam existed) is answered 404: nothing on this server upgrades that path.
 * - **No platform at all** is answered 503, as the HTTP seam answers it: "no generation" is
 *   not a decline.
 */
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import type { Hmr } from "@prismshadow/penguin-hmr";
import type { PlatformApi } from "./platform.js";

/**
 * A platform that serves upgrades exposes this. Optional on purpose, like `PlatformHttp`:
 * a platform pushed before the seam existed has none, and its upgrades are declined.
 * True means the platform took the socket (it answers or refuses it itself); false leaves
 * it to the seam.
 */
export interface PlatformUpgrade {
  upgrade?(req: IncomingMessage, socket: Duplex, head: Buffer): boolean;
}

/** Offers every upgrade on `server` to the current generation of the platform. */
export function platformUpgradeSeam(server: HttpServer, hmr: Hmr<PlatformApi>): void {
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    // Which generation an upgrade goes to — waiting out an in-flight swap included — is the
    // frozen operation `current()`, the same one the HTTP seam asks.
    hmr.current().then(
      (instance) => {
        const api = instance.api as PlatformUpgrade;
        let taken = false;
        try {
          taken = api.upgrade?.(req, socket, head) === true;
        } catch {
          // Claimed by throwing, not declined: answered as the HTTP seam answers a throw.
          return refuseUpgrade(socket, 500, "Internal Server Error");
        }
        if (!taken) refuseUpgrade(socket, 404, "Not Found");
      },
      () => refuseUpgrade(socket, 503, "Service Unavailable"),
    );
  });
}

/** Answers an upgrade with a plain HTTP status and closes it. */
export function refuseUpgrade(socket: Duplex, status: number, text: string): void {
  if (socket.destroyed) return;
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}
