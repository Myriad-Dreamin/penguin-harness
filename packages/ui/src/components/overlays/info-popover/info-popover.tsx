/**
 * Circled "?" that discloses an explanation on demand.
 *
 * Explanatory prose falls into two kinds, and only one of them belongs here. **Semantics** —
 * what a section is, what a field means, what it affects, when a change takes effect — is read
 * once and then never again, so leaving it on screen costs every later visit a paragraph of
 * scrolling. It goes behind this trigger. **Formatting** — "one KEY=value per line", "leave
 * empty for unlimited" — is read *while typing*, so hiding it converts a glance into a click
 * and raises the error rate. That stays visible, in the field's own hint.
 *
 * The panel is portaled to document.body and positioned against viewport coordinates by
 * usePortalPanel, so no ancestor's overflow can clip it (a modal body, a horizontally scrolling
 * table) and it closes on outside click / Esc / a scroll that moves the trigger / resize. Esc
 * there is captured and its propagation stopped, which is what lets one Esc dismiss this
 * popover while an enclosing Modal stays open. z-[60] for the same reason OptionMenu uses it:
 * a portaled node sits in the root stacking context and must clear the modal overlay's z-50.
 *
 * The trigger's accessible name is the interface's "More info" (`UiStrings.moreInfo`), with the
 * subject folded in when the caller names one (`UiStrings.moreInfoAbout`).
 *
 * It opens on hover (after a short delay, so a pointer passing over does not flash it) and on
 * keyboard focus, and closes when both leave — with a grace period on the pointer, so it can
 * travel from the "?" into the panel. A click or tap still toggles it, for touch, where there is
 * no hover; a click that lands right after the hover or focus that opened it keeps it open.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ICON_SIZE } from "../../../icon-scale";
import { useUiStrings } from "../../../strings";
import { GlyphIcon } from "../../icons/glyph-icon/glyph-icon";
import { ICONS } from "../../icons/icons";
import { usePortalPanel } from "../portal-panel/use-portal-panel";

const PANEL_WIDTH = 288; // w-72, the OptionMenu panel width

/** How long a pointer rests on the "?" before it opens, and how long it may be away before it closes. */
const OPEN_DELAY_MS = 100;
const CLOSE_GRACE_MS = 150;
/** A click this soon after a hover or focus opened the panel is the same gesture, not a toggle. */
const SAME_GESTURE_MS = 400;

export function InfoPopover({
  children,
  label,
  size = ICON_SIZE.inlineGlyph,
  className = "",
}: {
  /** The explanation. Plain text in almost every case; nodes are allowed for the rare inline code. */
  children: ReactNode;
  /**
   * What this explains — the section title or the field label it sits beside. It is folded into
   * the trigger's accessible name ("More info: Vault") rather than used verbatim, so a trigger
   * inside a heading never makes that heading announce its own title twice. Omit it and the
   * trigger falls back to a bare "More info".
   */
  label?: string;
  size?: number;
  className?: string;
}) {
  const strings = useUiStrings();
  const [open, setOpenState] = useState(false);
  const panelId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedAt = useRef(0);
  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const setOpen = (next: boolean | ((v: boolean) => boolean)) => {
    clear();
    setOpenState((v) => {
      const value = typeof next === "function" ? next(v) : next;
      if (value && !v) openedAt.current = Date.now();
      return value;
    });
  };
  const later = (next: boolean, ms: number) => {
    clear();
    timer.current = setTimeout(() => {
      timer.current = null;
      setOpen(next);
    }, ms);
  };
  useEffect(() => clear, []);
  // Hover is for a mouse or pen; a touch's synthetic enter would open it before the tap toggles.
  const hovering = (e: { pointerType: string }) => e.pointerType !== "touch";
  const { triggerRef, panelRef, position } = usePortalPanel({
    open,
    onClose: () => setOpen(false),
    // Panel geometry: a fixed 288px column whose height is two to six lines of text.
    estimatedHeight: 160,
    panelWidth: PANEL_WIDTH,
  });
  const name = label !== undefined ? strings.moreInfoAbout(label) : strings.moreInfo;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={name}
        aria-expanded={open}
        aria-controls={panelId}
        // While open the panel is also the trigger's description, so a screen reader reads the
        // explanation on focus rather than only announcing that something expanded.
        aria-describedby={open ? panelId : undefined}
        onClick={() => {
          if (open && Date.now() - openedAt.current < SAME_GESTURE_MS) return;
          setOpen((v) => !v);
        }}
        onPointerEnter={(e) => {
          if (hovering(e)) later(true, open ? 0 : OPEN_DELAY_MS);
        }}
        onPointerLeave={(e) => {
          if (hovering(e)) later(false, CLOSE_GRACE_MS);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`inline-flex shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors duration-150 hover:text-fg-muted ${className}`}
      >
        <GlyphIcon d={ICONS.helpCircle} size={size} />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="tooltip"
            onPointerEnter={clear}
            onPointerLeave={(e) => {
              if (hovering(e)) later(false, CLOSE_GRACE_MS);
            }}
            style={{
              position: "fixed",
              top: position.topPx,
              bottom: position.bottomPx,
              left: position.left,
            }}
            className="ui-glass anim-pop z-[60] max-h-[70vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-line bg-overlay px-3 py-2 text-xs leading-relaxed text-fg-muted shadow-lg"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
