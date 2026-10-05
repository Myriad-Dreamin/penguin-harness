/**
 * Opening a Claude Code session in place: which links do it, what the dialog follows, and the
 * one piece of shell state that says which link is open.
 *
 * The claude-code plugin's open link (`/api/claude-code/open/<id>?…` or `…/open?roadmap=<n>&…`,
 * possibly behind `/server/<machine>`) redirects a browser tab to the session's page. Inside
 * the app the same link is asked for its JSON form instead (`Accept: application/json`), which
 * says where the session stands — running with a Session, queued for a slot, or held by a
 * terminal outside the queue — so a dialog can show it without leaving the page the reader is
 * on. A modified click (new tab, new window) is left to the browser and lands on the page form.
 *
 * Closing the dialog only stops following: nothing here releases a run or closes a surface,
 * because the session is the employee's long-lived conversation, not the dialog's.
 */
import { useSyncExternalStore } from "react";
import type { MouseEvent } from "react";
import { ApiError } from "../../api/client";
import * as api from "../../api/endpoints";
import type { OrgClaudeRun } from "../../api/endpoints";
import type { SessionInfo } from "@prismshadow/penguin-server/api";
import { apiErrorText } from "../../lib/api-error";
import { rememberLinkedMachine } from "../../lib/session-machines";

/** Where a session held outside the queue runs, as the plugin reads it from this machine. */
export interface OpenWhere {
  pid: number;
  cwd: string | null;
  tty: string | null;
  tmux: { socket: string; pane: string } | null;
}

/** The open link's JSON form (the plugin's open-answer.ts). */
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

/** What the dialog shows, one step of following a link. */
export type OpenView =
  | { kind: "loading" }
  | { kind: "running"; session: SessionInfo }
  | { kind: "queued"; position: number | null }
  | { kind: "elsewhere"; where: OpenWhere }
  | { kind: "ended"; reason: string | null }
  | { kind: "failed"; message: string };

/** How often a queued run is asked whether it has started. */
export const OPEN_POLL_MS = 2_000;

/** This window's origin; the node test suite has no window and reads links as this server's. */
const here = (): string =>
  typeof window === "undefined" ? "http://localhost" : window.location.origin;

