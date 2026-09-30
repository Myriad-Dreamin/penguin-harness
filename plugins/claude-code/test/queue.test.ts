/**
 * The queue on its own, against fakes of the harness: who may queue and for whom, where a run's
 * Workspace may be, the server-wide slots and the line across organizations, a slot let go on
 * exit, on release and after the idle limit, what is written to disk, and the routes' shapes.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import type { OrgActor, OrgView } from "@prismshadow/penguin-server/plugin";
import {
  ClaudeCodeQueue,
  DEFAULT_CAPACITY,
  DEFAULT_IDLE_MINUTES,
  QUEUE_PREFIX,
  QueueError,
  parseRunsFile,
  queueConfigOf,
  queueRoutes,
  runsPath,
  pageHtml,
  PAGE_STRINGS,
  type QueueConfig,
  type RowLike,
} from "../src/index.js";

let root: string;
let clock: number;
let config: QueueConfig;
let companyMode: boolean;
let orgs: Map<string, OrgView>;
/** Session rows by id, and what each one's program is doing. */
let rows: Map<string, RowLike & { title?: string }>;
let programs: Map<string, { alive: boolean; activity: "running" | "idle"; screen: string[] }>;
let opened: Array<{ sessionId: string; owner: string; prompt?: string }>;
let closed: string[];
let failOpen: string | null;

function org(orgId: string, extra: Partial<OrgView> = {}): OrgView {
  return {
    projectId: "p",
    orgId,
    name: orgId,
    status: "active",
    language: "en",
    workspace: path.join(root, "shared", orgId),
    employees: [
      { agentId: "dev", name: "Dev", title: "Developer", reportsTo: null },
      { agentId: "qa", name: "QA", title: "Tester", reportsTo: null },
    ],
    userIds: ["admin"],
    machineId: null,
    ...extra,
  };
}

function queue(): ClaudeCodeQueue {
  let n = 0;
  return new ClaudeCodeQueue({
    gateway: {
      companyModeEnabled: () => companyMode,
      organization: async (_p, o) => orgs.get(o) ?? null,
      principalOf: async (_p, _o, actor: OrgActor) =>
        actor.agentId !== undefined ? `agent:${actor.agentId}` : `user:${actor.userId}`,
    },
    sessionService: {
      createSession: async (args) => {
        const sessionId = `cc-${++n}`;
        rows.set(sessionId, { sessionId, workspace: args.workspace ?? "", surface: args.surface });
        return { sessionId };
      },
    },
    sessions: {
      findById: (id) => rows.get(id) ?? null,
      updateTitleIfNull: (id, title) => {
        const row = rows.get(id);
        if (row !== undefined && row.title === undefined) row.title = title;
      },
    },
    surfaces: {
      open: async (row: never, owner, options) => {
        const r = row as RowLike;
        if (failOpen !== null) throw new Error(failOpen);
        opened.push({ sessionId: r.sessionId, owner, prompt: options.prompt });
        programs.set(r.sessionId, { alive: true, activity: "running", screen: ["hello", ""] });
        return { alive: true };
      },
      describe: (row: never) => {
        const program = programs.get((row as RowLike).sessionId);
        return program === undefined
          ? { alive: false }
          : { alive: program.alive, view: { terminalId: `t-${(row as RowLike).sessionId}` } };
      },
      close: (sessionId) => {
        closed.push(sessionId);
        const program = programs.get(sessionId);
        if (program !== undefined) program.alive = false;
      },
    },
    activity: (sessionId) => programs.get(sessionId)?.activity ?? "idle",
    screen: (terminalId) => programs.get(terminalId.slice(2))?.screen ?? null,
    root,
    config: () => config,
    surfaceKind: "claude-code",
    now: () => clock,
  });
}

