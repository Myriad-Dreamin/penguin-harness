/**
 * A run of the Claude Code queue as it is written down: the record, its file under the
 * organization's directory, and the refusal the routes turn into an HTTP answer. The queue
 * (queue.ts) is what changes these records; this module only says what they are.
 */
import path from "node:path";

/** A Claude Code session id as it may appear in a path: no separators, no dots. */
export const CLAUDE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/** The file each organization's runs are kept in, under its directory. */
export const RUNS_FILE = "claude-code-runs.json";

/** How many ended runs an organization's file keeps (newest first); older ones are dropped. */
export const KEEP_ENDED = 100;

/** Longest prompt a run takes, in characters — it becomes a command-line argument. */
export const PROMPT_MAX = 20_000;

/** The most screen lines `GET …/runs/<id>?screen=N` hands back. */
export const SCREEN_MAX = 200;

/** Where a run is. */
export type RunStatus = "queued" | "running" | "ended";

/**
 * Why a run ended:
 *
 *   exited     the program exited on its own (`/exit`, a crash)
 *   released   someone let go of it while it ran — the program was closed
 *   cancelled  someone let go of it before it started
 *   idle       the program sat idle for `idleMinutes` and was closed
 *   failed     it could not be started (the error says why)
 *   lost       its Session is gone, or has no live program after a restart
 */
export type EndReason = "exited" | "released" | "cancelled" | "idle" | "failed" | "lost";

export interface Run {
  /** Per organization, from 1. */
  id: number;
  /** The employee the run is for: the Claude Code Session is this Agent's. */
  agentId: string;
  /** Who queued it (`agent:<id>` or `user:<id>`). */
  by: string;
  /** The person whose request it was (the token's user for an employee): the terminal's owner. */
  ownerUserId: string;
  prompt: string;
  title: string | null;
  workspace: string;
  status: RunStatus;
  queuedAt: string;
  startedAt?: string;
  endedAt?: string;
  /** The Claude Code Session, once started. */
  sessionId?: string;
  /** Since when the program has been idle, while it runs; absent while it works. */
  idleSince?: string;
  end?: EndReason;
  /** Who released or cancelled it. */
  endedBy?: string;
  /** Why it could not be started. */
  error?: string;
  /**
   * A RESUME run: the Claude Code session it continues (`claude --resume <id>`, no first
   * prompt — `prompt` is empty). One Claude Code session is never held by two runs.
   */
  claudeSessionId?: string;
  /**
   * The idle reclaim passes this run by: it is a long-lived conversation that sits idle between
   * the events it waits for. It still holds its slot; the capacity is what bounds such runs.
   * Resume runs set it.
   */
  keepIdle?: boolean;
}

/** A run as the routes answer it: the record, plus its place in line or what its program is doing. */
export interface RunView extends Run {
  /** 1-based place in the server-wide line, while queued. */
  position?: number;
  /** While running: whether the program is working on a turn or waiting for input. */
  activity?: "working" | "idle";
  /** The last lines of its screen, when asked for (`?screen=N`) and the program lives. */
  screen?: string[];
}

export interface QueueConfig {
  /** How many runs may hold a slot at once, across every organization. */
  capacity: number;
  /** Minutes of continuous idleness after which a running program is closed; 0 never closes one. */
  idleMinutes: number;
}

/** A refusal the routes turn into an HTTP answer. */
export class QueueError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** The Session row fields the queue reads. */
export interface RowLike {
  sessionId: string;
  workspace: string;
  surface?: string | null;
}

/** One organization's runs file. */
export interface RunsFile {
  next: number;
  runs: Run[];
}

export function runsPath(root: string, projectId: string, orgId: string): string {
  return path.join(root, projectId, "organizations", orgId, RUNS_FILE);
}

/** A file's content as runs; anything unreadable is an empty file, never a crash. */
export function parseRunsFile(text: string): RunsFile {
  try {
    const parsed = JSON.parse(text) as Partial<RunsFile>;
    const runs = Array.isArray(parsed.runs)
      ? parsed.runs.filter(
          (r): r is Run =>
            typeof r === "object" &&
            r !== null &&
            typeof (r as Run).id === "number" &&
            typeof (r as Run).agentId === "string",
        )
      : [];
    const highest = runs.reduce((m, r) => Math.max(m, r.id), 0);
    const next =
      typeof parsed.next === "number" && parsed.next > highest ? parsed.next : highest + 1;
    return { next, runs };
  } catch {
    return { next: 1, runs: [] };
  }
}