const OPEN_PATH = /^(?:\/server\/([^/?#]+))?\/api\/claude-code\/open(?:\/[^/?#]+)?\/?$/;

/**
 * The app-relative form of an open link, or null for any other href. A full URL counts only
 * on this window's origin: a link to another server's copy of the route is that server's page.
 */
export function claudeSessionPath(href: string | undefined, origin: string): string | null {
  if (href === undefined || href === "") return null;
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || !OPEN_PATH.test(url.pathname)) return null;
  return `${url.pathname}${url.search}`;
}

/** The machine an open link is asked through (`/server/<machine>/…`), or null for this server. */
export function machineOfOpenPath(path: string): string | null {
  const id = OPEN_PATH.exec(path.replace(/[?#].*$/, ""))?.[1];
  if (id === undefined) return null;
  try {
    return decodeURIComponent(id);
  } catch {
    return null;
  }
}

/** Asks an open link for its JSON form. A refusal throws with the server's own sentence. */
export async function askOpen(path: string): Promise<OpenAnswer> {
  const res = await fetch(path, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  const body = (await res.json().catch(() => null)) as
    OpenAnswer | { error?: { code?: string; message?: string } } | null;
  if (!res.ok || body === null || "error" in body) {
    const error = body !== null && "error" in body ? body.error : undefined;
    throw new ApiError(
      res.status,
      error?.code ?? "http_error",
      error?.message ?? `HTTP ${res.status}`,
    );
  }
  return body as OpenAnswer;
}

/** The calls following a link makes, injectable for tests. */
export interface OpenDeps {
  ask(path: string): Promise<OpenAnswer>;
  run(
    projectId: string,
    orgId: string,
    runId: number,
    machine: string | null,
  ): Promise<OrgClaudeRun>;
  /** The Session a run holds, recorded as living on `machine` so its terminal calls go there. */
  session(sessionId: string, machine: string | null): Promise<SessionInfo>;
  /** Resolves after `ms`, or as soon as `signal` aborts. */
  wait(ms: number, signal: AbortSignal): Promise<void>;
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });

export const OPEN_DEPS: OpenDeps = {
  ask: askOpen,
  run: (projectId, orgId, runId, machine) => api.getOrgClaudeRun(projectId, orgId, runId, machine),
  session: async (sessionId, machine) => {
    rememberLinkedMachine(sessionId, machine);
    return (await api.getSession(sessionId)).session;
  },
  wait,
};

/**
 * Follows one open link until there is nothing left to wait for: a running Session to attach,
 * a session held elsewhere, a run that ended, or a failure. A queued run is asked again every
 * {@link OPEN_POLL_MS} and the view moves to running the moment its Session exists. Aborting
 * `signal` (the dialog closing) stops it between steps and reports nothing further.
 */
export async function followOpen(
  path: string,
  onView: (view: OpenView) => void,
  signal: AbortSignal,
  deps: OpenDeps = OPEN_DEPS,
): Promise<void> {
  const report = (view: OpenView) => {
    if (!signal.aborted) onView(view);
  };
  try {
    const answer = await deps.ask(path);
    if (answer.state === "elsewhere") return report({ kind: "elsewhere", where: answer.where });
    const machine = answer.machine ?? machineOfOpenPath(path);
    const attach = async (sessionId: string) =>
      report({ kind: "running", session: await deps.session(sessionId, machine) });
    if (answer.state === "running") return await attach(answer.sessionId);
    report({ kind: "queued", position: answer.position ?? null });
    for (;;) {
      await deps.wait(OPEN_POLL_MS, signal);
      if (signal.aborted) return;
      const run = await deps.run(answer.projectId, answer.orgId, answer.runId, machine);
      if (run.status === "running" && run.sessionId !== undefined) {
        return await attach(run.sessionId);
      }
      if (run.status === "ended") return report({ kind: "ended", reason: run.error ?? null });
      report({ kind: "queued", position: run.position ?? null });
    }
  } catch (err) {
    report({ kind: "failed", message: apiErrorText(err) });
  }
}

// The open link, as shell state: one dialog for the whole app, opened from wherever a link was
// clicked. A module store rather than context, since the opener (a Markdown link adapter) is a
// module constant with no component to hold a provider's value.
let openPath: string | null = null;
let hosts = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Opens the dialog on an open link (its app-relative form). */
export function openClaudeSession(path: string): void {
  openPath = path;
  emit();
}

export function closeClaudeSession(): void {
  openPath = null;
  emit();
}

/** The link the dialog is open on, or null. */
export function useClaudeSessionPath(): string | null {
  // The app never renders on a server; the static renders of the test suite read the store too.
  const read = () => openPath;
  return useSyncExternalStore(subscribe, read, read);
}

/** Registers a mounted dialog host; the returned function unregisters it. */
export function registerClaudeSessionHost(): () => void {
  hosts += 1;
  return () => {
    hosts -= 1;
    if (hosts === 0) closeClaudeSession();
  };
}

/** A click the browser should handle itself: another button, or a modifier asking for a new tab or window. */
const browserOwns = (e: MouseEvent<HTMLAnchorElement>) =>
  e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

/**
 * The click handler for an open link: a plain click opens the dialog instead of navigating,
 * while a page with no dialog host, an href that is not an open link, and a modified click all
 * keep the browser's default.
 */
export function onClaudeSessionClick(e: MouseEvent<HTMLAnchorElement>, href: string): void {
  if (hosts === 0 || e.defaultPrevented || browserOwns(e)) return;
  const path = claudeSessionPath(href, here());
  if (path === null) return;
  e.preventDefault();
  openClaudeSession(path);
}

/** The link behaviour a channel message's Markdown gives an href: an open link opens the dialog, every link keeps a new tab for modified clicks. */
export function claudeSessionLinkBehavior(href: string | undefined): {
  target: "_blank";
  rel: "noreferrer";
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
} {
  const behavior = { target: "_blank" as const, rel: "noreferrer" as const };
  if (href === undefined || claudeSessionPath(href, here()) === null) {
    return behavior;
  }
  return { ...behavior, onClick: (e) => onClaudeSessionClick(e, href) };
}
