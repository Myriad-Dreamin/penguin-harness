/**
 * Opening a Claude Code session by its id: one link that lands a person inside a given Claude
 * Code conversation, continued as an employee of an organization.
 *
 *   GET /api/claude-code/open/<claudeSessionId>?org=<orgId>&agent=<agentId>[&project=<projectId>][&prompt=<text>]
 *   GET /api/claude-code/open?org=<orgId>&roadmap=<n>[&project=<projectId>][&prompt=<text>]
 *
 * The second is the first for the session the organization's `claude-sessions.json` maps
 * roadmap <n> to, as the employee it names (roadmap-sessions.ts); no such entry is a 404.
 *
 * Behind the login gate, for the Project's people. The answer is a redirect or a page (the JSON
 * form, `Accept: application/json`, answers the same outcomes as data: open-answer.ts):
 *
 *   - a queue run already holds the session → 302 to its Session (`/chat/<sessionId>`);
 *   - else a resume run is queued (`claude --resume <id>` in the session's own working
 *     directory, a Session of the named employee, so its `penguin` commands act as that
 *     employee) → 302 to its Session once it started, or to the console with the run
 *     highlighted while it waits for a slot;
 *   - the session is live outside this queue (a terminal on this machine runs it) → 409 and a
 *     page saying where — pid, terminal, tmux pane — since a second program on one session
 *     would interleave two writers in one transcript;
 *   - no such session, or a record that cannot be read → 404 and a page with the reason.
 *
 * `prompt` is how an event wakes the session rather than a person opening it: a resume run it
 * queues starts `claude --resume <id> <prompt>` and is reclaimed once idle, where a person's is
 * kept while idle (queue.ts). A session a run already holds is entered as it is — the prompt
 * starts nothing there.
 *
 * An organization that runs on another machine is sent there, through this server's machine
 * proxy, with `machine=` riding along so that server's redirect names the machine the chat
 * page must ask.
 *
 * What it reads is Claude Code's own state under `~/.claude` (`CLAUDE_CONFIG_DIR` moves it):
 * `projects/<dir>/<id>.jsonl`, whose first user line names the working directory, and
 * `sessions/<pid>.json`, the registry each live program keeps of itself.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { Hono } from "hono";
import type { Context } from "hono";
import type { OrgActor } from "@prismshadow/penguin-server/plugin";
import type { ClaudeCodeQueue } from "./queue.js";
import { actorOf } from "./queue-routes.js";
import { CLAUDE_SESSION_ID, QueueError } from "./runs.js";
import { ROADMAP_SESSIONS_FILE, readRoadmapSessions } from "./roadmap-sessions.js";
import { runAnswer, wantsJson } from "./open-answer.js";

/** How many lines of a transcript are read looking for its first user line. */
export const RECORD_SCAN_LINES = 2000;

/** Claude Code's own directory: `CLAUDE_CONFIG_DIR`, else `~/.claude`. */
export function claudeRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_CONFIG_DIR?.trim() || path.join(env.HOME ?? env.USERPROFILE ?? "", ".claude");
}

/** A session's record: its transcript file, and the working directory it ran in. */
export interface SessionRecord {
  file: string;
  cwd: string;
}

/**
 * The record of session `id`: `projects/<dir>/<id>.jsonl`, and the `cwd` of its first user
 * line. 404 when there is no such file, when it cannot be read, when no user line names a
 * directory, and when that directory is gone.
 */
