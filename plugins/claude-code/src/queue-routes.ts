/**
 * The queue's HTTP routes, under an organization:
 *
 *   GET  /api/projects/:projectId/organizations/:orgId/claude-code/runs            every run (`?active=1`: queued and running only), and the slots
 *   POST /api/projects/:projectId/organizations/:orgId/claude-code/runs            queue one
 *   GET  /api/projects/:projectId/organizations/:orgId/claude-code/runs/:id        one (`?screen=N`: its last screen lines)
 *   POST /api/projects/:projectId/organizations/:orgId/claude-code/runs/:id/release  let go of it
 *   GET  /api/projects/:projectId/organizations/:orgId/claude-code/sessions        the roadmaps that have a session, and which
 *
 * Behind the cookie gate like every organization route. The calling Session and Agent ride in
 * the body (`sessionId`, `agentId`), or in the query on a read, and count only behind the local
 * API token — the CLI's control environment inside a Session — so a browser cannot claim to be
 * an employee.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { OrgActor } from "@prismshadow/penguin-server/plugin";
import { QueueError } from "./runs.js";
import type { ClaudeCodeQueue } from "./queue.js";
import { readRoadmapSessions } from "./roadmap-sessions.js";

/** The route group's contribution id, as the manifest names it. */
export const QUEUE_ROUTES_ID = "claude-code.queue-routes";

/** The prefix the group is mounted at (the manifest repeats it; a test holds the two together). */
export const QUEUE_PREFIX = "/api/projects/:projectId/organizations/:orgId/claude-code";

/** Who calls: the signed-in person, plus the Session and Agent claims honoured behind the local API token only. */
export function actorOf(c: Context, claims: Record<string, unknown>): OrgActor {
  const user = c.get("user" as never) as { userId: string };
  const token = (c.get("sessionVia" as never) as string | undefined) === "token";
  const sessionId = claims.sessionId;
  const agentId = claims.agentId;
  return {
    userId: user.userId,
    ...(token && typeof sessionId === "string" && sessionId !== "" ? { sessionId } : {}),
    ...(token && typeof agentId === "string" && agentId !== "" ? { agentId } : {}),
  };
}

function orgOf(c: Context): [string, string] {
  return [c.req.param("projectId") ?? "", c.req.param("orgId") ?? ""];
}

async function jsonBody(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = (await c.req.json()) as unknown;
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function idParam(c: Context): number {
  const raw = c.req.param("id") ?? "";
  if (!/^[0-9]+$/.test(raw)) throw new QueueError(400, "bad_id", `Not a run id: ${raw}.`);
  return Number(raw);
}

/** `root` is the data root, where the organization's `claude-sessions.json` is read. */
export function queueRoutes(queue: ClaudeCodeQueue, root: string): Hono {
  const app = new Hono();
  app.onError((err, c) =>
    err instanceof QueueError
      ? c.json({ error: { code: err.code, message: err.message } }, err.status as 400)
      : c.json({ error: { code: "internal", message: String(err.message ?? err) } }, 500),
  );
  app.get("/runs", async (c) => {
    const [p, o] = orgOf(c);
    const active = c.req.query("active") === "1";
    return c.json(await queue.list(p, o, actorOf(c, c.req.query()), { active }));
  });
  app.post("/runs", async (c) => {
    const [p, o] = orgOf(c);
    const body = await jsonBody(c);
    return c.json(await queue.enqueue(p, o, actorOf(c, body), body), 201);
  });
  app.get("/runs/:id", async (c) => {
    const [p, o] = orgOf(c);
    const raw = c.req.query("screen");
    const screen = raw !== undefined && /^[0-9]+$/.test(raw) ? Number(raw) : 0;
    return c.json(await queue.show(p, o, idParam(c), actorOf(c, c.req.query()), screen));
  });
  app.post("/runs/:id/release", async (c) => {
    const [p, o] = orgOf(c);
    const body = await jsonBody(c);
    return c.json(await queue.release(p, o, idParam(c), actorOf(c, body)));
  });
  // The roadmaps whose Claude Code session the organization's mapping names, the session, and as
  // whom: what the roadmap page needs to offer "Open session", and what lets the web app's slot
  // list name the roadmap a resume run continues. The session id is no secret from the
  // organization's people: their run list already carries it.
  app.get("/sessions", async (c) => {
    const [p, o] = orgOf(c);
    await queue.organization(p, o, actorOf(c, c.req.query()));
    const mapping = await readRoadmapSessions(root, p, o);
    const roadmaps = [...mapping]
      .sort(([a], [b]) => a - b)
      .map(([roadmap, { sessionId, agentId }]) => ({ roadmap, sessionId, agentId }));
    return c.json({ roadmaps });
  });
  return app;
}
