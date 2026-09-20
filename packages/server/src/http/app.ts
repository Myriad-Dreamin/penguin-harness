import { Interface, Module, Provide, Use } from "@prismshadow/penguin-core/kernel";
import type { Opaque, Slot, ClassCtx } from "@prismshadow/penguin-core/kernel";
import { Hono } from "hono";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { AppEnv } from "../auth/middleware.js";
import { Config, Log } from "../hmr/capabilities.js";
import type { MiddlewareHandler } from "hono";
import { authMiddleware, jsonOnlyWrites, sameOriginWrites } from "../auth/middleware.js";
import { HttpError, handleError } from "./errors.js";
import { attributedProjectId } from "./attribution.js";
import { declined, isDeclined } from "../hmr/hono-seam.js";
import { hostOnly, requestAuthority } from "../services/preview-token.js";
import type { Auth, Users } from "../mechanisms/identity.js";
import type { Access } from "../mechanisms/projects.js";
import type { Errors } from "../mechanisms/observability.js";
import type { Settings } from "../mechanisms/settings.js";
import type { Telemetry } from "../mechanisms/telemetry.js";
import { randomUUID } from "node:crypto";
import type { SessionIndex } from "../mechanisms/sessions.js";
import {
  agentKey,
  carriedClaims,
  checkClaims,
  reachesSession,
  sessionScope,
} from "../auth/session-scope.js";
import type { ScopeLookups } from "../auth/session-scope.js";

/** The request id header (PRFC-0008): answered on every sampled request, and reused when a request arrives carrying one — the machine proxy forwards it, so both servers' samples share the id. */
export const REQUEST_ID_HEADER = "x-penguin-request-id";
const REQUEST_ID_SHAPE = /^[\w.:-]{1,64}$/;

/**
 * The assembled business surface: one request in, one response (or a decline) out.
 *
 * `fetchAs` is the same surface entered as a user already established by other means — the
 * API socket (socket/serve.ts), whose handshake the runtime authenticated and whose owner it
 * checked before the platform ever saw the socket. Those requests carry no cookie, so the
 * gate in front of the routes is not the cookie one but "this user": the routes themselves,
 * their authorization and their errors are identical.
 */
@Interface()
export abstract class Http {
  abstract fetch(request: Opaque<"Request", Request>): Promise<Opaque<"Response", Response>>;
  abstract fetchAs(
    userId: string,
    request: Opaque<"Request", Request>,
  ): Promise<Opaque<"Response", Response>>;
  /**
   * An Upgrade (a WebSocket handshake), offered by the runtime before its own handlers see
   * it — the seam an upgrade takes, since a Response cannot carry a live socket. True when a
   * host of this surface's own claimed the socket; false leaves it to the runtime.
   */
  abstract upgrade(
    req: Opaque<"IncomingMessage", IncomingMessage>,
    socket: Opaque<"Duplex", Duplex>,
    head: Opaque<"Buffer", Buffer>,
  ): Promise<boolean>;
}

/** What a host of its own binds: the app that answers its requests, and, if it carries any, its upgrades. */
export interface HostApp {
  app: Hono;
  upgrade?: (req: IncomingMessage, socket: Duplex, head: Buffer) => Promise<boolean>;
}

export interface HttpSlots {
  /**
   * A route group. `auth: "user"` mounts it behind the cookie gate, `"none"` in front of
   * it; `order` is the mount position (a stable number, since Hono matches in order). The
   * code half is the group's Hono app.
   */
  routes: Slot<
    { prefix: string; auth: "user" | "none"; order: number },
    Opaque<"Hono", Hono<AppEnv>>
  >;
  /**
   * A HOST of its own. A request whose Host matches `pattern` (a RegExp source, tested
   * against the lowercased hostname) goes to the bound app and NOWHERE else: ahead of the
   * body cap, the JSON-only rule, the cookie gate and every route group, and whatever the
   * app answers is the answer — it never falls through to the App. That is the point of the
   * slot: such a host serves content that is not the App's (the Browser's sites), and the
   * guarantee that no App route is reachable there has to hold by construction, not by each
   * route remembering to check.
   */
  hosts: Slot<{ pattern: string }, Opaque<"HostApp", HostApp>>;
}