export async function findSessionRecord(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SessionRecord> {
  const projects = path.join(claudeRoot(env), "projects");
  let dirs: string[];
  try {
    dirs = await fsp.readdir(projects);
  } catch {
    dirs = [];
  }
  let file: string | null = null;
  for (const dir of dirs) {
    const candidate = path.join(projects, dir, `${id}.jsonl`);
    try {
      if ((await fsp.stat(candidate)).isFile()) {
        file = candidate;
        break;
      }
    } catch {
      // Not in this directory.
    }
  }
  if (file === null) {
    throw new QueueError(
      404,
      "session_not_found",
      `No Claude Code session ${id} on this server (looked in ${projects}).`,
    );
  }
  let cwd: string | null = null;
  try {
    cwd = await firstUserCwd(file);
  } catch (err) {
    throw new QueueError(
      404,
      "record_unreadable",
      `The record of Claude Code session ${id} (${file}) cannot be read: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (cwd === null) {
    throw new QueueError(
      404,
      "record_without_cwd",
      `The record of Claude Code session ${id} (${file}) names no working directory in its first ${RECORD_SCAN_LINES} lines.`,
    );
  }
  try {
    if (!(await fsp.stat(cwd)).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new QueueError(
      404,
      "cwd_gone",
      `Claude Code session ${id} ran in ${cwd}, which is no longer a directory on this server.`,
    );
  }
  return { file, cwd };
}

/** The `cwd` of the first `type: "user"` line, or null; reads no further than it must. */
async function firstUserCwd(file: string): Promise<string | null> {
  const stream = fs.createReadStream(file, { encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let seen = 0;
  try {
    for await (const line of lines) {
      if (++seen > RECORD_SCAN_LINES) break;
      if (!line.includes('"user"')) continue;
      try {
        const parsed = JSON.parse(line) as { type?: unknown; cwd?: unknown };
        if (parsed.type === "user" && typeof parsed.cwd === "string" && path.isAbsolute(parsed.cwd))
          return parsed.cwd;
      } catch {
        // A line that is not JSON says nothing.
      }
    }
    return null;
  } finally {
    lines.close();
    stream.destroy();
  }
}

/** What this machine says about a process, for the registry check. Injectable for tests. */
export interface ProcProbe {
  alive(pid: number): boolean;
  /** Field 22 of `/proc/<pid>/stat` (start time in clock ticks), as Claude Code's `procStart` records it; null when unknown. */
  startTime(pid: number): string | null;
  /** The terminal on its stdin (`/dev/pts/3`), or null. */
  tty(pid: number): string | null;
  /** The tmux pane it runs in, or null. */
  tmux(pid: number): { socket: string; pane: string } | null;
}

/** The probe of this machine: a signal-0 for liveness, `/proc` for the rest (null off Linux). */
export const procProbe: ProcProbe = {
  alive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      // EPERM: it exists, it is just not ours to signal.
      return (err as NodeJS.ErrnoException).code === "EPERM";
    }
  },
  startTime(pid) {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      // The command name sits in parentheses and may hold spaces: count from after it.
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      return fields[19] ?? null; // Field 22 overall; the 20th after the name and the state.
    } catch {
      return null;
    }
  },
  tty(pid) {
    try {
      const target = fs.readlinkSync(`/proc/${pid}/fd/0`);
      return target.startsWith("/dev/") ? target : null;
    } catch {
      return null;
    }
  },
  tmux(pid) {
    try {
      const env = fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
      const get = (name: string) =>
        env.find((e) => e.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
      const socket = get("TMUX").split(",")[0] ?? "";
      const pane = get("TMUX_PANE");
      return socket !== "" && pane !== "" ? { socket, pane } : null;
    } catch {
      return null;
    }
  },
};

/** A live Claude Code program holding a session, as its registry entry and this machine say. */
export interface LiveSession {
  pid: number;
  cwd: string | null;
  tty: string | null;
  tmux: { socket: string; pane: string } | null;
}

/**
 * The live program holding session `id`, from `sessions/<pid>.json`: an entry naming the
 * session whose pid is alive — and, when both sides know it, started when the entry says, so a
 * pid reused by an unrelated process after a crash does not count.
 */
export async function liveSession(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
  probe: ProcProbe = procProbe,
): Promise<LiveSession | null> {
  const dir = path.join(claudeRoot(env), "sessions");
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return null;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    let entry: { pid?: unknown; sessionId?: unknown; cwd?: unknown; procStart?: unknown };
    try {
      entry = JSON.parse(await fsp.readFile(path.join(dir, name), "utf8")) as typeof entry;
    } catch {
      continue;
    }
    if (entry.sessionId !== id || typeof entry.pid !== "number") continue;
    const pid = entry.pid;
    if (!probe.alive(pid)) continue;
    const started = probe.startTime(pid);
    if (typeof entry.procStart === "string" && started !== null && started !== entry.procStart)
      continue;
    return {
      pid,
      cwd: typeof entry.cwd === "string" ? entry.cwd : null,
      tty: probe.tty(pid),
      tmux: probe.tmux(pid),
    };
  }
  return null;
}

/** The refusal for a session a program outside the queue holds. */
export class RunningElsewhere extends QueueError {
  constructor(
    readonly claudeSessionId: string,
    readonly holder: LiveSession,
  ) {
    super(
      409,
      "running_elsewhere",
      `Claude Code session ${claudeSessionId} is already running outside the queue, as process ${holder.pid}` +
        (holder.tty !== null ? ` on ${holder.tty}` : "") +
        (holder.tmux !== null
          ? ` (tmux pane ${holder.tmux.pane}, socket ${holder.tmux.socket})`
          : "") +
        `. Exit it there (/exit), then open this link again.`,
    );
  }
}

/** The projects under the data root that have an organization `orgId`. */
async function orgProjects(root: string, orgId: string): Promise<string[]> {
  let projects: string[];
  try {
    projects = await fsp.readdir(root);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const projectId of projects) {
    try {
      if ((await fsp.stat(path.join(root, projectId, "organizations", orgId))).isDirectory())
        out.push(projectId);
    } catch {
      // No such organization in this project.
    }
  }
  return out;
}

/** An id that may name a directory under the data root. */
const DIR_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** The page a refusal is answered with: a link is clicked in a browser, so JSON would be a dead end. */
export function refusalPage(status: number, message: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Claude Code</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#111827;background:#fff}@media (prefers-color-scheme:dark){body{color:#e5e7eb;background:#111}}code{font:12px ui-monospace,monospace}</style>
</head>
<body><h1>Claude Code</h1><p>${esc(message)}</p><p><small>${status}</small></p></body>
</html>
`;
}

export interface OpenRoutesDeps {
  queue: ClaudeCodeQueue;
  /** The data root: organizations live at `<root>/<projectId>/organizations/<orgId>`. */
  root: string;
  env?: NodeJS.ProcessEnv;
  probe?: ProcProbe;
}

/** The organization's Project: the one named (`project`), else the only one that has it. */
async function projectOf(root: string, orgId: string, named: string | undefined): Promise<string> {
  if (named !== undefined && named !== "") {
    if (!DIR_ID.test(named))
      throw new QueueError(400, "bad_project", `Not a Project id: ${named}.`);
    return named;
  }
  const found = await orgProjects(root, orgId);
  if (found.length !== 1) {
    throw new QueueError(
      found.length === 0 ? 404 : 400,
      found.length === 0 ? "org_not_found" : "project_required",
      found.length === 0
        ? `No organization ${orgId}.`
        : `Organization ${orgId} exists in several Projects (${found.join(", ")}); name one (\`project\`).`,
    );
  }
  return found[0]!;
}

/** A request admitted to an organization: its query, the organization, and who asks. */
interface Asked {
  query: Record<string, string>;
  orgId: string;
  projectId: string;
  actor: OrgActor;
  machineId: string | null;
}

/**
 * `GET /:claudeSessionId` and `GET /?roadmap=<n>`, mounted under `/api/claude-code/open`. The
 * second finds the roadmap's session in the organization's `claude-sessions.json`
 * (roadmap-sessions.ts) and then is the first, continued as the employee the mapping names.
 */
export function openRoutes(deps: OpenRoutesDeps): Hono {
  const env = deps.env ?? process.env;
  const app = new Hono();
  app.onError((err, c) => {
    const status = err instanceof QueueError ? err.status : 500;
    if (!wantsJson(c)) return c.html(refusalPage(status, err.message), status as 404);
    // Held elsewhere is an answer the dialog explains, not a failure of the request.
    if (err instanceof RunningElsewhere) return c.json({ state: "elsewhere", where: err.holder });
    const code = err instanceof QueueError ? err.code : "internal";
    return c.json({ error: { code, message: err.message } }, status as 404);
  });

  /** Who asks, about which organization, after the gate: the Project resolved, the person admitted. */
  async function admit(c: Context): Promise<Asked> {
    const query = c.req.query();
    const orgId = query.org ?? "";
    if (!DIR_ID.test(orgId))
      throw new QueueError(400, "org_required", "Name the organization (`org`).");
    const projectId = await projectOf(deps.root, orgId, query.project);
    const actor = actorOf(c, query);
    const { org } = await deps.queue.organization(projectId, orgId, actor);
    return { query, orgId, projectId, actor, machineId: org.machineId };
  }

  /** Asked where the organization runs; that server's redirect then names the machine. */
  function elsewhere(c: Context, at: Asked, rest: string) {
    const machine = at.machineId!;
    const params = new URLSearchParams({ ...at.query, project: at.projectId, machine });
    return c.redirect(
      `/server/${encodeURIComponent(machine)}/api/claude-code/open${rest}?${params}`,
      302,
    );
  }

  /** Enter the run holding session `id`, else queue its resume as `agent`, and go there. */
  async function enter(c: Context, at: Asked, id: string, agent: string | undefined) {
    const prompt = at.query.prompt?.trim() ?? "";
    const result = await deps.queue.resume(at.projectId, at.orgId, at.actor, {
      claudeSessionId: id,
      agent,
      ...(prompt !== "" ? { prompt } : {}),
      workspace: async () => (await findSessionRecord(id, env)).cwd,
      guard: async () => {
        const holder = await liveSession(id, env, deps.probe);
        if (holder !== null) throw new RunningElsewhere(id, holder);
      },
    });
    const machine = at.query.machine;
    if (wantsJson(c)) return c.json(runAnswer(result, machine));
    const { run } = result;
    if (run.status === "running" && run.sessionId !== undefined) {
      return c.redirect(
        `/chat/${encodeURIComponent(run.sessionId)}` +
          (machine ? `?machine=${encodeURIComponent(machine)}` : ""),
        302,
      );
    }
    // Waiting for a slot (or it could not start): the console, with this run picked out.
    return c.redirect(
      `/org/${encodeURIComponent(result.projectId)}/${encodeURIComponent(result.orgId)}/claude-code?run=${run.id}`,
      302,
    );
  }

  app.get("/", async (c: Context) => {
    const raw = c.req.query("roadmap") ?? "";
    if (!/^[1-9][0-9]{0,8}$/.test(raw))
      throw new QueueError(400, "roadmap_required", "Name the roadmap (`roadmap`) by its number.");
    const at = await admit(c);
    if (at.machineId !== null) return elsewhere(c, at, "");
    const mapped = (await readRoadmapSessions(deps.root, at.projectId, at.orgId)).get(Number(raw));
    if (mapped === undefined) {
      throw new QueueError(
        404,
        "roadmap_without_session",
        `Roadmap #${raw} of organization ${at.orgId} has no Claude Code session: ${ROADMAP_SESSIONS_FILE} in the organization's directory names none for it.`,
      );
    }
    return enter(c, at, mapped.sessionId, mapped.agentId);
  });

  app.get("/:id", async (c: Context) => {
    const id = c.req.param("id") ?? "";
    if (!CLAUDE_SESSION_ID.test(id)) {
      throw new QueueError(404, "session_not_found", `Not a Claude Code session id: ${id}.`);
    }
    const at = await admit(c);
    if (at.machineId !== null) return elsewhere(c, at, `/${encodeURIComponent(id)}`);
    return enter(c, at, id, at.query.agent);
  });
  return app;
}
