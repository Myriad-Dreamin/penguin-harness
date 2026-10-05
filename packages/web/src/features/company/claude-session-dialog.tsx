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
 * The window resizes from its right and bottom edges. It stays centred, so an edge follows the
 * pointer's distance from the middle of the screen and the opposite edge moves with it; the size
 * is remembered for this browser and a double click on either edge goes back to the default.
 *
 * Closing never ends the session: it stops following the link and nothing else. Escape closes
 * from anywhere but the terminal itself, where Escape is the program's (Claude Code interrupts
 * a turn with it) and xterm keeps it from reaching the dialog.
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  CloseButton,
  ICON_GAP,
  KeyValue,
  KeyValueRow,
  Modal,
  Notice,
  ResizeHandle,
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

/** Where the dragged size is kept: per browser, since it fits this display (install-scope.ts). */
const SIZE_KEY = "penguin.claudeSessionDialog.size";
const MIN_WIDTH = 480;
const MIN_HEIGHT = 320;
/** The scrim's padding around the panel (`sm:p-4` on each side): the panel never grows into it. */
const VIEWPORT_MARGIN = 32;

interface DialogSize {
  width: number;
  height: number;
}

function clampSize(size: DialogSize): DialogSize {
  const clamp = (value: number, min: number, max: number) =>
    Math.round(Math.max(min, Math.min(value, Math.max(min, max))));
  return {
    width: clamp(size.width, MIN_WIDTH, window.innerWidth - VIEWPORT_MARGIN),
    height: clamp(size.height, MIN_HEIGHT, window.innerHeight - VIEWPORT_MARGIN),
  };
}

function readSize(): DialogSize | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SIZE_KEY) ?? "null");
    if (typeof raw !== "object" || raw === null) return null;
    const { width, height } = raw as Record<string, unknown>;
    if (typeof width !== "number" || typeof height !== "number") return null;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return clampSize({ width, height });
  } catch {
    return null;
  }
}

function writeSize(size: DialogSize | null): void {
  try {
    if (size === null) localStorage.removeItem(SIZE_KEY);
    else localStorage.setItem(SIZE_KEY, JSON.stringify(size));
  } catch {
    // Storage blocked (private window, cleared site data): the size lasts for this dialog only.
  }
}

function ClaudeSessionDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const [view, setView] = useState<OpenView>({ kind: "loading" });
  // Bumped by Try again: the link is asked anew.
  const [attempt, setAttempt] = useState(0);
  // null: the default size, which follows the viewport.
  const [size, setSize] = useState<DialogSize | null>(readSize);
  // The size a drag ends on, read when it is committed.
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);
  useEffect(() => {
    const following = new AbortController();
    setView({ kind: "loading" });
    void followOpen(path, setView, following.signal);
    return () => following.abort();
  }, [path, attempt]);
  const T = S.company.roadmaps.sessionDialog;
  const title = T.title;
  // The panel is centred, so an edge sits as far from the middle as half the size.
  const resizeTo = (axis: "x" | "y", event: PointerEvent) => {
    setSize((current) => {
      const panel = current ?? measureDefault();
      return clampSize(
        axis === "x"
          ? { ...panel, width: 2 * Math.abs(event.clientX - window.innerWidth / 2) }
          : { ...panel, height: 2 * Math.abs(event.clientY - window.innerHeight / 2) },
      );
    });
  };
  const commit = (committed: boolean) => {
    if (committed) writeSize(sizeRef.current);
  };
  const reset = () => {
    writeSize(null);
    setSize(null);
  };
  const style =
    size === null
      ? undefined
      : ({ "--csd-w": `${size.width}px`, "--csd-h": `${size.height}px` } as CSSProperties);
  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      headerless
      bare
      widthClass="sm:w-auto sm:max-w-[calc(100vw-2rem)]"
    >
      <div
        data-testid="claude-session-dialog-frame"
        style={style}
        className="relative flex h-[90vh] flex-col sm:h-[var(--csd-h,90vh)] sm:w-[var(--csd-w,min(96vw,88rem))]"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 sm:px-6 sm:pt-5">
          <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>
          <CloseButton onClose={onClose} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
          <ClaudeSessionBody view={view} onRetry={() => setAttempt((n) => n + 1)} />
        </div>
        <ResizeHandle
          axis="x"
          edge="end"
          label={T.resizeWidth}
          className="hidden sm:block"
          onResize={(event) => resizeTo("x", event)}
          onResizeEnd={commit}
          onReset={reset}
        />
        <ResizeHandle
          axis="y"
          edge="end"
          label={T.resizeHeight}
          className="hidden sm:block"
          onResize={(event) => resizeTo("y", event)}
          onResizeEnd={commit}
          onReset={reset}
        />
      </div>
    </Modal>
  );
}

/** The default size as drawn, so the first drag starts from what is on screen. */
function measureDefault(): DialogSize {
  const frame = document.querySelector<HTMLElement>('[data-testid="claude-session-dialog-frame"]');
  const rect = frame?.getBoundingClientRect();
  return rect === undefined
    ? { width: window.innerWidth * 0.96, height: window.innerHeight * 0.9 }
    : { width: rect.width, height: rect.height };
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
        // Square corners: a rounded clip would cut the glyphs in the terminal's corner cells.
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-line">
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