interface BoundHost extends HostApp {
  pattern: RegExp;
}

/**
 * The platform's whole HTTP surface, assembled from `HttpModule.routes` contributions: every
 * module that serves requests contributes its groups here as data (prefix, auth, order)
 * and binds the Hono app by id. Adding an endpoint is adding a line to a manifest.
 */
@Module()
export class HttpModule {
  @Use() private readonly config!: Config;
  @Use() private readonly log!: Log;
  @Use() private readonly auth!: Auth;
  @Use() private readonly errors!: Errors;
  @Use() private readonly settings!: Settings;
  @Use() private readonly access!: Access;
  @Use() private readonly users!: Users;
  @Use() private readonly telemetry?: Telemetry;
  @Use() private readonly sessionsRepo!: SessionIndex;
  @Provide() http!: Http;
  /**
   * The Sessions a session credential created (`penguin run --agent-id <colleague>`), by id →
   * the creating Agent's key: they count as its own (auth/session-scope.ts). Held for the life
   * of this App; a push or a restart forgets them, and the creator then reaches only its own
   * Agent's sessions again.
   */
  private readonly createdBySession = new Map<string, string>();
  setup({ contributions }: ClassCtx) {
    const routes = [...(contributions.routes ?? [])]
      .map((c) => ({
        id: c.id,
        prefix: c.data.prefix as string,
        auth: c.data.auth as "user" | "none",
        order: c.data.order as number,
        app: c.code as Hono<AppEnv>,
      }))
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

    const hosts: BoundHost[] = [...(contributions.hosts ?? [])].map((c) => ({
      pattern: new RegExp(c.data.pattern as string),
      ...(c.code as HostApp),
    }));

    // The HTTP surface, gated on the cookie; and the same surface once per socket user,
    // gated on that user — assembled lazily, since most users never open a socket, and kept,
    // since the one who did opens it on every page load. Hono copies a group's routes into
    // each parent it is mounted on, so mounting the groups twice shares handlers, not state.
    //
    // Only the socket's surface writes a request line. An HTTP request reaches the cookie-gated
    // one through the runtime's seam, and the runtime's app has already logged it — once, with
    // the status the client actually got, which for a path declined here is the static tail's
    // answer. Logging it here as well printed every HTTP request twice, a declined static file
    // as a 404 followed by its 200. A socket call never passes the runtime's app, so this is
    // its only line.
    const cookieGated = this.assemble(
      routes,
      authMiddleware(this.auth, this.config.trustProxy),
      false,
      hosts,
    );
    const asUser = new Map<string, Hono<AppEnv>>();
    const enteredAs = (userId: string): Hono<AppEnv> => {
      let app = asUser.get(userId);
      if (app === undefined) {
        app = this.assemble(
          routes,
          async (c, next) => {
            const user = this.users.findById(userId);
            if (user === null) throw new HttpError(401, "unauthorized", "Unknown user.");
            // The handshake's cookie is not re-read per call, so a socket opened before the
            // user was signed out everywhere (a password reset, AdminService.signOutEverywhere)
            // would otherwise keep answering as that user. A 401 here reaches the page's
            // unauthorized handler, exactly as the same call over HTTP would.
            if (!this.auth.userHasLiveSession(userId)) {
              throw new HttpError(401, "unauthorized", "Not signed in or the sign-in has expired.");
            }
            c.set("user", user);
            // The handshake does not say how the cookie behind it was minted, so the most
            // demanding kind is assumed: what needs the old password keeps needing it.
            c.set("sessionVia", "password");
            await next();
          },
          true,
        );
        asUser.set(userId, app);
      }
      return app;
    };
    this.http = {
      fetch: (request: Request) => Promise.resolve(cookieGated.fetch(request)),
      fetchAs: (userId: string, request: Request) =>
        Promise.resolve(enteredAs(userId).fetch(request)),
      // By Host, like the requests: the one host whose pattern matches gets the socket, and
      // only if it carries upgrades at all. No host, no claim — the runtime's own then.
      upgrade: async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const hostname = hostOnly(requestAuthority(req.url ?? "/", req.headers.host)).toLowerCase();
        const host = hosts.find((h) => h.pattern.test(hostname));
        if (host?.upgrade === undefined) return false;
        return host.upgrade(req, socket, head);
      },
    };
  }

  /** The whole surface behind one gate: error handling, logging, the hosts that are not the App's, body cap, JSON-only writes, the runtime-prefix decline, then every group in order. */
  private assemble(
    routes: { prefix: string; auth: "user" | "none"; order: number; app: Hono<AppEnv> }[],
    gate: MiddlewareHandler<AppEnv>,
    /** Whether this surface writes the request line: only when nothing in front of it does. */
    logRequests: boolean,
    /** Hosts answered by an app of their own. None on the socket's surface: a call frame names a path, never a Host. */
    hosts: BoundHost[] = [],
  ): Hono<AppEnv> {
    const errors = this.errors;
    const access = this.access;
    const app = new Hono<AppEnv>();
    app.onError((err, c) => {
      const projectId = attributedProjectId(c, { access });
      errors.record({
        source: "http",
        err,
        ...(projectId !== undefined ? { ctx: { projectId } } : {}),
      });
      return handleError(err, c);
    });
    app.notFound(() => declined());
    if (logRequests) {
      app.use("*", async (c, next) => {
        const start = performance.now();
        await next();
        this.log.line(
          `${c.req.method} ${c.req.path} ${c.res.status} ${Math.round(performance.now() - start)}ms`,
        );
      });
    }
    if (hosts.length > 0) {
      app.use("*", async (c, next) => {
        const hostname = hostOnly(requestAuthority(c.req.url, c.req.header("host"))).toLowerCase();
        const host = hosts.find((h) => h.pattern.test(hostname));
        if (host === undefined) return next();
        return host.app.fetch(c.req.raw);
      });
    }
    // Telemetry's http.request (PRFC-0008), on both surfaces — the cookie one writes no request
    // line, but its requests are the App's all the same. After the hosts: a host of its own
    // serves content that is not the App's. While the switch is off this is one boolean check;
    // no id is minted and nothing is wrapped.
    const telemetry = this.telemetry;
    if (telemetry !== undefined) {
      app.use("*", async (c, next) => {
        if (!telemetry.on()) return next();
        const incoming = c.req.header(REQUEST_ID_HEADER);
        const request =
          incoming !== undefined && REQUEST_ID_SHAPE.test(incoming) ? incoming : randomUUID();
        const start = performance.now();
        await telemetry.within({ request }, () => next());
        const res = c.res;
        // Left to the static tail behind the seam: not an answer of this surface.
        if (isDeclined(res)) return;
        const durMs = performance.now() - start;
        const requestLength = Number(c.req.header("content-length"));
        const responseLength = res.headers.get("content-length");
        const params: Record<string, string | undefined> = c.req.param();
        const session = params.sessionId;
        const sample = telemetry.record({
          probe: "http.request",
          durMs,
          ...(responseLength !== null ? { bytes: Number(responseLength) } : {}),
          status: res.status >= 500 ? "error" : "ok",
          keys: { request, ...(session !== undefined ? { session } : {}) },
          attrs: {
            method: c.req.method,
            // The registered pattern, never the path: ids and query values stay out.
            route: c.req.routePath,
            code: res.status,
            ...(Number.isFinite(requestLength) ? { requestBytes: requestLength } : {}),
          },
        });
        // A body of unknown length (a JSON answer, a stream) is counted as it is written, so a
        // stream that ends later still reports what it delivered.
        if (sample !== null && responseLength === null && res.body !== null) {
          sample.bytes = 0;
          const counted = res.body.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, controller) {
                sample.bytes = (sample.bytes ?? 0) + chunk.byteLength;
                controller.enqueue(chunk);
              },
            }),
          );
          c.res = new Response(counted, res);
        }
        c.header(REQUEST_ID_HEADER, request);
      });
    }
    // No request body size cap: a size refusal here could only ever fire on a request the
    // transport was going to fail anyway (the body becomes one string for JSON.parse, and V8
    // caps a string near 512MB). http/validate.ts readJson names that ceiling when it is hit.
    app.use("/api/*", sameOriginWrites);
    // A machine's API is reached through this server (machines/proxy.ts), with this server's
    // cookie: the same question, asked here because the hop drops the Origin.
    app.use("/server/*", sameOriginWrites);
    app.use("/api/*", jsonOnlyWrites);

    // Protected routes: the gate this surface was assembled with (the cookie one, or "this
    // user" on the socket), then the session-credential scope. Mounted per group, and run once
    // per request: prefixes nest (/api/projects, /api/projects/:projectId/members), so a
    // request can pass several mounts, and the first is the one that authenticates.
    const scope = this.sessionScopeGate();
    const guard: MiddlewareHandler<AppEnv> = (c, next) =>
      (c.var.user as AppEnv["Variables"]["user"] | undefined) === undefined
        ? gate(c, async () => {
            await scope(c, next);
          })
        : next();
    for (const r of routes) {
      // The guard sits on each group that asked for it, not once on `/api/*` ahead of the
      // first such group: a contributor picks its own prefix and order, and `auth` has to
      // mean the same thing wherever the group lands — a public group ordered after a
      // protected one stays public, and a protected group outside /api (the machine proxy
      // at /server/) is still protected. The gate is also what puts the user on the context.
      // No row of the session-scope table is outside /api: a session credential stops there.
      if (r.auth === "user") app.use(`${r.prefix.replace(/\/$/, "")}/*`, guard);
      app.route(r.prefix, r.app);
    }
    return app;
  }

  /**
   * A request made with a session credential passes only the rows of the route table
   * (auth/session-scope.ts), with the identity it claims held to the credential's own; every
   * other request passes untouched. Also where the table's two answers that need the response
   * are applied: a session list keeps only the credential's own sessions, and a Session it
   * creates becomes one of them.
   */
  private sessionScopeGate(): MiddlewareHandler<AppEnv> {
    const created = this.createdBySession;
    const lookups: ScopeLookups = {
      sessionOf: (sessionId) => {
        const row = this.sessionsRepo.findById(sessionId);
        return row === null ? null : { projectId: row.projectId, agentId: row.agentId };
      },
      createdBy: (sessionId) => created.get(sessionId),
    };
    return async (c, next) => {
      const claims = c.var.sessionScope;
      if (claims === undefined) return next();
      const url = new URL(c.req.url);
      const method = c.req.method;
      const decision = sessionScope(method, c.req.path, url.searchParams, claims, lookups);
      if (decision.kind === "deny") throw new HttpError(403, "session_scope", decision.message);
      if (decision.claims !== undefined) {
        const write = method !== "GET" && method !== "HEAD";
        let body: unknown = null;
        if (write && c.req.header("content-type")?.toLowerCase().startsWith("application/json")) {
          // Hono caches the parsed body, so the handler reads the same value again.
          body = await c.req.json().catch(() => null);
        }
        const carried = carriedClaims(decision.claims, url.searchParams, body);
        const refused = checkClaims(carried, claims, lookups, write);
        if (refused !== null) throw new HttpError(403, "session_scope", refused);
      }
      await next();
      if (decision.adoptCreated === true && c.res.status === 201) {
        const answer = (await c.res.clone().json()) as { session?: { sessionId?: unknown } };
        const id = answer.session?.sessionId;
        if (typeof id === "string") created.set(id, agentKey(claims.projectId, claims.agentId));
      }
      if (decision.filterSessions === true && c.res.status === 200) {
        const answer = (await c.res.json()) as { sessions?: { sessionId: string }[] };
        const sessions = (answer.sessions ?? []).filter((s) =>
          reachesSession(claims, s.sessionId, lookups),
        );
        // The page alone: the counts beside it are over rows the credential does not reach.
        c.res = new Response(JSON.stringify({ sessions }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    };
  }
}
