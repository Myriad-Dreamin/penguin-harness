import { ICONS, ICON_SIZE } from "@prismshadow/penguin-ui";
import { S } from "../../lib/strings";
import { Icon } from "../../components/ui/group-list";

/**
 * Group-header pin toggle, shared by both grouping modes: revealed on header hover (or
 * keyboard focus) while unpinned; once pinned it stays visible, doubling as the subtle
 * pinned indicator. The header row carries the `group/header` scope so the reveal only
 * reacts to its own row, not to the session rows' plain `group` scope.
 * The accessible name stays STATIC and aria-pressed alone carries the state (the toggle
 * pattern the grouping-mode buttons use) — a name that swaps Pin/Unpin alongside
 * aria-pressed reads as "Unpin group, pressed", saying the state twice in conflicting
 * ways. The title tooltip may still swap: it is presentation for pointer users and does
 * not feed the accessible name while aria-label is present.
 */
export function GroupPinButton({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      data-tooltip={pinned ? S.nav.unpinGroup : S.nav.pinGroup}
      aria-label={S.nav.pinGroup}
      aria-pressed={pinned}
      onClick={onToggle}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-[opacity,background-color,color] duration-150 hover:bg-fg/7 hover:text-fg ${
        pinned
          ? "text-fg-muted"
          : "text-fg-subtle opacity-0 focus-visible:opacity-100 group-hover/header:opacity-100"
      }`}
    >
      <Icon d={ICONS.pin} size={ICON_SIZE.groupHeaderAction} />
    </button>
  );
}
