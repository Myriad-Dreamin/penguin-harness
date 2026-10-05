/**
 * The Claude Code queue: employees of an organization ask for a Claude Code run, and the runs
 * are started for them — one Claude Code Session each, opened on this plugin's surface — as
 * slots free up.
 *
 * ## What a run is
 *
 * A prompt, a Workspace and the employee it is for. Queued, it waits; started, it is a surface
 * Session of that employee's Agent (marked as the organization's, `client: "org"`) with
 * `claude` running in the Workspace and the prompt as its first argument — the same Session
 * "New chat → Claude Code" opens, so a person enters it from the Session list or from the
 * console page, types into it, and watches it work. Ended, it is a line of history.
 *
 * The Session is opened as the organization's (`orgId` in the open options), so its program's
 * control environment names the organization and the employee: the `penguin` commands it runs
 * act as that employee, with that Session's own credential.
 *
 * ## Slots
 *
 * The limit is SERVER-WIDE: every organization's runs share `capacity` slots, since the thing
 * being rationed is this machine (each `claude` is a process of its own, with its memory), and
 * the queue is one FIFO across them. A run holds its slot while its program lives. It lets go
 * when the program exits (someone typed `/exit`, or it crashed), when it is released (by the
 * employee it is for, by whoever queued it, or by a person), or when the program has sat idle —
 * nothing on its spinner line — for `idleMinutes` in a row. That last one is what makes the
 * queue run itself: an employee that forgets to release its run does not hold a slot for ever.
 * Letting go of a live program closes it; the Session and Claude Code's own transcript stay.
 *
 * ## Resume runs
 *
 * A run may instead CONTINUE an existing Claude Code session (`claude --resume <id>`, see
 * resume.ts), in the session's own directory. Two kinds, by who opens it:
 *
 *   - opened by a person (no prompt): `keepIdle` — somebody is looking at it, so the idle
 *     reclaim passes it by while it keeps its slot;
 *   - woken by an event (a prompt): `claude --resume <id> <prompt>` starts a turn at once, and
 *     the run is reclaimed like any other once it has sat idle — it does its work and gives
 *     the slot back.
 *
 * How many run at once is the capacity's business alone. One Claude Code session is held by
 * at most one run.
 *
 * ## Where it lives
 *
 * One JSON file per organization, `claude-code-runs.json` in the organization's directory,
 * written whole (temp file, then rename) after every change. The service keeps no state that
 * the files do not: a hot swap or a restart reads them again, and a run whose Session no
 * longer has a live program ends as `lost`.
 *
 * Every change goes through one promise chain, so two requests and the pump never interleave
 * their read-modify-write of the same file.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { OrgActor, OrgView } from "@prismshadow/penguin-server/plugin";
import { KEEP_ENDED, PROMPT_MAX, QueueError, SCREEN_MAX, parseRunsFile, runsPath } from "./runs.js";
import type { EndReason, QueueConfig, RowLike, Run, RunView, RunsFile } from "./runs.js";

/** How often the pump looks at the running programs and starts what fits. */
export const PUMP_MS = 3000;

/** What the service needs of the harness — narrow, so a test can stand each one in. */
export interface QueueDeps {
  gateway: {
    companyModeEnabled(): boolean;
    organization(projectId: string, orgId: string): Promise<OrgView | null>;
    principalOf(projectId: string, orgId: string, actor: OrgActor): Promise<string>;
  };
  sessionService: {
    createSession(args: {
      projectId: string;
      agentId: string;
      workspace?: string;
      surface?: string;
      client?: "web" | "cli" | "org";
    }): Promise<{ sessionId: string }>;
  };
  sessions: {
    findById(sessionId: string): RowLike | null;
    updateTitleIfNull(sessionId: string, title: string): void;
  };
  surfaces: {
    // The rows are the harness's own SessionRow; the queue passes back what findById gave it.
    open(
      row: never,
      ownerUserId: string,
      options: { prompt?: string; orgId?: string },
    ): Promise<{ alive: boolean } | null>;
    describe(row: never): { alive: boolean; view?: Record<string, unknown> } | null;
    close(sessionId: string): void;
  };
  /**
   * What the Session's program is doing, read off the surface itself (its spinner line): the
   * harness's own `statusOf` forgets a Session it did not open in this App, and reading that as
   * idle would close a working program after a hot swap.
   */
  activity(sessionId: string): "running" | "idle";
  /**
   * Tells the surface that the Session about to be opened continues Claude Code session
   * `claudeSessionId` (`claude --resume`), not a new conversation.
   */
  resume(sessionId: string, claudeSessionId: string): void;
  /** The screen of a terminal, for `?screen=N`; null when there is no such terminal. */
  screen(terminalId: string): string[] | null;
  /** The data root: organizations live at `<root>/<projectId>/organizations/<orgId>`. */
  root: string;
  config(): QueueConfig;
  /** The surface kind runs are opened on. */
  surfaceKind: string;
  now?: () => number;
  log?: (line: string) => void;
}

