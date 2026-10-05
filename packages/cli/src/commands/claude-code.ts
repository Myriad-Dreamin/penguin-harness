/**
 * `penguin org claude-code`: the claude-code plugin's queue of Claude Code runs — queue one,
 * list them, show one (with the last lines of its screen), release one. The run is the calling
 * employee's (PENGUIN_AGENT_ID); a person names the employee with `--agent`.
 *
 * `release --self` is how a run ends itself: the program inside a queued run carries its
 * Session's control environment, so PENGUIN_SESSION_ID names the Session the run opened, and
 * the run holding it is the one to let go of once its work is done.
 *
 * The organization plumbing (scope, connection, the plugin-missing 404) stays in org.ts and
 * reaches this module as a {@link ClaudeCodeKit}.
 */
import path from "node:path";
import type { Command } from "commander";
import type { Messages } from "../i18n.js";

/** One run of the claude-code plugin's queue, as its routes answer it. */
export interface ClaudeCodeRun {
  id: number;
  agentId: string;
  by: string;
  prompt: string;
  title: string | null;
  workspace: string;
  status: "queued" | "running" | "ended";
  sessionId?: string;
  position?: number;
  activity?: "working" | "idle";
  end?: string;
  error?: string;
  screen?: string[];
}

interface ClaudeCodeRunsResponse {
  runs: ClaudeCodeRun[];
  capacity: number;
  idleMinutes: number;
  running: number;
  queued: number;
}

/** A request under the organization's `…/claude-code` routes; null after an error it reported. */
export type ClaudeCodeRequester = <T>(
  method: string,
  suffix: string,
  body?: unknown,
) => Promise<T | null>;

/** What the commands need of org.ts. */
export interface ClaudeCodeKit {
  /** Appends the organization options every leaf command takes. */
  scoped(cmd: Command): Command;
  /** The organization the options name, connected; null after an error it reported. */
  open(opts: Record<string, unknown>): Promise<ClaudeCodeRequester | null>;
  /** The caller's identity for a body (the control environment's session and Agent). */
  actorFields(): Record<string, string>;
  /** The same identity, plus `extra`, as a `?…` query for the reads. */
  actorQuery(extra?: Array<[string, string | undefined]>): string;
  fail(message: string): void;
  print(text: string): void;
  printJson(value: unknown): void;
}

/** A run's state in a word or three: its place in line, what its program is doing, or how it ended. */
function claudeCodeState(run: ClaudeCodeRun, t: Messages): string {
  if (run.status === "queued") return t.org.claudeCodeQueuedAt(run.position ?? 0);
  if (run.status === "running") return t.org.claudeCodeRunning(run.activity ?? "working");
  return t.org.claudeCodeEnded(run.end ?? "");
}

/** `#<id>  <state>  <agent>  <title or the prompt's first line>`. */
function claudeCodeLine(run: ClaudeCodeRun, t: Messages): string {
  const name = run.title ?? run.prompt.split(/\r?\n/, 1)[0] ?? "";
  return `#${run.id}  ${claudeCodeState(run, t)}  ${run.agentId}  ${name}`;
}

/**
 * The run the calling Session is the program of: the one not yet ended whose Session is
 * PENGUIN_SESSION_ID. Null after the error (no session in the environment, or no such run).
 */
async function ownRun(
  request: ClaudeCodeRequester,
  kit: ClaudeCodeKit,
  t: Messages,
): Promise<number | null> {
  const sessionId = process.env.PENGUIN_SESSION_ID?.trim() ?? "";
  if (sessionId === "") {
    kit.fail(t.org.claudeCodeSelfNoSession());
    return null;
  }
  const res = await request<ClaudeCodeRunsResponse>("GET", `/runs${kit.actorQuery()}`);
  if (res === null) return null;
  const own = res.runs.find((r) => r.sessionId === sessionId && r.status !== "ended");
  if (own === undefined) {
    kit.fail(t.org.claudeCodeSelfNoRun(sessionId));
    return null;
  }
  return own.id;
}

