/**
 * Session completion for the command palette: typing the start of a session id (`session-…`)
 * offers that session — its title beside its status word and id, Enter jumps to its chat page. The rows
 * are the sidebar's own (the session store the sidebar pages into), so a completion names what
 * the app already holds and nothing is fetched for it.
 *
 * Pure core plus a hook: `sessionCompletionActions` builds the actions from rows the caller
 * passes (the hook reads the store; the tests pass literals), and `useSessionCompletion` is the
 * completion a mount inside the providers publishes for the palette. The palette calls it with
 * the raw query on every keystroke; it answers nothing at all until the query's first token
 * starts a session id.
 *
 * The palette itself is mounted at the App root, outside the providers, because the pages
 * outside the shell share it (the terminal, a workflow's full-page app, the login screen). So a
 * mount that has the sessions — the layout — publishes its completion here for the palette to
 * read, the same in-memory publication lib/terminal-machines.ts uses: rebuilt by the mount that
 * owns it, absent while nothing is mounted. Reading the store at the root instead threw
 * `useSessions must be used within a SessionsProvider` and took the whole App down through the
 * error boundary (2026-10-28).
 */
import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import type { PaletteAction } from "@prismshadow/penguin-ui";
import type { SessionInfo, SessionStatus } from "@prismshadow/penguin-server/api";
import { S } from "../../lib/strings";
import { isSidebarRow } from "../../lib/session-grouping";
import { useSessions } from "../../state/sessions";

/** Every session id starts with this; the completion's trigger token starts with it too. */
export const SESSION_ID_PREFIX = "session-";

/** How many sessions one completion may offer: the palette is a picker, not a list page. */
export const SESSION_COMPLETION_MAX = 20;

/** The query's session-id prefix, or null when the query does not start one. */
export function sessionQueryPrefix(query: string): string | null {
  const first = query.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return first.startsWith(SESSION_ID_PREFIX) ? first : null;
}

/** The status's word for a completion row (the sidebar's glyph carries no text of its own). */
export function sessionStatusWord(status: SessionStatus): string {
  if (status === "running") return S.chat.statusRunning;
  if (status === "compacting") return S.chat.statusCompacting;
  return S.chat.statusIdle;
}

/**
 * How much of a session id one completion's detail keeps: the id rides beside the status word
 * as the row's secondary text, and ids past this length end with an ellipsis so the title —
 * the row's main text — keeps its room.
 */
export const SESSION_DETAIL_ID_MAX = 44;

/** A session id trimmed to {@link SESSION_DETAIL_ID_MAX} characters, the tail ellipsed. */
export function sessionDetailId(sessionId: string): string {
  return sessionId.length > SESSION_DETAIL_ID_MAX
    ? `${sessionId.slice(0, SESSION_DETAIL_ID_MAX)}…`
    : sessionId;
}

/** The row's secondary text: the status's word beside the session's id. */
export function sessionDetail(status: SessionStatus, sessionId: string): string {
  return `${sessionStatusWord(status)} · ${sessionDetailId(sessionId)}`;
}

/**
 * The sessions whose id starts the query, most recently active first, as palette actions: the
 * title (the sidebar's untitled fallback), the status word beside it, and a jump to the chat
 * page on run. Rows the sidebar does not draw are never offered — a completion lands somewhere
 * the sidebar itself could have taken the user. The row's secondary text carries the status
 * word beside the session's id.
 */
export function sessionCompletionActions(
  sessions: readonly SessionInfo[],
  query: string,
  navigate: (path: string) => void,
): readonly PaletteAction[] {
  const prefix = sessionQueryPrefix(query);
  if (prefix === null) return [];
  const matches = sessions.filter(
    (s) => isSidebarRow(s) && s.sessionId.toLowerCase().startsWith(prefix),
  );
  return matches.slice(0, SESSION_COMPLETION_MAX).map((s) => ({
    id: `session:${s.sessionId}`,
    label: s.title ?? S.chat.defaultSessionTitle,
    keywords: [s.sessionId],
    detail: sessionDetail(s.status, s.sessionId),
    run: () => navigate(`/chat/${encodeURIComponent(s.sessionId)}`),
  }));
}

/** The completion as the palette takes it: the store's rows and the router's navigate, memoized. */
export function useSessionCompletion(): (query: string) => readonly PaletteAction[] {
  const { sessions } = useSessions();
  const navigate = useNavigate();
  const goTo = useCallback((path: string) => void navigate(path), [navigate]);
  return useMemo(
    () => (query: string) => sessionCompletionActions(sessions, query, goTo),
    [sessions, goTo],
  );
}

/** The completion the mounted shell publishes for the palette; null while nothing publishes. */
let published: ((query: string) => readonly PaletteAction[]) | null = null;

/**
 * Publishes this mount's completion for the palette while it is mounted — call it inside
 * `SessionsProvider` (the layout), never at the App root, which is outside every provider.
 */
export function usePublishedSessionCompletion(): void {
  const completion = useSessionCompletion();
  useEffect(() => {
    published = completion;
    return () => {
      // A newer mount's publication is not ours to clear.
      if (published === completion) published = null;
    };
  }, [completion]);
}

/**
 * The palette's `suggest`: whatever the mounted shell published, or nothing while no mount
 * holds the sessions (the login screen, the terminal, a workflow's full-page app) — a palette
 * with its standing actions alone, which is what those pages had before completions existed.
 */
export function paletteSessionCompletion(query: string): readonly PaletteAction[] {
  return published === null ? [] : published(query);
}