const dev: OrgActor = { userId: "admin", agentId: "dev", sessionId: "desk-dev" };
const qa: OrgActor = { userId: "admin", agentId: "qa" };
const person: OrgActor = { userId: "admin" };

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "claude-code-queue-"));
  clock = Date.parse("2026-09-29T16:00:00Z");
  config = { capacity: 2, idleMinutes: 30 };
  companyMode = true;
  orgs = new Map([
    ["acme", org("acme")],
    ["beta", org("beta")],
  ]);
  rows = new Map([
    ["desk-dev", { sessionId: "desk-dev", workspace: path.join(root, "desks", "dev") }],
  ]);
  programs = new Map();
  opened = [];
  closed = [];
  failOpen = null;
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("queueing a run", () => {
  it("starts at once while a slot is free, as a Claude Code Session of the employee, in the calling Session's Workspace", async () => {
    const q = queue();
    const run = await q.enqueue("p", "acme", dev, { prompt: "fix the build", title: "Build" });
    expect(run).toMatchObject({ id: 1, agentId: "dev", by: "agent:dev", status: "queued" });
    await q.pump();
    const [shown] = (await q.list("p", "acme", person)).runs;
    expect(shown).toMatchObject({
      id: 1,
      status: "running",
      activity: "working",
      sessionId: "cc-1",
      workspace: path.join(root, "desks", "dev"),
    });
    expect(opened).toEqual([{ sessionId: "cc-1", owner: "admin", prompt: "fix the build" }]);
    expect(rows.get("cc-1")).toMatchObject({ surface: "claude-code", title: "Build" });
    await q.stop();
  });

  it("takes a person's run only for a named employee, and an employee's only for itself", async () => {
    const q = queue();
    await expect(q.enqueue("p", "acme", person, { prompt: "x" })).rejects.toMatchObject({
      status: 400,
      code: "agent_required",
    });
    await expect(
      q.enqueue("p", "acme", person, { prompt: "x", agent: "stranger" }),
    ).rejects.toMatchObject({ code: "not_an_employee" });
    const forQa = await q.enqueue("p", "acme", person, { prompt: "x", agent: "qa" });
    expect(forQa).toMatchObject({ agentId: "qa", by: "user:admin" });
    // An employee's `agent` field is ignored: it queues for itself.
    const own = await q.enqueue("p", "acme", dev, { prompt: "x", agent: "qa" });
    expect(own.agentId).toBe("dev");
    await q.stop();
  });

  it("keeps a run's Workspace inside the organization's, or the calling Session's own", async () => {
    const q = queue();
    const inside = path.join(root, "shared", "acme", "repo");
    expect((await q.enqueue("p", "acme", dev, { prompt: "x", workspace: inside })).workspace).toBe(
      inside,
    );
    await expect(
      q.enqueue("p", "acme", dev, { prompt: "x", workspace: "/etc" }),
    ).rejects.toMatchObject({ code: "workspace_outside" });
    await expect(
      q.enqueue("p", "acme", dev, { prompt: "x", workspace: "shared/acme" }),
    ).rejects.toMatchObject({ code: "workspace_outside" });
    // No calling Session: the organization's shared workspace.
    expect((await q.enqueue("p", "acme", qa, { prompt: "x" })).workspace).toBe(
      path.join(root, "shared", "acme"),
    );
    await q.stop();
  });

  it("refuses without a prompt, with company mode off, for a missing organization, and for one on another machine", async () => {
    const q = queue();
    await expect(q.enqueue("p", "acme", dev, { prompt: "  " })).rejects.toMatchObject({
      code: "prompt_required",
    });
    await expect(q.enqueue("p", "nope", dev, { prompt: "x" })).rejects.toMatchObject({
      status: 404,
      code: "org_not_found",
    });
    orgs.set("far", org("far", { machineId: "box" }));
    await expect(q.enqueue("p", "far", dev, { prompt: "x" })).rejects.toMatchObject({
      status: 409,
      code: "remote_org",
    });
    companyMode = false;
    await expect(q.list("p", "acme", person)).rejects.toMatchObject({ status: 404 });
    await q.stop();
  });
});

