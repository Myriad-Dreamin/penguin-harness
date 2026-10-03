import { useState } from "react";
import { Dropdown, ICONS, Menu, MenuItem } from "@prismshadow/penguin-ui";
import { S } from "../../lib/strings";

/** The workspace group's overflow-menu trigger: three FILLED dots (the stroke version read too faint at this size). */
function EllipsisGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

/**
 * A workspace group's overflow (… to the right of the header's "+"): the entries other modules
 * contribute (rowActions: 打开文件浏览), then — for a registry-backed group — 重命名工作区 /
 * 删除工作区, as small Menu rows like the session row's menu. Sits among the header's action buttons — outside the header's collapse toggle, so
 * opening it never expands/collapses the group. Body-portaled like every menu inside the
 * scroller.
 */
export function GroupOverflowMenu({
  entries,
  onRename,
  onDelete,
}: {
  /** The contributed entries, first: label, glyph (path data) and what choosing one does. */
  entries: ReadonlyArray<{ id: string; label: string; glyph: string; onSelect: () => void }>;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  /** Close first, then act (the rename modal opens on top; the delete is immediate). */
  const item = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <Dropdown
      open={open}
      setOpen={setOpen}
      portal={{ direction: "down", align: "right" }}
      menuClass="w-max min-w-32"
      className="shrink-0"
      button={
        /* No hover pill on this trigger (user: color, not background, should carry the
           hover hint) — feedback is the glyph deepening in light / brightening in dark,
           the session-row ellipsis treatment. Geometry: the same h-7 w-7 square as the
           sibling "+" and the LAST action in the header, flush at GroupHeader's px-1
           inset — which equals the session rows' pr-1, so with the row trigger's 16px
           glyph the dot columns line up with the rows' trailing slot below. */
        <button
          type="button"
          data-tooltip={S.chat.workspaceMenu}
          aria-label={S.chat.workspaceMenu}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex h-7 w-7 shrink-0 items-center justify-center text-gray-500 transition-colors duration-150 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
        >
          <EllipsisGlyph size={16} />
        </button>
      }
    >
      <Menu density="sm">
        {entries.map((entry) => (
          <MenuItem
            key={entry.id}
            glyph={entry.glyph}
            label={entry.label}
            onSelect={item(entry.onSelect)}
          />
        ))}
        {onRename !== undefined && (
          <MenuItem glyph={ICONS.pencil} label={S.chat.renameWorkspace} onSelect={item(onRename)} />
        )}
        {onDelete !== undefined && (
          <MenuItem
            glyph={ICONS.trash}
            label={S.chat.deleteWorkspace}
            danger
            onSelect={item(onDelete)}
          />
        )}
      </Menu>
    </Dropdown>
  );
}