export function registerClaudeCode(org: Command, t: Messages, kit: ClaudeCodeKit): void {
  const cc = org.command("claude-code").description(t.org.claudeCodeDesc);
  const runId = (raw: string): number | null => {
    if (!/^[1-9][0-9]*$/.test(raw)) {
      kit.fail(t.org.claudeCodeRunIdInvalid(raw));
      return null;
    }
    return Number(raw);
  };

  kit
    .scoped(
      cc
        .command("run <prompt>")
        .description(t.org.claudeCodeRunDesc)
        .option("--workspace <dir>", t.org.claudeCodeWorkspace)
        .option("--title <title>", t.org.claudeCodeTitle)
        .option("--agent <agent_id>", t.org.claudeCodeAgent),
    )
    .action(async (prompt: string, opts) => {
      const request = await kit.open(opts);
      if (request === null) return;
      const run = await request<ClaudeCodeRun>("POST", "/runs", {
        prompt,
        ...(opts.workspace !== undefined
          ? { workspace: path.resolve(String(opts.workspace)) }
          : {}),
        ...(opts.title !== undefined ? { title: String(opts.title) } : {}),
        ...(opts.agent !== undefined ? { agent: String(opts.agent) } : {}),
        ...kit.actorFields(),
      });
      if (run === null) return;
      if (opts.json === true) kit.printJson(run);
      else kit.print(t.org.claudeCodeQueued(run.id, claudeCodeState(run, t)));
    });

  kit.scoped(cc.command("ls").description(t.org.claudeCodeLsDesc)).action(async (opts) => {
    const request = await kit.open(opts);
    if (request === null) return;
    const res = await request<ClaudeCodeRunsResponse>("GET", `/runs${kit.actorQuery()}`);
    if (res === null) return;
    if (opts.json === true) {
      kit.printJson(res);
      return;
    }
    kit.print(t.org.claudeCodeSlots(res.running, res.capacity, res.queued));
    if (res.runs.length === 0) kit.print(t.org.claudeCodeEmpty());
    for (const run of res.runs) kit.print(claudeCodeLine(run, t));
  });

  kit
    .scoped(
      cc
        .command("show <id>")
        .description(t.org.claudeCodeShowDesc)
        .option("--screen <lines>", t.org.claudeCodeScreen),
    )
    .action(async (raw: string, opts) => {
      const id = runId(raw);
      if (id === null) return;
      const request = await kit.open(opts);
      if (request === null) return;
      const lines = opts.screen !== undefined ? String(opts.screen) : undefined;
      const run = await request<ClaudeCodeRun>(
        "GET",
        `/runs/${id}${kit.actorQuery([["screen", lines]])}`,
      );
      if (run === null) return;
      if (opts.json === true) {
        kit.printJson(run);
        return;
      }
      kit.print(claudeCodeLine(run, t));
      kit.print(`${t.org.claudeCodeWorkspaceLabel()}: ${run.workspace}`);
      if (run.sessionId !== undefined)
        kit.print(`${t.org.claudeCodeSessionLabel()}: ${run.sessionId}`);
      if (run.error !== undefined) kit.print(run.error);
      if (run.title !== null) kit.print(run.prompt);
      for (const line of run.screen ?? []) kit.print(`  ${line}`);
    });

  kit
    .scoped(
      cc
        .command("release [id]")
        .description(t.org.claudeCodeReleaseDesc)
        .option("--self", t.org.claudeCodeReleaseSelf),
    )
    .action(async (raw: string | undefined, opts) => {
      if ((raw === undefined) === (opts.self !== true)) {
        kit.fail(t.org.claudeCodeReleaseWhich());
        return;
      }
      const named = raw === undefined ? null : runId(raw);
      if (raw !== undefined && named === null) return;
      const request = await kit.open(opts);
      if (request === null) return;
      const id = named ?? (await ownRun(request, kit, t));
      if (id === null) return;
      const run = await request<ClaudeCodeRun>("POST", `/runs/${id}/release`, {
        ...kit.actorFields(),
      });
      if (run === null) return;
      if (opts.json === true) kit.printJson(run);
      else kit.print(t.org.claudeCodeReleased(run.id, claudeCodeState(run, t)));
    });
}
