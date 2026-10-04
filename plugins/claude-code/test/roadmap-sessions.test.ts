/**
 * The organization's roadmap → Claude Code session mapping (`claude-sessions.json`): read
 * strictly — anything off-shape is no mapping — and listed for the roadmap page, which offers
 * "Open session" only for a roadmap the mapping names.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import {
  QUEUE_PREFIX,
  QueueError,
  parseRoadmapSessions,
  queueRoutes,
  readRoadmapSessions,
  roadmapSessionsPath,
} from "../src/index.js";

// Made-up ids: the mapping only points, nothing here reads a real session.
const A = "11111111-2222-4333-8444-555555555555";
const B = "66666666-7777-4888-9999-000000000000";

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "claude-code-roadmaps-"));
  await fs.mkdir(path.join(root, "p", "organizations", "acme"), { recursive: true });
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("the mapping", () => {
  it("reads roadmap number → session and employee", () => {
    const m = parseRoadmapSessions(
      JSON.stringify({
        roadmaps: {
          "3": { sessionId: A, agentId: "acme_dev" },
          "12": { sessionId: B, agentId: "web" },
        },
      }),
    );
    expect([...m]).toEqual([
      [3, { sessionId: A, agentId: "acme_dev" }],
      [12, { sessionId: B, agentId: "web" }],
    ]);
  });

  it("leaves out every entry that is off-shape, and keeps the rest", () => {
    const m = parseRoadmapSessions(
      JSON.stringify({
        roadmaps: {
          "1": { sessionId: A, agentId: "dev" },
          "0": { sessionId: A, agentId: "dev" },
          x: { sessionId: A, agentId: "dev" },
          "2": { sessionId: "a/b", agentId: "dev" },
          "4": { sessionId: A, agentId: "../dev" },
          "5": { sessionId: A },
          "6": { sessionId: A, agentId: "dev", note: "more" },
          "7": [A, "dev"],
        },
      }),
    );
    expect([...m.keys()]).toEqual([1]);
  });

  it("reads a file that is not the shape as no mapping at all", () => {
    for (const text of ["", "{", "null", "[]", '{"roadmaps":[]}', '{"roadmaps":{},"v":1}'])
      expect(parseRoadmapSessions(text).size, text).toBe(0);
  });

  it("is empty when the organization has no file", async () => {
    expect((await readRoadmapSessions(root, "p", "acme")).size).toBe(0);
    await fs.writeFile(
      roadmapSessionsPath(root, "p", "acme"),
      JSON.stringify({ roadmaps: { "3": { sessionId: A, agentId: "dev" } } }),
    );
    expect((await readRoadmapSessions(root, "p", "acme")).get(3)).toEqual({
      sessionId: A,
      agentId: "dev",
    });
    expect(roadmapSessionsPath(root, "p", "acme")).toBe(
      path.join(root, "p", "organizations", "acme", "claude-sessions.json"),
    );
  });
});

describe("the list route", () => {
  /** Only the organization check is asked of the queue on this route. */
  const queue = {
    organization: async (_p: string, o: string, actor: { userId: string }) => {
      if (o !== "acme") throw new QueueError(404, "org_not_found", `No organization ${o}.`);
      if (actor.userId !== "admin") throw new QueueError(403, "forbidden", "Not yours.");
      return { org: { machineId: null }, principal: `user:${actor.userId}` };
    },
  };
  function app(userId = "admin") {
    const outer = new Hono();
    outer.use("*", async (c, next) => {
      c.set("user" as never, { userId } as never);
      await next();
    });
    outer.route(QUEUE_PREFIX, queueRoutes(queue as never, root));
    return outer;
  }
  const url = "/api/projects/p/organizations/acme/claude-code/sessions";

  it("lists the roadmaps the mapping names, in order, with the employee and no session id", async () => {
    expect(await (await app().request(url)).json()).toEqual({ roadmaps: [] });
    await fs.writeFile(
      roadmapSessionsPath(root, "p", "acme"),
      JSON.stringify({
        roadmaps: { "9": { sessionId: B, agentId: "web" }, "3": { sessionId: A, agentId: "dev" } },
      }),
    );
    expect(await (await app().request(url)).json()).toEqual({
      roadmaps: [
        { roadmap: 3, agentId: "dev" },
        { roadmap: 9, agentId: "web" },
      ],
    });
  });

  it("is for the organization's people", async () => {
    expect((await app("stranger").request(url)).status).toBe(403);
    expect(
      (await app().request("/api/projects/p/organizations/nope/claude-code/sessions")).status,
    ).toBe(404);
  });
});
