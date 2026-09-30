/**
 * The telemetry read surface (PRFC-0008 "看哪" / "权限"), admin only:
 *
 *   GET    /api/telemetry?view=probes|sessions|samples|machine[&probe=][&session=][&limit=]
 *   DELETE /api/telemetry    — empties the buffer
 *
 * Admin only for the reason unattributed errors are: the samples carry other users' Session
 * ids and routes, so a member's view would leak across tenants. The switch itself is a system
 * setting (`PUT /api/admin/settings { telemetry }`), not a route of its own.
 *
 * One route is not a read and not admin-only — the sample intake the page's collector posts to:
 *
 *   POST   /api/telemetry/samples   — `{ samples }`, `web.*` probes only (telemetry/browser.ts)
 *
 * Every signed-in page sends its own timings, so any user may write; what is written is a
 * shape, never content, and only an admin reads it back. While the switch is off it refuses
 * with 409 `telemetry_off` rather than accepting into nothing, so a page still running an
 * enabled collector learns to stop. It is its own route, apart from the errors intake: that
 * one keeps taking reports while telemetry is off.
 */
import { Hono } from "hono";
import { Bind, Component, Use } from "@prismshadow/penguin-core/kernel";
import type {
  TelemetryBrowserSamplesResponse,
  TelemetryQuery,
  TelemetryResponse,
} from "../api/types.js";
import type { AppEnv } from "../auth/middleware.js";
import { HttpError } from "../http/errors.js";
import { badRequest, readJson } from "../http/validate.js";
import type { Telemetry } from "../mechanisms/telemetry.js";
import { summarizeProbes, summarizeSessions } from "./buffer.js";
import { BROWSER_BATCH_MAX, browserSample } from "./browser.js";
import { machineView } from "./machine.js";

const VIEWS = ["probes", "sessions", "samples", "machine"] as const;
type View = (typeof VIEWS)[number];

export function telemetryRoutes(telemetry: Telemetry): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Registered before the admin gate below: the intake is the one route a member reaches.
  app.post("/samples", async (c) => {
    if (!telemetry.on()) {
      throw new HttpError(409, "telemetry_off", "Telemetry is off; no samples are taken.");
    }
    const body = await readJson(c);
    const sent = body.samples;
    if (!Array.isArray(sent)) throw badRequest("samples must be an array.");
    if (sent.length > BROWSER_BATCH_MAX) {
      throw badRequest(`samples may carry at most ${BROWSER_BATCH_MAX} entries.`);
    }
    let accepted = 0;
    for (const raw of sent) {
      const sample = browserSample(raw);
      if (sample !== null && telemetry.record(sample) !== null) accepted += 1;
    }
    return c.json({ accepted } satisfies TelemetryBrowserSamplesResponse);
  });

  app.use("*", async (c, next) => {
    if (!c.var.user.isAdmin) {
      throw new HttpError(403, "admin_required", "Only an admin can read telemetry.");
    }
    await next();
  });

  app.get("/", (c) => {
    const view = (c.req.query("view") ?? "probes") as View;
    if (!VIEWS.includes(view)) {
      throw new HttpError(400, "bad_request", `view must be one of ${VIEWS.join(", ")}.`);
    }
    const query: TelemetryQuery = {};
    const probe = c.req.query("probe");
    const session = c.req.query("session");
    if (probe !== undefined && probe !== "") query.probe = probe;
    if (session !== undefined && session !== "") query.session = session;
    const limitRaw = c.req.query("limit");
    if (limitRaw !== undefined) {
      const limit = Number(limitRaw);
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new HttpError(400, "bad_request", "limit must be a positive integer.");
      }
      query.limit = limit;
    }
    const enabled = telemetry.on();
    const buffered = enabled ? telemetry.samples({}).length : 0;
    const body: TelemetryResponse = { enabled, view, buffered };
    if (view === "machine") {
      // Read now, not buffered — and not while off: the Sessions' report is asked only here.
      if (enabled)
        body.machine = machineView(telemetry.generations(), telemetry.report("sessions"));
    } else if (view === "samples") {
      body.samples = telemetry.samples(query);
    } else {
      // The summaries are over every match; `limit` narrows only the raw listing.
      const { limit: _limit, ...unlimited } = query;
      const matched = telemetry.samples(unlimited);
      if (view === "probes") body.probes = summarizeProbes(matched);
      else body.sessions = summarizeSessions(matched);
    }
    return c.json(body);
  });

  app.delete("/", (c) => {
    telemetry.clear();
    return c.json({ ok: true });
  });

  return app;
}

@Component({
  contributes: {
    "HttpModule.routes": [
      {
        id: "TelemetryRoutes.routes",
        prefix: "/api/telemetry",
        auth: "user",
        order: 46,
      },
    ],
  },
})
export class TelemetryRoutes {
  @Use() private readonly telemetry!: Telemetry;
  @Bind("TelemetryRoutes.routes") routes!: Hono<AppEnv>;
  setup() {
    this.routes = telemetryRoutes(this.telemetry);
  }
}
