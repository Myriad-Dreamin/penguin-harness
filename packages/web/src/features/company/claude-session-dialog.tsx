/**
 * A Claude Code session in a dialog: what Open session beside a roadmap's title and a channel
 * message's session link open inside the app, instead of carrying the reader to another page.
 *
 * The window is the Settings dialog's shell — the same `Modal`, headerless and bare, at the
 * same width and height, with the pane heading and close cross where PagedDialog draws them —
 * without the rail, since there is one page. Inside, the session's terminal is the very view the
 * chat page draws for a surface Session (`SessionSurfaceView`), so typing into it types into the
 * employee's program. While the run waits for a slot the dialog says its place in line and
 * attaches by itself once it starts; a session held by a terminal outside the queue is explained
 * — process, terminal, tmux pane — rather than started twice (claude-session-open.ts follows).
 *
 * Closing never ends the session: it stops following the link and nothing else. Escape closes
 * from anywhere but the terminal itself, where Escape is the program's (Claude Code interrupts
 * a turn with it) and xterm keeps it from reaching the dialog.
 */
import { useEffect, useState } from "react";
import {
  CloseButton,
  ICON_GAP,
  KeyValue,
  KeyValueRow,
  Modal,
  Notice,
  Spinner,
} from "@prismshadow/penguin-ui";
import { S } from "../../lib/strings";
import { SessionSurfaceView } from "../chat/session-surface-view";
import {
  closeClaudeSession,
  followOpen,
  registerClaudeSessionHost,
  useClaudeSessionPath,
} from "./claude-session-open";
import type { OpenView } from "./claude-session-open";

/**
 * The one mount of the dialog, beside the organization's routed page (org-layout.tsx). Its
 * presence is what lets a session link open in place: with no host mounted, a click navigates.
 */
export function ClaudeSessionDialogHost() {
  useEffect(() => registerClaudeSessionHost(), []);
  const path = useClaudeSessionPath();
  if (path === null) return null;
  return <ClaudeSessionDialog key={path} path={path} onClose={closeClaudeSession} />;
}

function ClaudeSessionDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const [view, setView] = useState<OpenView>({ kind: "loading" });
  // Bumped by Try again: the link is asked anew.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const following = new AbortController();
    setView({ kind: "loading" });
    void followOpen(path, setView, following.signal);
    return () => following.abort();
  }, [path, attempt]);
  const title = S.company.roadmaps.sessionDialog.title;
  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      headerless
      bare
      widthClass="sm:max-w-[min(96vw,88rem)]"
    >
      <div className="flex h-[90vh] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 sm:px-6 sm:pt-5">
          <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>
          <CloseButton onClose={onClose} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
          <ClaudeSessionBody view={view} onRetry={() => setAttempt((n) => n + 1)} />
        </div>
      </div>
    </Modal>
  );
}

/** The dialog's content for one view of the link (exported for tests). */
export function ClaudeSessionBody({ view, onRetry }: { view: OpenView; onRetry: () => void }) {
  const T = S.company.roadmaps.sessionDialog;
  switch (view.kind) {
    case "loading":
      return (
        <p className={`flex items-center ${ICON_GAP.menu} text-sm text-fg-muted`}>
          <Spinner size="sm" label={T.opening} />
          <span aria-hidden="true">{T.opening}</span>
        </p>
      );
    case "queued":
      return (
        <p className={`flex items-center ${ICON_GAP.menu} text-sm text-fg-muted`}>
          <Spinner size="sm" label={T.queued(view.position)} />
          <span aria-hidden="true">{T.queued(view.position)}</span>
        </p>
      );
    case "running":
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-line">
          <SessionSurfaceView session={view.session} fontSize={15} />
        </div>
      );
    case "elsewhere": {
      const { where } = view;
      return (
        <div className="flex flex-col gap-3">
          <Notice tone="attention" role="status">
            {T.elsewhere} {T.elsewhereHint}
          </Notice>
          <KeyValue size="sm">
            <KeyValueRow label={T.process} mono>
              {where.pid}
            </KeyValueRow>
            {where.tty !== null && (
              <KeyValueRow label={T.terminal} mono>
                {where.tty}
              </KeyValueRow>
            )}
            {where.tmux !== null && (
              <KeyValueRow label={T.tmuxPane} mono>
                {`${where.tmux.pane} (${where.tmux.socket})`}
              </KeyValueRow>
            )}
            {where.cwd !== null && (
              <KeyValueRow label={T.directory} mono>
                {where.cwd}
              </KeyValueRow>
            )}
          </KeyValue>
        </div>
      );
    }
    case "ended":
      return (
        <Notice tone="danger" role="alert" retry={{ label: T.retry, onClick: onRetry }}>
          {view.reason === null ? T.ended : `${T.ended} ${view.reason}`}
        </Notice>
      );
    case "failed":
      return (
        <Notice tone="danger" role="alert" retry={{ label: T.retry, onClick: onRetry }}>
          {`${T.failed}: ${view.message}`}
        </Notice>
      );
  }
}
