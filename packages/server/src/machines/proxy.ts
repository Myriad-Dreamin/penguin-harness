/**
 * The same-origin server proxy: `/server/<machineId>/api/…` on THIS server forwards to that
 * machine's server over the forward held to it (machines/forwards.ts) — one ordinary HTTP
 * request to a loopback address, so SSE, long downloads and cancellation are what they are
 * for any local server, and nothing here knows what ssh is.
 *
 * Addressed by the machine's OWN id, not the ssh alias it was reached through: an alias is a
 * line in one config file, and renaming it would change every URL below. Only `/api/` paths
 * are forwarded — the frontend stays local and re-points its API calls by prefix.
 *
 * ONE IDENTITY. The caller is this server's admin, and this server's admin is that
 * machine's admin: the ssh access that installed the program there is what authorizes it,
 * and the session presented to the machine is one this server mints over that access
 * (remote-token.ts). The browser's own cookies never travel, and the machine's never come
 * back — so this mounts INSIDE this server's auth middleware, for admins.
 */
import http from "node:http";
import { Readable } from "node:stream";
import { ADOPTED_AT_HEADER } from "../runtime/session-sources.js";

/** Path prefix of the proxy: `/server/<id>/api/…`. */
export const SERVER_PROXY_PREFIX = "/server/";

/** Where a request to one machine goes, as the machines service answers it. */
export interface ProxyTarget {
  /** The forward's address on this side (a loopback listener; machines/forwards.ts). */
  host: string;
  /** The forward's port on this side. */
  port: number;
  /** Its server's port OVER THERE — what the Host header must name (the App refuses `127.0.0.1`). */
  remotePort: number;
  /** A session on that machine, as its own cookie. */
  cookie: string;
  /**
   * When this server adopted the machine, sent along as {@link ADOPTED_AT_HEADER} so the machine
   * reads the Sessions it held before then as CLI tasks; null for a machine adopted before the
   * time was recorded, which sends nothing.
   */
  adoptedAt: string | null;
}

/** A parsed proxy path: which machine, and the remote-side path to request. */
interface ProxyPath {
  machineId: string;
  /** The path forwarded to the remote, always starting `/api/`. */
  remotePath: string;
}

