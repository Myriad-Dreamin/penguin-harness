/**
 * The open link's JSON form (open-answer.ts), what the web app's dialog asks: the three states
 * — running with its Session, queued with its place in line, held elsewhere with the process and
 * terminal — for the link by id and by roadmap, a refusal as JSON, and the redirect untouched
 * when the header is absent.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import type { OrgActor, OrgView } from "@prismshadow/penguin-server/plugin";
import {
  ClaudeCodeQueue,
  PAGE_PREFIX,
  openRoutes,
  pageRoutes,
  type ProcProbe,
  type QueueConfig,
  type RowLike,
} from "../src/index.js";

const ID = "6f1d2c3b-4a5e-4f60-8b7a-9c8d7e6f5a41";
const JSON_ACCEPT = { headers: { Accept: "application/json" } };

let base: string;
let root: string;
let workspace: string;
let env: NodeJS.ProcessEnv;
let config: QueueConfig;
let orgs: Map<string, OrgView>;
let procs: Map<number, { start: string; tty: string | null; pane: string | null }>;

const probe: ProcProbe = {
  alive: (pid) => procs.has(pid),
  startTime: (pid) => procs.get(pid)?.start ?? null,
  tty: (pid) => procs.get(pid)?.tty ?? null,
  tmux: (pid) => {
    const pane = procs.get(pid)?.pane ?? null;
    return pane === null ? null : { socket: "/tmp/tmux-1/default", pane };
  },
};

function org(orgId: string, extra: Partial<OrgView> = {}): OrgView {
  return {
    projectId: "p",
    orgId,
    name: orgId,
    status: "active",
    language: "en",
    workspace: path.join(base, "shared", orgId),
    employees: [{ agentId: "dev", name: "Dev", title: "Developer", reportsTo: null }],
    userIds: ["admin"],
    machineId: null,
    ...extra,
  };
}

// A trimmed copy of resume.test.ts's harness: that file's fakes live in its module state, and
// these cases need only the create → open path.
function queue(): ClaudeCodeQueue {
  let n = 0;
  const rows = new Map<string, RowLike>();
  const alive = new Set<string>();
  return new ClaudeCodeQueue({
    gateway: {
      companyModeEnabled: () => true,
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
    sessions: { findById: (id) => rows.get(id) ?? null, updateTitleIfNull: () => {} },
    surfaces: {
      open: async (row: never) => {
        alive.add((row as RowLike).sessionId);
        return { alive: true };
      },
      describe: (row: never) => ({ alive: alive.has((row as RowLike).sessionId) }),
      close: (sessionId) => alive.delete(sessionId),
    },
    resume: () => {},
    activity: () => "idle",
    screen: () => null,
    write: () => false,
    root,
    config: () => config,
    surfaceKind: "claude-code",
  });
}

function app(q: ClaudeCodeQueue) {
  const outer = new Hono();
  outer.use("*", async (c, next) => {
    c.set("user" as never, { userId: "admin" } as never);
    c.set("sessionVia" as never, "password" as never);
    await next();
  });
  outer.route(PAGE_PREFIX, pageRoutes(openRoutes({ queue: q, root, env, probe })));
  return outer;
}

const link = (extra = "") => `/api/claude-code/open/${ID}?org=acme&agent=dev${extra}`;
const byRoadmap = (n: number) => `/api/claude-code/open?org=acme&roadmap=${n}`;

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "claude-code-open-json-"));
  const claude = path.join(base, "claude-home");
  workspace = path.join(base, "work", "repo");
  root = path.join(base, "data");
  await fs.mkdir(workspace, { recursive: true });
  await fs.mkdir(path.join(root, "p", "organizations", "acme"), { recursive: true });
  const records = path.join(claude, "projects", "repo");
  await fs.mkdir(records, { recursive: true });
  await fs.writeFile(
    path.join(records, `${ID}.jsonl`),
    JSON.stringify({ type: "user", cwd: workspace, sessionId: ID }) + "\n",
  );
  await fs.mkdir(path.join(claude, "sessions"), { recursive: true });
  env = { CLAUDE_CONFIG_DIR: claude };
  config = { capacity: 2, idleMinutes: 30 };
  orgs = new Map([["acme", org("acme")]]);
  procs = new Map();
});

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

describe("the link's JSON form", () => {
  it("answers running with the Session to attach, and the machine the link named", async () => {
    const q = queue();
    const res = await app(q).request(link("&machine=box"), JSON_ACCEPT);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      state: "running",
      sessionId: "cc-1",
      runId: 1,
      projectId: "p",
      orgId: "acme",
      machine: "box",
    });
    // The same run on a second ask, by roadmap this time.
    await fs.writeFile(
      path.join(root, "p", "organizations", "acme", "claude-sessions.json"),
      JSON.stringify({ roadmaps: { "3": { sessionId: ID, agentId: "dev" } } }),
    );
    const again = await app(q).request(byRoadmap(3), JSON_ACCEPT);
    expect(await again.json()).toMatchObject({ state: "running", sessionId: "cc-1", runId: 1 });
    await q.stop();
  });

  it("answers queued with the run and its place in line while no slot is free", async () => {
    config = { capacity: 0, idleMinutes: 30 };
    const q = queue();
    const res = await app(q).request(link(), JSON_ACCEPT);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      state: "queued",
      runId: 1,
      position: 1,
      projectId: "p",
      orgId: "acme",
    });
    await q.stop();
  });

  it("answers elsewhere with the process, terminal and pane that hold the session", async () => {
    await fs.writeFile(
      path.join(env.CLAUDE_CONFIG_DIR!, "sessions", "4242.json"),
      JSON.stringify({ pid: 4242, sessionId: ID, cwd: workspace, procStart: "77" }),
    );
    procs.set(4242, { start: "77", tty: "/dev/pts/7", pane: "%3" });
    const q = queue();
    const res = await app(q).request(link(), JSON_ACCEPT);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      state: "elsewhere",
      where: {
        pid: 4242,
        cwd: workspace,
        tty: "/dev/pts/7",
        tmux: { socket: "/tmp/tmux-1/default", pane: "%3" },
      },
    });
    expect((await q.list("p", "acme", { userId: "admin" })).runs).toEqual([]);
    await q.stop();
  });

  it("answers a refusal as JSON with its status", async () => {
    const q = queue();
    const res = await app(q).request(byRoadmap(9), JSON_ACCEPT);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "roadmap_without_session", message: expect.stringContaining("#9") },
    });
    await q.stop();
  });

  it("still redirects without the header", async () => {
    const q = queue();
    const res = await app(q).request(link());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/chat/cc-1");
    await q.stop();
  });
});