describe("the slots", () => {
  it("are shared by every organization, and the line is oldest first across them", async () => {
    const q = queue();
    await q.enqueue("p", "acme", dev, { prompt: "a1" });
    clock += 1000;
    await q.enqueue("p", "beta", dev, { prompt: "b1" });
    clock += 1000;
    await q.enqueue("p", "acme", qa, { prompt: "a2" });
    clock += 1000;
    await q.enqueue("p", "beta", qa, { prompt: "b2" });
    await q.pump();
    expect(opened.map((o) => o.prompt)).toEqual(["a1", "b1"]);
    const acme = await q.list("p", "acme", person);
    expect(acme).toMatchObject({ capacity: 2, running: 2, queued: 2 });
    expect(acme.runs.find((r) => r.prompt === "a2")?.position).toBe(1);
    expect((await q.list("p", "beta", person)).runs.find((r) => r.prompt === "b2")?.position).toBe(
      2,
    );

    // The first program exits: its slot goes to the next in line.
    programs.get("cc-1")!.alive = false;
    await q.pump();
    expect(opened.map((o) => o.prompt)).toEqual(["a1", "b1", "a2"]);
    const [a2, a1] = (await q.list("p", "acme", person)).runs;
    expect(a1).toMatchObject({ status: "ended", end: "exited" });
    expect(a2).toMatchObject({ status: "running" });
    await q.stop();
  });

  it("close a program idle for idleMinutes and hand the slot on; work in between resets the count", async () => {
    config = { capacity: 1, idleMinutes: 30 };
    const q = queue();
    await q.enqueue("p", "acme", dev, { prompt: "first" });
    await q.enqueue("p", "acme", qa, { prompt: "second" });
    await q.pump();
    programs.get("cc-1")!.activity = "idle";
    await q.pump();
    expect((await q.show("p", "acme", 1, person, 0)).activity).toBe("idle");
    clock += 20 * 60_000;
    programs.get("cc-1")!.activity = "running";
    await q.pump(); // Working again: the idle count starts over.
    programs.get("cc-1")!.activity = "idle";
    await q.pump();
    clock += 29 * 60_000;
    await q.pump();
    expect(closed).toEqual([]);
    clock += 60_000;
    await q.pump();
    expect(closed).toEqual(["cc-1"]);
    expect(await q.show("p", "acme", 1, person, 0)).toMatchObject({ status: "ended", end: "idle" });
    expect(opened.map((o) => o.prompt)).toEqual(["first", "second"]);
    await q.stop();
  });

  it("never close an idle program when idleMinutes is 0", async () => {
    config = { capacity: 1, idleMinutes: 0 };
    const q = queue();
    await q.enqueue("p", "acme", dev, { prompt: "first" });
    await q.pump();
    programs.get("cc-1")!.activity = "idle";
    await q.pump();
    clock += 24 * 60 * 60_000;
    await q.pump();
    expect(closed).toEqual([]);
    await q.stop();
  });

  it("wait while the organization is paused or company mode is off", async () => {
    const q = queue();
    orgs.set("acme", org("acme", { status: "paused" }));
    await q.enqueue("p", "acme", dev, { prompt: "x" });
    await q.pump();
    expect(opened).toEqual([]);
    orgs.set("acme", org("acme"));
    companyMode = false;
    await q.pump();
    expect(opened).toEqual([]);
    companyMode = true;
    await q.pump();
    expect(opened).toHaveLength(1);
    await q.stop();
  });
});

