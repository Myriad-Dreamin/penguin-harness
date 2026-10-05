/**
 * The open link's JSON form, for the web app's dialog: the same request as the link
 * (resume.ts), asked with `Accept: application/json`, answers where the session stands instead of
 * redirecting to a page — so the app can attach the session's terminal in place, wait in line
 * with the reader, or say which terminal holds it.
 *
 *   { state: "running",   sessionId, runId, projectId, orgId, machine? }
 *   { state: "queued",    runId, position?, projectId, orgId, machine? }
 *   { state: "elsewhere", where: { pid, tty, tmux, cwd } }
 *
 * `projectId` / `orgId` name the run's organization, which may differ from the one asked (one
 * session is one program, whichever organization started it), so the dialog polls the right run.
 * `machine` echoes the `machine=` the link carried, the machine the chat calls must address.
 * A refusal answers `{ error: { code, message } }` with its status, like the queue's routes; a
 * run that ended before it ever ran is one (`run_ended`).
 *
 * Without that header the link behaves as it always has: a redirect or a page, since a link
 * opened outside the app lands in a browser tab.
 */
import type { Context } from "hono";
import type { LiveSession } from "./resume.js";
import type { RunView } from "./runs.js";
import { QueueError } from "./runs.js";

/** Where a session held outside the queue runs: the process, its terminal, its tmux pane. */
export type OpenWhere = LiveSession;

export type OpenAnswer =
  | {
      state: "running";
      sessionId: string;
      runId: number;
      projectId: string;
      orgId: string;
      machine?: string;
    }
  | {
      state: "queued";
      runId: number;
      position?: number;
      projectId: string;
      orgId: string;
      machine?: string;
    }
  | { state: "elsewhere"; where: OpenWhere };

/** Whether the request asks for the JSON form: an explicit `application/json` in `Accept`. */
export function wantsJson(c: Context): boolean {
  return (c.req.header("accept") ?? "").toLowerCase().includes("application/json");
}

/**
 * A run as the JSON form tells it. A run still starting (running, no Session yet) is in line
 * as far as the reader is concerned: there is no terminal to attach yet.
 */
export function runAnswer(
  result: { projectId: string; orgId: string; run: RunView },
  machine: string | undefined,
): OpenAnswer {
  const { run, projectId, orgId } = result;
  const where = { projectId, orgId, ...(machine ? { machine } : {}) };
  if (run.status === "running" && run.sessionId !== undefined) {
    return { state: "running", sessionId: run.sessionId, runId: run.id, ...where };
  }
  if (run.status === "ended") {
    throw new QueueError(
      409,
      "run_ended",
      run.error ?? `Run #${run.id} ended before its session started (${run.end ?? "unknown"}).`,
    );
  }
  return {
    state: "queued",
    runId: run.id,
    ...(run.position !== undefined ? { position: run.position } : {}),
    ...where,
  };
}