/** Parses `/server/<machineId>/api/…` (query preserved by the caller); null for anything else. */
export function parseProxyPath(pathname: string): ProxyPath | null {
  if (!pathname.startsWith(SERVER_PROXY_PREFIX)) return null;
  const rest = pathname.slice(SERVER_PROXY_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const machineId = decodeURIComponent(rest.slice(0, slash));
  const remotePath = rest.slice(slash);
  if (!remotePath.startsWith("/api/") && remotePath !== "/api") return null;
  return { machineId, remotePath };
}

/** An absolute-path Location from the remote, re-rooted under the proxy prefix. */
export function rewriteLocation(header: string, machineId: string): string {
  return header.startsWith("/")
    ? `${SERVER_PROXY_PREFIX}${encodeURIComponent(machineId)}${header}`
    : header;
}

/**
 * Hop-by-hop and identity headers that must not cross.
 *
 * `authorization` among them: the proxy speaks to the machine as ITS admin, with a session
 * this server mints over ssh, and a caller's own bearer is a credential for THIS server. Sent
 * on, it would both hand that credential to another machine and outrank the cookie just
 * minted, since the remote's auth reads a bearer first. And the adoption time: it is this
 * server's word about the machine, set from its own record or not at all.
 */
const DROP_REQUEST_HEADERS = new Set([
  "host",
  "cookie",
  "authorization",
  "connection",
  "keep-alive",
  "upgrade",
  ADOPTED_AT_HEADER,
]);
const DROP_RESPONSE_HEADERS = new Set(["set-cookie", "location", "connection", "keep-alive"]);

/** What a forward the caller gave up on answers; nobody reads it, but a Response is owed. */
const cancelledResponse = (): Response =>
  Response.json(
    { error: { code: "cancelled", message: "The caller cancelled the request." } },
    { status: 499 },
  );

/**
 * Forwards one request to the machine's server and streams the answer back — both
 * directions are pipes, so SSE and long downloads flow as they arrive, and an aborted request
 * drops the upstream. node:http rather than fetch: the Host header must be the canonical app
 * host (`localhost:<port>`), which fetch will not set.
 */
function proxyThroughForward(
  request: Request,
  path: ProxyPath,
  target: ProxyTarget,
  report?: ProxyReport,
): Promise<Response> {
  const { host, port, remotePort, cookie } = target;
  // Given up on before it left: nothing to dial for.
  if (request.signal.aborted) return Promise.resolve(cancelledResponse());
  return new Promise((resolve) => {
    const url = new URL(request.url);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, name) => {
      if (!DROP_REQUEST_HEADERS.has(name.toLowerCase())) headers[name] = value;
    });
    headers["host"] = `localhost:${remotePort}`;
    headers["cookie"] = cookie;
    if (target.adoptedAt !== null) headers[ADOPTED_AT_HEADER] = target.adoptedAt;

    const upstream = http.request(
      {
        // No pooling: a forward carries one channel per connection (machines/forwards.ts),
        // and a pooled socket outliving its forward would answer from a closed listener.
        agent: false,
        host,
        port,
        path: `${path.remotePath}${url.search}`,
        method: request.method,
        headers,
      },
      (res) => {
        report?.(path.machineId, { ok: true });
        const out = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (value === undefined || DROP_RESPONSE_HEADERS.has(name.toLowerCase())) continue;
          out.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        if (res.headers.location !== undefined) {
          out.set("location", rewriteLocation(res.headers.location, path.machineId));
        }
        resolve(
          new Response(
            res.statusCode === 204 || res.statusCode === 304
              ? null
              : (Readable.toWeb(res) as ReadableStream),
            { status: res.statusCode ?? 502, headers: out },
          ),
        );
      },
    );
    // The caller gave up (an API socket call cancelled at its answer timeout aborts its
    // Request, socket/serve.ts): drop the forward rather than hold it open until the machine
    // answers someone who is gone. That is the caller's doing, not the machine's, so it is
    // not reported as an unreachable machine.
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      upstream.destroy();
    };
    request.signal.addEventListener("abort", cancel, { once: true });
    upstream.on("close", () => request.signal.removeEventListener("abort", cancel));
    upstream.on("error", (err) => {
      if (cancelled) {
        resolve(cancelledResponse());
        return;
      }
      report?.(path.machineId, { ok: false, detail: err.message });
      resolve(
        Response.json(
          {
            error: {
              code: "server_unreachable",
              message: `The connection to ${path.machineId} did not answer: ${err.message}`,
            },
          },
          { status: 502 },
        ),
      );
    });
    if (request.body !== null) {
      Readable.fromWeb(request.body as import("node:stream/web").ReadableStream).pipe(upstream);
    } else {
      upstream.end();
    }
  });
}

/**
 * Told what each forwarded request learned: the machine's API answered, or the forward had
 * nowhere to deliver. The machines service stamps it into the list's `api` fact — passive
 * measurement, riding traffic that flows anyway (api/types.ts on MachineInfo.api).
 */
export type ProxyReport = (
  machineId: string,
  outcome: { ok: true } | { ok: false; detail: string },
) => void;

/**
 * The seam handler: `/server/<id>/api/…` → that machine, or a clear answer when there is
 * nothing to forward to. `resolve` is the machines service's lookup: the forward's endpoint,
 * the port over there and a session cookie, or null when it is not connected.
 */
export function machinesProxy(
  resolve: (machineId: string) => Promise<ProxyTarget | null>,
  report?: ProxyReport,
): (request: Request) => Promise<Response | null> {
  return async (request) => {
    const url = new URL(request.url);
    const path = parseProxyPath(url.pathname);
    if (path === null) return null;
    const target = await resolve(path.machineId);
    if (target === null) {
      return Response.json(
        {
          error: {
            code: "not_connected",
            message: `No live forward to ${path.machineId}; connect to it first.`,
          },
        },
        { status: 503 },
      );
    }
    return proxyThroughForward(request, path, target, report);
  };
}
