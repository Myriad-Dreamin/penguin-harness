import type { DragEvent as ReactDragEvent } from "react";
import type { SessionInfo } from "@prismshadow/penguin-server/api";
import { SessionRow, toastSuccess } from "@prismshadow/penguin-ui";
import { S } from "../../lib/strings";
import { sessionActivityLabel } from "../../lib/session-activity";
import type { SessionActivity } from "../../lib/session-activity";
import { writeClipboard } from "../../lib/clipboard";
import {
  HOVER_ROW_ACTIONS,
  contextMenuActions,
  sessionRowActions,
} from "../../components/ui/session-row-menu";
import type { SessionRowAction } from "../../components/ui/session-row-menu";
import { Truncated } from "../../components/ui/truncated";

/**
 * One conversation row: the package's `SessionRow`, bound to this Session. The row itself — the
 * title with its marks, the trailing slot that swaps the last-active time for archive and the
 * "more" button on hover or focus, and the context menu a right-click, Shift+F10 or a
 * press-and-hold opens — is the package's; this container says which actions each surface
 * carries (session-row-menu.tsx), what each one does, and in which words the marks name
 * themselves.
 *
 * The hover pair is the affordance every release up to v0.2.2 shipped (archive as a direct icon
 * button), the rest of the set one click further; the full set stays one right-click away.
 *
 * A truncated title scrolls its tail into view while the row is hovered or keyboard-focused
 * (#309; Truncated's scrollReveal, keyed on the row's `data-title-reveal`). No `title` tooltip
 * comes with it: it would sit over the very text scrolling past underneath. Under
 * prefers-reduced-motion nothing scrolls and the conditional hint returns instead.
 */
export function SidebarSessionRow({
  s,
  active,
  activity,
  background,
  scheduled,
  pinned,
  canPin = false,
  lastActive,
  locale,
  agentHint,
  draggable = false,
  dropEdge = null,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpen,
  onTogglePin,
  onRename,
  onMessaging,
  onDelete,
  onToggleArchive,
}: {
  s: SessionInfo;
  active: boolean;
  /** Busy / settled-read / settled-unread / never-ran, already resolved by sessionRowActivity. */
  activity: SessionActivity;
  /** Background tasks the Session still owns (sessionBackgroundTasks); 0 draws no mark. */
  background: number;
  /** A scheduled task still to fire is bound to this Session (pendingScheduleSessions); false draws no mark. */
  scheduled: boolean;
  /** Row is pinned (bubbled to its group's top; small pin glyph on the title). */
  pinned: boolean;
  /** Whether pinning can actually reorder this row — active-list rows only; folder rows hide the action (see renderRows). */
  canPin?: boolean;
  /** Preformatted compact last-active time ("" hides the slot's resting text). */
  lastActive: string;
  /** Interface language: decides the fixed width the time slot reserves (SessionRow's `timeSlot`). */
  locale: "zh" | "en";
  /** Agent display name; when set (workspace mode) a small avatar keeps the Agent context visible on the row. */
  agentHint?: string;
  /** Manual sort: the row can be drag-reordered (the sidebar wires the handlers below). */
  draggable?: boolean;
  /** Drop indicator edge while another row hovers over this one (a thin accent line above/below). */
  dropEdge?: "above" | "below" | null;
  onDragStart?: (e: ReactDragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: ReactDragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: ReactDragEvent) => void;
  onOpen: (s: SessionInfo) => void;
  onTogglePin: (s: SessionInfo) => void;
  onRename: (s: SessionInfo) => void;
  onMessaging: (s: SessionInfo) => void;
  onDelete: (s: SessionInfo) => void;
  onToggleArchive: (s: SessionInfo) => void;
}) {
  /** Run one action on this Session (the row has closed its menu first). */
  const run = (action: SessionRowAction) => {
    const handler: Record<SessionRowAction, (x: SessionInfo) => void> = {
      pin: onTogglePin,
      rename: onRename,
      // The copy affordance's feedback normally rides on the button itself (copy-button.tsx),
      // which a menu row cannot do: the row acts and the panel closes under it. A toast is
      // the confirmation that survives that, and it says the same word — once the write
      // has landed.
      copy: (x) => {
        void writeClipboard(x.sessionId).then((ok) => ok && toastSuccess(S.common.copied));
      },
      messaging: onMessaging,
      archive: onToggleArchive,
      delete: onDelete,
    };
    handler[action](s);
  };
  const rowState = { archived: s.archived, pinned };
  return (
    <SessionRow
      sessionId={s.sessionId}
      renderTitle={(className) => (
        <Truncated
          scrollReveal
          text={s.title ?? S.chat.defaultSessionTitle}
          className={className}
        />
      )}
      active={active}
      archived={s.archived}
      {...(agentHint !== undefined ? { agent: { id: s.agentId, name: agentHint } } : {})}
      // Four marks for the row's STANDING arrangements, all in one dim cluster: how the row is
      // filed (pinned — only where pinning reorders anything), where it can be reached from (the
      // messaging relay, named by its channel), whether it runs on its own (a scheduled task still
      // to fire; a paused or ended one draws nothing) and whether it owns work that outlives the
      // turn (background tasks, live via session_background).
      {...(pinned && canPin ? { pinnedLabel: S.chat.pinnedSession } : {})}
      {...(s.messagingChannel !== undefined
        ? { relayLabel: S.messaging.enabledIndicator[s.messagingChannel] }
        : {})}
      {...(scheduled ? { scheduledLabel: S.chat.sessionScheduled } : {})}
      background={{ count: background, label: S.chat.backgroundTasks(background) }}
      activity={
        activity === null ? null : { state: activity, label: sessionActivityLabel(activity) }
      }
      approvals={{
        count: s.pendingApprovalCount,
        label: S.chat.pendingApprovals(s.pendingApprovalCount),
      }}
      time={lastActive}
      // Sized for the widest compact time each language produces — 「12月31日」 and 「59 分钟前」 in
      // zh, "Nov 30" in en.
      timeSlot={locale === "zh" ? "wide" : "narrow"}
      hoverActions={sessionRowActions(HOVER_ROW_ACTIONS, rowState, run)}
      menuActions={sessionRowActions(contextMenuActions(canPin), rowState, run)}
      moreLabel={S.chat.moreActions}
      onOpen={() => onOpen(s)}
      draggable={draggable}
      dropEdge={dropEdge}
      {...(onDragStart ? { onDragStart } : {})}
      {...(onDragEnd ? { onDragEnd } : {})}
      {...(onDragOver ? { onDragOver } : {})}
      {...(onDragLeave ? { onDragLeave } : {})}
      {...(onDrop ? { onDrop } : {})}
    />
  );
}
