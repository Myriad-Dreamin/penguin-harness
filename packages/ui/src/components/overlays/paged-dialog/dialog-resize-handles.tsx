/**
 * The border handles of a resizable dialog: hit areas laid just outside its left, right and
 * bottom borders and its bottom-right corner, invisible until one holds keyboard focus. They sit
 * outside the box, in the overlay's padding, so they never cover the pane's scrollbar or the
 * close control, and the overlay's click-outside-to-close never sees a press that starts on one
 * (the handles are the dialog's descendants).
 *
 * Keyboard: the right and bottom handles are focusable separators reporting the size they set,
 * and the arrow keys step it. The left handle and the corner are pointer-only — the dialog stays
 * centred, so the left border does exactly what the right one does, and the corner is the two of
 * them at once; a second tab stop for either would add a stop and no reach.
 *
 * Must be rendered inside the positioned box the hook sizes.
 */
import { useUiStrings } from "../../../strings";
import type { DialogResize } from "./use-dialog-resize";

const HANDLE_CLASS = "absolute touch-none outline-none";

/** Invisible at rest; a focused handle shows itself, since an invisible focus is a lost one. */
const FOCUS_CLASS = "rounded-full focus-visible:bg-tone-info-emphasis/50";

export function DialogResizeHandles({ resize }: { resize: DialogResize }) {
  const strings = useUiStrings();
  if (!resize.enabled) return null;
  const { current, min, max, onPointerDown, onKeyDown } = resize;
  const handlers = { onPointerDown, onKeyDown };

  return (
    <>
      <div
        aria-hidden="true"
        data-edge="left"
        className={`${HANDLE_CLASS} inset-y-0 right-full w-2 cursor-ew-resize`}
        {...handlers}
      />
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={strings.resizeWidth}
        aria-valuenow={current?.width}
        aria-valuemin={min.width}
        aria-valuemax={max?.width}
        tabIndex={0}
        data-edge="right"
        className={`${HANDLE_CLASS} ${FOCUS_CLASS} inset-y-0 left-full w-2 cursor-ew-resize`}
        {...handlers}
      />
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={strings.resizeHeight}
        aria-valuenow={current?.height}
        aria-valuemin={min.height}
        aria-valuemax={max?.height}
        tabIndex={0}
        data-edge="bottom"
        className={`${HANDLE_CLASS} ${FOCUS_CLASS} inset-x-0 top-full h-2 cursor-ns-resize`}
        {...handlers}
      />
      <div
        aria-hidden="true"
        data-edge="corner"
        className={`${HANDLE_CLASS} left-full top-full size-3 cursor-nwse-resize`}
        {...handlers}
      />
    </>
  );
}
