/**
 * The browser's error intake: `POST /api/errors/browser`.
 *
 * What a page reports is what the server cannot see for itself — a render error, an
 * unhandled rejection, a request that never reached anyone (status 0), the API socket's
 * timeouts and silences. An ApiError is never among them: the server answered it, and
 * recorded it when it was worth recording.
 *
 * It is a write on the error table, which is always on, so it answers whether telemetry is
 * on or off. The platform's own gates apply as to every `/api` write — JSON only (415
 * otherwise), same origin, the body cap — and this route adds its own bounds on top of the
 * browser's: at most BROWSER_ERRORS_MAX_BATCH reports a request, at most
 * BROWSER_ERRORS_PER_MINUTE a user a minute (the rest are counted back as `dropped`), and the
 * recorder's dedup behind both.
 *
 * Attribution is the caller's only as far as the caller reaches: a `projectId` it cannot
 * enter is dropped along with its `sessionId`, and the row becomes unattributed — visible to
 * admins only, like every other unattributed error (see ErrorsRepo).
 */
import { Hono } from "hono";
import { Bind, Component, Use } from "@prismshadow/penguin-core/kernel";
import {
  BROWSER_ERRORS_MAX_BATCH,
  type BrowserErrorReport,
  type BrowserErrorsResponse,
} from "../../api/types.js";
import type { AppEnv } from "../../auth/middleware.js";
import type { Clock } from "../../hmr/capabilities.js";
import type { Errors } from "../../mechanisms/observability.js";
import type { Access } from "../../mechanisms/projects.js";
import { badRequest, readJson } from "../validate.js";

/** Reports one user may hand over per minute; past it they are dropped and counted. */
export const BROWSER_ERRORS_PER_MINUTE = 60;
/** Users tracked by the per-minute window before the table is cleared (bounded, like the recorder's dedup table). */
const WINDOW_USERS_MAX = 1000;
const MINUTE_MS = 60_000;

const CODE_SHAPE = /^[a-z0-9_]{1,64}$/;
const KIND_SHAPE = /^[a-z_]{1,32}$/;
/** Ids as the rest of the API spells them; anything else is not an id and is not kept. */
const ID_SHAPE = /^[A-Za-z0-9._-]{1,128}$/;

function parseReport(raw: unknown, at: number): BrowserErrorReport {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw badRequest(`reports[${at}] must be an object.`);
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.kind !== "string" || !KIND_SHAPE.test(r.kind)) {
    throw badRequest(`reports[${at}].kind must be a lower-case word.`);
  }
  if (typeof r.code !== "string" || !CODE_SHAPE.test(r.code)) {
    throw badRequest(`reports[${at}].code must match [a-z0-9_]{1,64}.`);
  }
  if (typeof r.message !== "string") throw badRequest(`reports[${at}].message must be a string.`);
  const report: BrowserErrorReport = { kind: r.kind, code: r.code, message: r.message };
  if (typeof r.stack === "string" && r.stack !== "") report.stack = r.stack;
  if (typeof r.projectId === "string" && ID_SHAPE.test(r.projectId)) {
    report.projectId = r.projectId;
  }
  if (typeof r.sessionId === "string" && ID_SHAPE.test(r.sessionId)) {
    report.sessionId = r.sessionId;
  }
  return report;
}

export interface BrowserErrorRouteDeps {
  errors: Errors;
  access: Access;
  clock: Clock;
}

export function browserErrorRoutes(deps: BrowserErrorRouteDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  /** userId → the current minute's start and how many reports it took. */
  const windows = new Map<string, { start: number; taken: number }>();

  app.post("/browser", async (c) => {
    const body = await readJson(c);
    if (!Array.isArray(body.reports)) throw badRequest("reports must be an array.");
    if (body.reports.length > BROWSER_ERRORS_MAX_BATCH) {
      throw badRequest(`at most ${BROWSER_ERRORS_MAX_BATCH} reports per request.`);
    }
    const reports = body.reports.map(parseReport);
    const userId = c.var.user.userId;
    const now = deps.clock.now().getTime();
    let window = windows.get(userId);
    if (window === undefined || now - window.start >= MINUTE_MS) {
      if (window === undefined && windows.size >= WINDOW_USERS_MAX) windows.clear();
      window = { start: now, taken: 0 };
      windows.set(userId, window);
    }
    const room = Math.max(0, BROWSER_ERRORS_PER_MINUTE - window.taken);
    const taken = reports.slice(0, room);
    window.taken += taken.length;
    for (const report of taken) {
      const projectId =
        report.projectId !== undefined && deps.access.canAccess(userId, report.projectId)
          ? report.projectId
          : undefined;
      deps.errors.record({
        source: "browser",
        err: report.message,
        code: report.code,
        kind: "unexpected",
        ...(report.stack !== undefined ? { stack: report.stack } : {}),
        ...(projectId !== undefined
          ? {
              ctx: {
                projectId,
                ...(report.sessionId !== undefined ? { sessionId: report.sessionId } : {}),
              },
            }
          : {}),
      });
    }
    const answer: BrowserErrorsResponse = {
      accepted: taken.length,
      dropped: reports.length - taken.length,
    };
    return c.json(answer);
  });

  return app;
}

@Component({
  contributes: {
    "HttpModule.routes": [
      {
        id: "BrowserErrorRoutes.routes",
        prefix: "/api/errors",
        auth: "user",
        order: 47,
      },
    ],
  },
})
export class BrowserErrorRoutes {
  @Use() private readonly errors!: Errors;
  @Use() private readonly access!: Access;
  @Use() private readonly clock!: Clock;
  @Bind("BrowserErrorRoutes.routes") routes!: Hono<AppEnv>;
  setup() {
    this.routes = browserErrorRoutes({
      errors: this.errors,
      access: this.access,
      clock: this.clock,
    });
  }
}
