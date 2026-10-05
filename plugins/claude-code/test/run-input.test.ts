/**
 * Typing into a run's program (`POST …/runs/:id/input`): who may, what text is taken, and that
 * the text goes to the run's own terminal before its Enter.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import type { OrgActor, OrgView } from "@prismshadow/penguin-server/plugin";
import { ClaudeCodeQueue, QUEUE_PREFIX, queueRoutes, runsPath } from "../src/index.js";
import type { Run } from "../src/runs.js";

let root: string;
/** What each terminal was sent, in order, and which terminals are alive. */
let written: Array<[string, string]>;
let alive: Set<string>;
let logged: string[];

const org: () => OrgView = () => ({
  projectId: "p",
  orgId: "acme",
  name: "acme",
  status: "active",
  language: "en",
  workspace: path.join(root, "shared"),
  employees: [
    { agentId: "dev", name: "Dev", title: "Developer", reportsTo: null },
    { agentId: "qa", name: "QA", title: "Tester", reportsTo: null },
    { agentId: "lead", name: "Lead", title: "Lead", reportsTo: null },
  ],
  userIds: ["admin"],
  machineId: null,
});

function run(id: number, extra: Partial<Run> = {}): Run {
  return {
    id,
    agentId: "dev",
    by: "agent:lead",
    ownerUserId: "admin",
    prompt: "p",
    title: null,
    workspace: root,
    status: "running",
    queuedAt: "2026-10-05T00:00:00.000Z",
    sessionId: `cc-${id}`,
    ...extra,
  };
}

async function queue(runs: Run[]): Promise<ClaudeCodeQueue> {
  const file = runsPath(root, "p", "acme");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ next: runs.length + 1, runs }));
  return new ClaudeCodeQueue({
    gateway: {
      companyModeEnabled: () => true,
      organization: async () => org(),
      principalOf: async (_p, _o, actor: OrgActor) =>
        actor.agentId !== undefined ? `agent:${actor.agentId}` : `user:${actor.userId}`,
    },
    sessionService: { createSession: async () => ({ sessionId: "unused" }) },
    sessions: {
      findById: (id) => ({ sessionId: id, workspace: root }),
      updateTitleIfNull: () => {},
    },
    surfaces: {
      open: async () => null,
      describe: (row: never) => {
        const terminalId = `t-${(row as { sessionId: string }).sessionId}`;
        return { alive: alive.has(terminalId), view: { terminalId } };
      },
      close: () => {},
    },
    activity: () => "idle",
    resume: () => {},
    screen: () => null,
    write: (terminalId, data) => {
      if (!alive.has(terminalId)) return false;
      written.push([terminalId, data]);
      return true;
    },
    enterDelayMs: 0,
    root,
    config: () => ({ capacity: 4, idleMinutes: 30 }),
    surfaceKind: "claude-code",
    log: (line) => logged.push(line),
  });
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "claude-code-input-"));
  written = [];
  alive = new Set(["t-cc-1", "t-cc-2"]);
  logged = [];
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("the input route", () => {
  /** Behind a stand-in gate: `x-via: token` is the local API token, anything else a cookie. */
  function app(q: ClaudeCodeQueue) {
    const outer = new Hono();
    outer.use("*", async (c, next) => {
      c.set("user" as never, { userId: "admin" } as never);
      c.set("sessionVia" as never, (c.req.header("x-via") ?? "password") as never);
      await next();
    });
    outer.route(QUEUE_PREFIX, queueRoutes(q, root));
    return outer;
  }
  const input = (id: number, body: unknown, via = "token") =>
    [
      `/api/projects/p/organizations/acme/claude-code/runs/${id}/input`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-via": via },
        body: JSON.stringify(body),
      },
    ] as const;

  it("types the text into the run's terminal, then Enter", async () => {
    const a = app(await queue([run(1)]));
    const res = await a.request(...input(1, { text: "wake up" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 1, status: "running" });
    expect(written).toEqual([
      ["t-cc-1", "wake up"],
      ["t-cc-1", "\r"],
    ]);
    expect(logged.some((l) => l.includes("acme#1") && l.includes("user:admin"))).toBe(true);
    // `enter: false` types the text alone.
    written = [];
    await a.request(...input(1, { text: "half", enter: false }));
    expect(written).toEqual([["t-cc-1", "half"]]);
  });

  it("lets the run's employee, whoever queued it, and a person type; refuses another employee", async () => {
    const a = app(await queue([run(1)]));
    for (const agentId of ["dev", "lead"]) {
      expect((await a.request(...input(1, { text: "x", agentId }))).status).toBe(200);
    }
    // Behind a cookie the claim is dropped: the caller is the person.
    expect((await a.request(...input(1, { text: "x", agentId: "qa" }, "password"))).status).toBe(
      200,
    );
    const refused = await a.request(...input(1, { text: "x", agentId: "qa" }));
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ error: { code: "not_yours" } });
    expect(written.filter(([, d]) => d === "x")).toHaveLength(3);
  });

  it("answers 409 for a run that is not running or whose program is gone, 404 for no run", async () => {
    const a = app(
      await queue([
        run(1, { status: "queued", sessionId: undefined }),
        run(2, { status: "ended", end: "released" }),
        run(3),
      ]),
    );
    for (const id of [1, 2, 3]) {
      const res = await a.request(...input(id, { text: "x" }));
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: { code: "not_running" } });
    }
    expect((await a.request(...input(9, { text: "x" }))).status).toBe(404);
    expect(written).toEqual([]);
  });

  it("refuses empty, over-long and control-character text, and a non-boolean enter", async () => {
    const a = app(await queue([run(1)]));
    const bad = [
      [{}, "text_required"],
      [{ text: "   " }, "text_required"],
      [{ text: "x".repeat(20_001) }, "text_too_long"],
      [{ text: "a\nb" }, "control_characters"],
      [{ text: "stop\x03" }, "control_characters"],
      [{ text: "\x1b[A" }, "control_characters"],
      [{ text: "del\x7f" }, "control_characters"],
      [{ text: "csi\x9b" }, "control_characters"],
      [{ text: "x", enter: "yes" }, "bad_enter"],
    ] as const;
    for (const [body, code] of bad) {
      const res = await a.request(...input(1, body));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code } });
    }
    expect(written).toEqual([]);
  });
});