/** One organization's file, as it is held while a change is made. */
interface OrgRuns {
  projectId: string;
  orgId: string;
  file: RunsFile;
}

const orgKey = (projectId: string, orgId: string) => `${projectId}/${orgId}`;

/** Whether `inner` is `outer` or a directory under it. */
function within(outer: string, inner: string): boolean {
  const rel = path.relative(outer, inner);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** A refusal for an organization that runs on another machine: its runs are that machine's. */
function refuseRemote(org: OrgView): void {
  if (org.machineId !== null) {
    throw new QueueError(
      409,
      "remote_org",
      `Organization ${org.orgId} runs on machine ${org.machineId}; queue there.`,
    );
  }
}

/** The employee a run is for: an employee queues for itself, a person names one (`agent`). */
function employeeFor(org: OrgView, principal: string, agent: unknown): string {
  let agentId: string;
  if (principal.startsWith("agent:")) {
    agentId = principal.slice("agent:".length);
  } else {
    agentId = typeof agent === "string" ? agent.trim() : "";
    if (agentId === "") {
      throw new QueueError(
        400,
        "agent_required",
        "Name the employee the run is for (`agent`): a run is a Session of an employee's Agent.",
      );
    }
  }
  if (!org.employees.some((e) => e.agentId === agentId)) {
    throw new QueueError(400, "not_an_employee", `${agentId} is not an employee of ${org.orgId}.`);
  }
  return agentId;
}

/** The line in which queued runs start: oldest first, across organizations. */
function byQueuedAt(a: { run: Run }, b: { run: Run }): number {
  return a.run.queuedAt < b.run.queuedAt ? -1 : a.run.queuedAt > b.run.queuedAt ? 1 : 0;
}

export class ClaudeCodeQueue {
  /** Every organization with a runs file, by key: what the pump walks. */
  private readonly known = new Map<string, { projectId: string; orgId: string }>();
  private chain: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(private readonly deps: QueueDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private iso(): string {
    return new Date(this.now()).toISOString();
  }

  /** Runs `fn` after every change queued before it. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Finds the organizations that already have runs, then pumps every PUMP_MS. */
  async start(pumpMs: number = PUMP_MS): Promise<void> {
    await this.discover();
    if (this.stopped) return;
    this.timer = setInterval(() => void this.pump(), pumpMs);
    this.timer.unref?.();
    void this.pump();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    await this.chain;
  }

  /** `<root>/<project>/organizations/<org>/claude-code-runs.json`, for every one that exists. */
  private async discover(): Promise<void> {
    const list = async (dir: string) => {
      try {
        return (await fs.readdir(dir, { withFileTypes: true }))
          .filter((d) => d.isDirectory())
          .map((d) => d.name);
      } catch {
        return [];
      }
    };
    for (const projectId of await list(this.deps.root)) {
      for (const orgId of await list(path.join(this.deps.root, projectId, "organizations"))) {
        try {
          await fs.access(runsPath(this.deps.root, projectId, orgId));
          this.known.set(orgKey(projectId, orgId), { projectId, orgId });
        } catch {
          // No runs here.
        }
      }
    }
  }

  private async read(projectId: string, orgId: string): Promise<OrgRuns> {
    let text = "";
    try {
      text = await fs.readFile(runsPath(this.deps.root, projectId, orgId), "utf8");
    } catch {
      // No file yet.
    }
    return { projectId, orgId, file: parseRunsFile(text) };
  }

  private async write(org: OrgRuns): Promise<void> {
    const ended = org.file.runs
      .filter((r) => r.status === "ended")
      .sort((a, b) => b.id - a.id)
      .slice(KEEP_ENDED);
    const drop = new Set(ended.map((r) => r.id));
    org.file.runs = org.file.runs.filter((r) => !drop.has(r.id));
    const file = runsPath(this.deps.root, org.projectId, org.orgId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(org.file, null, 2)}\n`);
    await fs.rename(tmp, file);
    this.known.set(orgKey(org.projectId, org.orgId), {
      projectId: org.projectId,
      orgId: org.orgId,
    });
  }

  /** The organization for a caller, and who the caller is; refused while company mode is off and for a missing organization. */
  async organization(
    projectId: string,
    orgId: string,
    actor: OrgActor,
  ): Promise<{ org: OrgView; principal: string }> {
    if (!this.deps.gateway.companyModeEnabled()) {
      throw new QueueError(404, "not_found", "Company mode is off.");
    }
    const org = await this.deps.gateway.organization(projectId, orgId);
    if (org === null) throw new QueueError(404, "org_not_found", `No organization ${orgId}.`);
    const principal = await this.deps.gateway.principalOf(projectId, orgId, actor);
    return { org, principal };
  }

  /**
   * Puts a run in line. An employee queues for itself; a person names the employee (`agent`).
   * The Workspace is the one given — inside the organization's shared workspace, or the
   * calling Session's own — or else the calling Session's, or else the shared one.
   */
  async enqueue(
    projectId: string,
    orgId: string,
    actor: OrgActor,
    body: { prompt?: unknown; workspace?: unknown; title?: unknown; agent?: unknown },
  ): Promise<RunView> {
    const { org, principal } = await this.organization(projectId, orgId, actor);
    refuseRemote(org);
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (prompt === "") throw new QueueError(400, "prompt_required", "A run needs a prompt.");
    if (prompt.length > PROMPT_MAX) {
      throw new QueueError(400, "prompt_too_long", `A prompt is at most ${PROMPT_MAX} characters.`);
    }
    const agentId = employeeFor(org, principal, body.agent);
    const caller =
      actor.sessionId !== undefined ? this.deps.sessions.findById(actor.sessionId) : null;
    let workspace: string;
    if (typeof body.workspace === "string" && body.workspace.trim() !== "") {
      workspace = path.resolve(body.workspace.trim());
      const allowed =
        within(org.workspace, workspace) ||
        (caller !== null && path.resolve(caller.workspace) === workspace);
      if (!path.isAbsolute(body.workspace.trim()) || !allowed) {
        throw new QueueError(
          400,
          "workspace_outside",
          `A run's Workspace is an absolute path inside the organization's workspace (${org.workspace}), or the calling Session's own.`,
        );
      }
    } else {
      workspace = caller?.workspace ?? org.workspace;
    }
    const title =
      typeof body.title === "string" && body.title.trim() !== ""
        ? body.title.trim().slice(0, 200)
        : null;
    const run = await this.serial(async () => {
      const held = await this.read(projectId, orgId);
      const run: Run = {
        id: held.file.next,
        agentId,
        by: principal,
        ownerUserId: actor.userId,
        prompt,
        title,
        workspace,
        status: "queued",
        queuedAt: this.iso(),
      };
      held.file.next += 1;
      held.file.runs.push(run);
      await this.write(held);
      return run;
    });
    this.deps.log?.(`[claude-code] queued run ${orgId}#${run.id} for ${agentId}`);
    // The answer is the run as queued; the pump that may start it comes after.
    const view = (await this.views(projectId, orgId, [run.id]))[0] ?? run;
    void this.pump();
    return view;
  }

  /**
   * The run that continues Claude Code session `claudeSessionId` for an employee: the run that
   * already holds that session — queued or running, in any organization, since one session is
   * one program — or else a new resume run put in line (`claude --resume`, in the session's own
   * working directory). Without `prompt` the run is a person's and is kept while idle; with
   * one it starts a turn with it and is reclaimed when idle. A run already holding the session
   * is answered as it is: `prompt` starts nothing there. Only the Project's people and its
   * employees may. `guard` runs only when no run holds the session, inside the same serial
   * step as the insert, so two clicks never queue two runs; it throws to refuse (the session
   * is live outside this queue). The pump has had its turn before the answer, so a free slot
   * means the run comes back running.
   */
  async resume(
    projectId: string,
    orgId: string,
    actor: OrgActor,
    args: {
      claudeSessionId: string;
      agent?: unknown;
      /** What the continued conversation is told first; absent for a person opening it. */
      prompt?: string;
      /** The session's working directory; asked only once the caller may resume at all. */
      workspace: () => Promise<string>;
      guard: () => Promise<void>;
    },
  ): Promise<{ projectId: string; orgId: string; run: RunView; existing: boolean }> {
    const { org, principal } = await this.organization(projectId, orgId, actor);
    refuseRemote(org);
    if (principal.startsWith("user:") && !org.userIds.includes(actor.userId)) {
      throw new QueueError(403, "not_a_member", `You are not a member of Project ${projectId}.`);
    }
    const agentId = employeeFor(org, principal, args.agent);
    const prompt = args.prompt?.trim() ?? "";
    if (prompt.length > PROMPT_MAX) {
      throw new QueueError(400, "prompt_too_long", `A prompt is at most ${PROMPT_MAX} characters.`);
    }
    const workspace = await args.workspace();
    const found = await this.serial(async () => {
      const holder = (await this.everyRun()).find(
        (x) => x.run.status !== "ended" && x.run.claudeSessionId === args.claudeSessionId,
      );
      if (holder !== undefined) {
        return {
          projectId: holder.org.projectId,
          orgId: holder.org.orgId,
          id: holder.run.id,
          existing: true,
        };
      }
      await args.guard();
      const held = await this.read(projectId, orgId);
      const run: Run = {
        id: held.file.next,
        agentId,
        by: principal,
        ownerUserId: actor.userId,
        prompt,
        title: null,
        workspace,
        status: "queued",
        queuedAt: this.iso(),
        claudeSessionId: args.claudeSessionId,
        // A person's: kept while idle. An event's (a prompt): reclaimed once it goes idle.
        ...(prompt === "" ? { keepIdle: true } : {}),
      };
      held.file.next += 1;
      held.file.runs.push(run);
      await this.write(held);
      this.deps.log?.(
        `[claude-code] queued resume run ${orgId}#${run.id} of ${args.claudeSessionId} for ${agentId}`,
      );
      return { projectId, orgId, id: run.id, existing: false };
    });
    await this.pump();
    const run = (await this.views(found.projectId, found.orgId, [found.id]))[0];
    if (run === undefined) throw new QueueError(404, "run_not_found", `No run #${found.id}.`);
    return { projectId: found.projectId, orgId: found.orgId, run, existing: found.existing };
  }

  /**
   * Every run of the organization (newest first), with the server's slots. `active` leaves the
   * ended runs out — up to {@link KEEP_ENDED} of them, each with its prompt — for a caller that
   * asks often about who holds a slot; the totals are the same either way.
   */
  async list(
    projectId: string,
    orgId: string,
    actor: OrgActor,
    opts: { active?: boolean } = {},
  ): Promise<{
    runs: RunView[];
    capacity: number;
    idleMinutes: number;
    running: number;
    queued: number;
  }> {
    await this.organization(projectId, orgId, actor);
    const views = await this.views(projectId, orgId, null);
    const runs = opts.active === true ? views.filter((r) => r.status !== "ended") : views;
    const all = await this.everyRun();
    const { capacity, idleMinutes } = this.deps.config();
    return {
      runs,
      capacity,
      idleMinutes,
      running: all.filter((x) => x.run.status === "running").length,
      queued: all.filter((x) => x.run.status === "queued").length,
    };
  }

  /** One run; with `screen`, the last lines of its program's screen. */
  async show(
    projectId: string,
    orgId: string,
    id: number,
    actor: OrgActor,
    screen: number,
  ): Promise<RunView> {
    await this.organization(projectId, orgId, actor);
    const view = (await this.views(projectId, orgId, [id]))[0];
    if (view === undefined) throw new QueueError(404, "run_not_found", `No run #${id}.`);
    if (screen > 0 && view.status === "running" && view.sessionId !== undefined) {
      const row = this.deps.sessions.findById(view.sessionId);
      const described = row === null ? null : this.deps.surfaces.describe(row as never);
      const terminalId = described?.view?.terminalId;
      const lines = typeof terminalId === "string" ? this.deps.screen(terminalId) : null;
      if (lines !== null) {
        const written = lines.map((l) => l.trimEnd()).filter((l) => l !== "");
        view.screen = written.slice(-Math.min(screen, SCREEN_MAX));
      }
    }
    return view;
  }

  /**
   * Lets go of a run: a queued one is cancelled, a running one's program is closed. The employee
   * the run is for, whoever queued it, and any person may; another employee may not.
   */
  async release(projectId: string, orgId: string, id: number, actor: OrgActor): Promise<RunView> {
    const { principal } = await this.organization(projectId, orgId, actor);
    await this.serial(async () => {
      const held = await this.read(projectId, orgId);
      const run = held.file.runs.find((r) => r.id === id);
      if (run === undefined) throw new QueueError(404, "run_not_found", `No run #${id}.`);
      const mayRelease =
        principal.startsWith("user:") ||
        principal === `agent:${run.agentId}` ||
        principal === run.by;
      if (!mayRelease) {
        throw new QueueError(
          403,
          "not_yours",
          `Run #${id} is ${run.agentId}'s; only it, whoever queued it, or a person may release it.`,
        );
      }
      if (run.status === "ended") return;
      if (run.status === "running" && run.sessionId !== undefined) {
        this.deps.surfaces.close(run.sessionId);
      }
      this.finish(run, run.status === "queued" ? "cancelled" : "released");
      run.endedBy = principal;
      await this.write(held);
    });
    const view = (await this.views(projectId, orgId, [id]))[0];
    void this.pump();
    if (view === undefined) throw new QueueError(404, "run_not_found", `No run #${id}.`);
    return view;
  }

  private finish(run: Run, end: EndReason, error?: string): void {
    run.status = "ended";
    run.end = end;
    run.endedAt = this.iso();
    delete run.idleSince;
    if (error !== undefined) run.error = error;
  }

  /** Every known organization's runs, in one read. */
  private async everyRun(): Promise<Array<{ org: OrgRuns; run: Run }>> {
    const out: Array<{ org: OrgRuns; run: Run }> = [];
    for (const { projectId, orgId } of this.known.values()) {
      const held = await this.read(projectId, orgId);
      for (const run of held.file.runs) out.push({ org: held, run });
    }
    return out;
  }

  /** The organization's runs as views (all of them, newest first, or the ids asked for). */
  private async views(projectId: string, orgId: string, ids: number[] | null): Promise<RunView[]> {
    const all = await this.everyRun();
    const line = all.filter((x) => x.run.status === "queued").sort(byQueuedAt);
    // An organization with no file yet is not among the known ones; its (empty) runs are read as is.
    const runs = this.known.has(orgKey(projectId, orgId))
      ? all.filter((x) => x.org.projectId === projectId && x.org.orgId === orgId).map((x) => x.run)
      : (await this.read(projectId, orgId)).file.runs;
    const picked = ids === null ? runs : runs.filter((r) => ids.includes(r.id));
    return picked
      .sort((a, b) => b.id - a.id)
      .map((run) => {
        const view: RunView = { ...run };
        if (run.status === "queued") {
          const at = line.findIndex(
            (x) => x.org.projectId === projectId && x.org.orgId === orgId && x.run.id === run.id,
          );
          if (at >= 0) view.position = at + 1;
        } else if (run.status === "running") {
          view.activity = run.idleSince === undefined ? "working" : "idle";
        }
        return view;
      });
  }

  /**
   * One pass: every running program is looked at (gone ⇒ ended; idle too long ⇒ closed), then
   * queued runs are started, oldest first, while slots are free. Nothing runs while company
   * mode is off, and a paused organization's runs wait.
   */
  pump(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    return this.serial(async () => {
      if (this.stopped || !this.deps.gateway.companyModeEnabled()) return;
      const { capacity, idleMinutes } = this.deps.config();
      const orgs: OrgRuns[] = [];
      for (const { projectId, orgId } of this.known.values()) {
        orgs.push(await this.read(projectId, orgId));
      }
      const dirty = new Set<OrgRuns>();
      const now = this.now();
      let running = 0;
      for (const org of orgs) {
        for (const run of org.file.runs) {
          if (run.status !== "running") continue;
          const row =
            run.sessionId === undefined ? null : this.deps.sessions.findById(run.sessionId);
          const described = row === null ? null : this.deps.surfaces.describe(row as never);
          if (row === null || described === null || !described.alive) {
            this.finish(run, row === null || described === null ? "lost" : "exited");
            dirty.add(org);
            continue;
          }
          if (this.deps.activity(run.sessionId!) === "running") {
            if (run.idleSince !== undefined) {
              delete run.idleSince;
              dirty.add(org);
            }
          } else {
            if (run.idleSince === undefined) {
              run.idleSince = new Date(now).toISOString();
              dirty.add(org);
            } else if (
              run.keepIdle !== true &&
              idleMinutes > 0 &&
              now - Date.parse(run.idleSince) >= idleMinutes * 60_000
            ) {
              this.deps.surfaces.close(run.sessionId!);
              this.finish(run, "idle");
              dirty.add(org);
              this.deps.log?.(`[claude-code] closed idle run ${org.orgId}#${run.id}`);
              continue;
            }
          }
          running += 1;
        }
      }
      const line = orgs
        .flatMap((org) =>
          org.file.runs.filter((r) => r.status === "queued").map((run) => ({ org, run })),
        )
        .sort(byQueuedAt);
      const paused = new Map<string, boolean>();
      for (const { org, run } of line) {
        if (running >= capacity) break;
        const key = orgKey(org.projectId, org.orgId);
        if (!paused.has(key)) {
          const view = await this.deps.gateway.organization(org.projectId, org.orgId);
          paused.set(key, view === null || view.status !== "active");
        }
        if (paused.get(key)) continue;
        await this.startRun(org, run);
        dirty.add(org);
        if (run.status === "running") running += 1;
      }
      for (const org of dirty) await this.write(org);
    });
  }

  /** Opens the run's Claude Code Session; a failure ends the run with the reason. */
  private async startRun(org: OrgRuns, run: Run): Promise<void> {
    try {
      const info = await this.deps.sessionService.createSession({
        projectId: org.projectId,
        agentId: run.agentId,
        workspace: run.workspace,
        surface: this.deps.surfaceKind,
        client: "org",
      });
      run.sessionId = info.sessionId;
      const row = this.deps.sessions.findById(info.sessionId);
      if (row === null) throw new Error(`Session ${info.sessionId} vanished before it was opened.`);
      if (run.title !== null) this.deps.sessions.updateTitleIfNull(info.sessionId, run.title);
      // A resume run's program continues its Claude Code session (with its prompt, if any).
      if (run.claudeSessionId !== undefined) {
        this.deps.resume(info.sessionId, run.claudeSessionId);
      }
      // Opened as the organization's: the program's control environment names it.
      const opened = await this.deps.surfaces.open(row as never, run.ownerUserId, {
        ...(run.prompt !== "" ? { prompt: run.prompt } : {}),
        orgId: org.orgId,
      });
      if (opened === null) throw new Error(`The ${this.deps.surfaceKind} surface is not loaded.`);
      run.status = "running";
      run.startedAt = this.iso();
      this.deps.log?.(
        `[claude-code] started run ${org.orgId}#${run.id} as Session ${info.sessionId}`,
      );
    } catch (err) {
      this.finish(run, "failed", err instanceof Error ? err.message : String(err));
      this.deps.log?.(`[claude-code] run ${org.orgId}#${run.id} failed: ${run.error}`);
    }
  }
}