describe("releasing a run", () => {
  it("cancels a queued run and closes a running one; the employee, whoever queued it, or a person may", async () => {
    config = { capacity: 1, idleMinutes: 30 };
    const q = queue();
    await q.enqueue("p", "acme", dev, { prompt: "first" });
    await q.enqueue("p", "acme", person, { prompt: "second", agent: "dev" });
    await q.enqueue("p", "acme", qa, { prompt: "third" });
    await q.pump();
    await expect(q.release("p", "acme", 1, qa)).rejects.toMatchObject({
      status: 403,
      code: "not_yours",
    });
    expect(await q.release("p", "acme", 3, qa)).toMatchObject({
      status: "ended",
      end: "cancelled",
      endedBy: "agent:qa",
    });
    expect(await q.release("p", "acme", 1, dev)).toMatchObject({ end: "released" });
    expect(closed).toEqual(["cc-1"]);
    await q.pump();
    expect(opened.map((o) => o.prompt)).toEqual(["first", "second"]);
    // A person releases anyone's; releasing again changes nothing.
    expect(await q.release("p", "acme", 2, person)).toMatchObject({ end: "released" });
    expect(await q.release("p", "acme", 2, person)).toMatchObject({ end: "released" });
    await expect(q.release("p", "acme", 9, person)).rejects.toMatchObject({ status: 404 });
    await q.stop();
  });
});

describe("what is kept", () => {
  it("writes each organization's runs to its own file, and a new queue reads them back and pumps them", async () => {
    config = { capacity: 0, idleMinutes: 30 }; // No slot: the run is still in line when the next queue reads it.
    const q = queue();
    await q.enqueue("p", "acme", dev, { prompt: "x" });
    await q.stop();
    expect(opened).toEqual([]);
    config = { capacity: 1, idleMinutes: 30 };
    const file = runsPath(root, "p", "acme");
    expect(parseRunsFile(await fs.readFile(file, "utf8")).runs).toHaveLength(1);

    const again = queue();
    await again.start(60_000);
    await again.pump();
    expect(opened).toHaveLength(1);
    await again.stop();
  });

  it("ends a run as lost when its Session is gone, and failed when it cannot be opened", async () => {
    const q = queue();
    await q.enqueue("p", "acme", dev, { prompt: "x" });
    await q.pump();
    rows.delete("cc-1");
    await q.pump();
    expect(await q.show("p", "acme", 1, person, 0)).toMatchObject({ end: "lost" });
    failOpen = "Claude Code is not installed";
    await q.enqueue("p", "acme", dev, { prompt: "y" });
    await q.pump();
    expect(await q.show("p", "acme", 2, person, 0)).toMatchObject({
      status: "ended",
      end: "failed",
      error: "Claude Code is not installed",
    });
    await q.stop();
  });

  it("reads an unreadable file as empty, and numbers past the highest run", () => {
    expect(parseRunsFile("not json")).toEqual({ next: 1, runs: [] });
    expect(
      parseRunsFile(JSON.stringify({ next: 1, runs: [{ id: 7, agentId: "a" }, { bogus: 1 }] })),
    ).toMatchObject({ next: 8, runs: [{ id: 7 }] });
  });

  it("hands back the last written screen lines of a running program", async () => {
    const q = queue();
    await q.enqueue("p", "acme", dev, { prompt: "x" });
    await q.pump();
    programs.get("cc-1")!.screen = ["one", "", "two  ", "three", "", ""];
    expect((await q.show("p", "acme", 1, person, 2)).screen).toEqual(["two", "three"]);
    expect((await q.show("p", "acme", 1, person, 0)).screen).toBeUndefined();
    await q.stop();
  });
});

describe("the settings", () => {
  it("read out-of-bounds values as the defaults", () => {
    expect(queueConfigOf({})).toEqual({
      capacity: DEFAULT_CAPACITY,
      idleMinutes: DEFAULT_IDLE_MINUTES,
    });
    expect(queueConfigOf({ capacity: 0, idleMinutes: -1 })).toEqual({
      capacity: DEFAULT_CAPACITY,
      idleMinutes: DEFAULT_IDLE_MINUTES,
    });
    expect(queueConfigOf({ capacity: 8, idleMinutes: 0 })).toEqual({ capacity: 8, idleMinutes: 0 });
  });
});

