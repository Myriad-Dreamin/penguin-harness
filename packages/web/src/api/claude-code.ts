/**
 * The claude-code plugin's organization routes (its queue-routes.ts), one wrapper per route the
 * web app calls. They exist only while that plugin is installed; without it every call is a 404.
 */
import { apiFetch } from "./client";
import { orgBase } from "./endpoints";

const base = (projectId: string, orgId: string) => `${orgBase(projectId, orgId)}/claude-code`;

/**
 * One run of the queue (the plugin's RunView). `position` is the place in the server-wide
 * line, so a run of this organization may be number 3 behind two runs of another.
 */
export interface OrgClaudeRun {
  id: number;
  status: "queued" | "running" | "ended";
  /** The employee the run is for. */
  agentId: string;
  /** Who queued it: `agent:<id>` or `user:<id>`. */
  by: string;
  /** The first prompt; empty for a resume run a person opened. */
  prompt: string;
  /** Its Session, once its program started. */
  sessionId?: string;
  /** A resume run: the Claude Code session it continues. */
  claudeSessionId?: string;
  /** While queued: its place in the server's line, from 1. */
  position?: number;
  /** While running: whether the program works on a turn or waits for input. */
  activity?: "working" | "idle";
  /** While running and idle: since when (ISO time). */
  idleSince?: string;
  startedAt?: string;
  /** Why it ended, when it failed. */
  error?: string;
}

/**
 * The organization's runs (newest first) and the server's slots. `capacity`, `running` and
 * `queued` count every organization on this server: the slots are shared, so what this
 * organization holds is its own runs and the rest is held by others.
 */
export interface OrgClaudeRuns {
  runs: OrgClaudeRun[];
  capacity: number;
  idleMinutes: number;
  running: number;
  queued: number;
}

/**
 * The organization's runs. `active` asks for the queued and running ones only: the ended runs
 * the route otherwise returns (up to a hundred, each with its prompt) are most of its bytes, and
 * an organization on another machine pays for every byte over a thin link.
 */
export const listOrgClaudeRuns = (projectId: string, orgId: string, active = false) =>
  apiFetch<OrgClaudeRuns>(`${base(projectId, orgId)}/runs`, active ? { query: { active: 1 } } : {});

/**
 * One run. `machine` names the server that holds it when the caller learned it from a link;
 * omitted, the organization's path routes itself.
 */
export const getOrgClaudeRun = (
  projectId: string,
  orgId: string,
  runId: number,
  machine: string | null = null,
) =>
  apiFetch<OrgClaudeRun>(
    `${base(projectId, orgId)}/runs/${runId}`,
    machine === null ? {} : { server: machine },
  );

/** Lets go of a run: a queued one is cancelled, a running one's program is closed. */
export const releaseOrgClaudeRun = (projectId: string, orgId: string, runId: number) =>
  apiFetch<OrgClaudeRun>(`${base(projectId, orgId)}/runs/${runId}/release`, {
    method: "POST",
    body: {},
  });

/**
 * The roadmaps whose Claude Code session the organization's mapping names: the session and the
 * employee each is continued as.
 */
export const listOrgClaudeSessions = (projectId: string, orgId: string) =>
  apiFetch<{ roadmaps: Array<{ roadmap: number; sessionId: string; agentId: string }> }>(
    `${base(projectId, orgId)}/sessions`,
  );
