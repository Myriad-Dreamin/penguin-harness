import { Interface, Module, Provide, Use } from "@prismshadow/penguin-core/kernel";
import type { Opaque, Slot, ClassCtx } from "@prismshadow/penguin-core/kernel";
import { Hono } from "hono";
import type { AppEnv } from "../auth/middleware.js";
import { Config, Log } from "../hmr/capabilities.js";
import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { authMiddleware, jsonOnlyWrites, sameOriginWrites } from "../auth/middleware.js";
import { HttpError, handleError } from "./errors.js";
import { attributedProjectId } from "./attribution.js";
import { bodyLimitBytes } from "../services/attachment-limits.js";
import { declined } from "../hmr/hono-seam.js";
import type { Auth, Users } from "../mechanisms/identity.js";
import type { Access } from "../mechanisms/projects.js";
import type { Errors } from "../mechanisms/observability.js";
import type { Settings } from "../mechanisms/settings.js";

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
  @Provide() http!: Http;
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
    };
  }

  /** The whole surface behind one gate: error handling, logging, body cap, JSON-only writes, the runtime-prefix decline, then every group in order. */
  private assemble(
    routes: { prefix: string; auth: "user" | "none"; order: number; app: Hono<AppEnv> }[],
    gate: MiddlewareHandler<AppEnv>,
    /** Whether this surface writes the request line: only when nothing in front of it does. */
    logRequests: boolean,
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
    let capped: { size: number; mw: MiddlewareHandler } | null = null;
    app.use("/api/*", (c, next) => {
      // The upgrade channel streams a push into the blob store and buffers nothing, and the
      // attachment budget says nothing about how large a push may be; a push-size policy, if a
      // deployment wants one, belongs on that route group itself (hmr/routes.ts).
      if (c.req.path === "/api/hmr" || c.req.path.startsWith("/api/hmr/")) return next();
      const size = bodyLimitBytes(this.settings.getAttachmentLimitsMb());
      if (capped === null || capped.size !== size) {
        capped = {
          size,
          mw: bodyLimit({
            maxSize: size,
            onError: () => {
              throw new HttpError(
                413,
                "payload_too_large",
                `Request body exceeds the ${Math.floor(size / (1024 * 1024))}MB limit.`,
              );
            },
          }),
        };
      }
      return capped.mw(c, next);
    });
    app.use("/api/*", sameOriginWrites);
    // A machine's API is reached through this server (machines/proxy.ts), with this server's
    // cookie: the same question, asked here because the hop drops the Origin.
    app.use("/server/*", sameOriginWrites);
    app.use("/api/*", jsonOnlyWrites);

    // Protected routes: the gate this surface was assembled with (the cookie one, or "this
    // user" on the socket). Mounted per group, and run once per request: prefixes nest
    // (/api/projects, /api/projects/:projectId/members), so a request can pass several mounts,
    // and the first is the one that authenticates.
    const guard: MiddlewareHandler<AppEnv> = (c, next) =>
      (c.var.user as AppEnv["Variables"]["user"] | undefined) === undefined
        ? gate(c, next)
        : next();
    for (const r of routes) {
      // The guard sits on each group that asked for it, not once on `/api/*` ahead of the
      // first such group: a contributor picks its own prefix and order, and `auth` has to
      // mean the same thing wherever the group lands — a public group ordered after a
      // protected one stays public, and a protected group outside /api (the machine proxy
      // at /server/) is still protected. The gate is also what puts the user on the context.
      if (r.auth === "user") app.use(`${r.prefix.replace(/\/$/, "")}/*`, guard);
      app.route(r.prefix, r.app);
    }
    return app;
  }
}