describe("the routes", () => {
  /** The routes behind a stand-in gate: `x-via: token` is the local API token, anything else a cookie. */
  function app(q: ClaudeCodeQueue) {
    const outer = new Hono();
    outer.use("*", async (c, next) => {
      c.set("user" as never, { userId: "admin" } as never);
      c.set("sessionVia" as never, (c.req.header("x-via") ?? "password") as never);
      await next();
    });
    outer.route(QUEUE_PREFIX, queueRoutes(q));
    return outer;
  }
  const base = "/api/projects/p/organizations/acme/claude-code";
  const post = (body: unknown, via = "token") => ({
    method: "POST",
    headers: { "content-type": "application/json", "x-via": via },
    body: JSON.stringify(body),
  });

  it("queue as the employee behind the token, and drop the claim behind a cookie", async () => {
    const q = queue();
    const a = app(q);
    const res = await a.request(`${base}/runs`, post({ prompt: "x", agentId: "dev" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ agentId: "dev", by: "agent:dev" });
    // Behind a cookie the agentId claim is dropped: the caller is the person, who must name an employee.
    const cookie = await a.request(
      `${base}/runs`,
      post({ prompt: "x", agentId: "dev" }, "password"),
    );
    expect(cookie.status).toBe(400);
    expect(await cookie.json()).toMatchObject({ error: { code: "agent_required" } });
    const list = await a.request(`${base}/runs`);
    expect(await list.json()).toMatchObject({ capacity: 2, runs: [{ id: 1 }] });
    expect((await a.request(`${base}/runs/abc`)).status).toBe(400);
    expect((await a.request(`${base}/runs/9`)).status).toBe(404);
    const released = await a.request(`${base}/runs/1/release`, post({ agentId: "dev" }));
    expect(await released.json()).toMatchObject({ status: "ended" });
    await q.stop();
  });

  it("serve a page whose script compiles and asks the organization's runs", () => {
    const html = pageHtml();
    expect(html).toContain('<main id="main"><h1>Claude Code</h1>');
    const script = /<script>([\s\S]*)<\/script>/.exec(html)![1]!;
    // The script is written inside a template literal: an escape gone wrong is a syntax error here.
    expect(() => new Function(script)).not.toThrow();
    // The placeholders in the words are filled (a regular expression here once lost its
    // backslashes to the template literal, and the page said "{running} of {capacity}").
    const fillLine = /^const fill = .*$/m.exec(script)![0];
    const fill = new Function(`${fillLine} return fill;`)() as (
      text: string,
      values: Record<string, unknown>,
    ) => string;
    expect(fill(PAGE_STRINGS.en.slots, { running: 1, capacity: 4, queued: 2 })).toBe(
      "1 of 4 slots in use on this server · 2 waiting",
    );
    expect(fill(PAGE_STRINGS.zh.position, { n: 3 })).toBe("第 3 位");
    expect(script).toContain('"/organizations/" + m[2] + "/claude-code"');
    expect(script).toContain('base + "/runs"');
    // Open names the machine the organization runs on: the app never fetched these runs, so
    // without it the chat page asks its own server for the Session and falls back to home.
    const pathLine = /^const sessionPath = .*$/m.exec(script)![0];
    const sessionPath = (machine: string | null) =>
      new Function("machine", `${pathLine} return sessionPath;`)(machine) as (id: string) => string;
    expect(sessionPath("dev box")("s 1")).toBe("/chat/s%201?machine=dev%20box");
    expect(sessionPath(null)("s1")).toBe("/chat/s1");
    expect(script).toContain("go(sessionPath(");
    expect(script).toContain("esc(sessionPath(r.sessionId))");
  });
});

describe("QueueError", () => {
  it("carries the status and code the routes answer with", () => {
    const err = new QueueError(409, "remote_org", "far");
    expect([err.status, err.code, err.message]).toEqual([409, "remote_org", "far"]);
  });
});
