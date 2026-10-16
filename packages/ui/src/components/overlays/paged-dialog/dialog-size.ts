/**
 * The arithmetic behind a resizable dialog, kept free of React and the DOM so it can be called
 * directly: which size a drag or an arrow key asks for, the bounds it is held to, and how the
 * remembered size is read from and written to browser storage.
 *
 * The dialog stays centred while it is resized (the overlay centres it on both axes), so a border
 * moved by `d` px grows or shrinks the dialog by `2d`: the opposite border moves out by the same
 * amount and the dragged border stays under the pointer. Sizes are in CSS px.
 */

export interface DialogSize {
  width: number;
  height: number;
}

/** A border, or the corner, a resize starts from. The top border is not one: the dialog's heading and close control live there. */
export type DialogResizeEdge = "left" | "right" | "bottom" | "corner";

/**
 * The smallest the dialog goes: room for the rail (11rem) beside a pane that still holds a form
 * row, and for a heading plus a few rows of content.
 */
export const DIALOG_MIN_SIZE: DialogSize = { width: 600, height: 420 };

/**
 * The overlay's padding around the dialog at the browser's default root size (`sm:p-4`, 1rem):
 * the dialog never grows into it. The root size follows the reader's text-size setting, so the
 * hook passes the live value.
 */
export const DIALOG_VIEWPORT_MARGIN_PX = 16;

/** One arrow-key step, as px the border moves (the dialog changes by twice this). */
export const DIALOG_RESIZE_STEP_PX = 16;

/** The largest the dialog may be in this viewport. */
export function maxDialogSize(
  viewport: DialogSize,
  margin: number = DIALOG_VIEWPORT_MARGIN_PX,
): DialogSize {
  return {
    width: Math.max(0, Math.floor(viewport.width - 2 * margin)),
    height: Math.max(0, Math.floor(viewport.height - 2 * margin)),
  };
}

/**
 * Holds a size between the minimum and the viewport. The viewport wins when the two disagree: a
 * dialog larger than the window would put its own borders, and the means to shrink it, off screen.
 */
export function clampDialogSize(
  size: DialogSize,
  viewport: DialogSize,
  {
    min = DIALOG_MIN_SIZE,
    margin = DIALOG_VIEWPORT_MARGIN_PX,
  }: { min?: DialogSize; margin?: number } = {},
): DialogSize {
  const max = maxDialogSize(viewport, margin);
  const clamp = (value: number, lo: number, hi: number) =>
    Math.round(Math.min(Math.max(value, lo), hi));
  return {
    width: clamp(size.width, min.width, max.width),
    height: clamp(size.height, min.height, max.height),
  };
}

/** The size a border moved by (`dx`, `dy`) asks for, before clamping. */
export function resizeFromEdge(
  edge: DialogResizeEdge,
  start: DialogSize,
  dx: number,
  dy: number,
): DialogSize {
  const width =
    edge === "right" || edge === "corner"
      ? start.width + 2 * dx
      : edge === "left"
        ? start.width - 2 * dx
        : start.width;
  const height = edge === "bottom" || edge === "corner" ? start.height + 2 * dy : start.height;
  return { width, height };
}

/** What the readers need of `localStorage`; a test passes a stand-in, and absence is allowed. */
export type SizeStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * The browser's localStorage, or null where it is unavailable: the accessor itself throws when
 * site data is blocked, and there is no window outside a browser.
 */
export function browserSizeStorage(): SizeStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const isDimension = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * The remembered size, or null when there is none or it cannot be read — a malformed value, a
 * storage that throws. Callers render the default size then; nothing is repaired in place.
 */
export function readDialogSize(storage: SizeStorage | null, key: string): DialogSize | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { width, height } = parsed as Record<string, unknown>;
    return isDimension(width) && isDimension(height) ? { width, height } : null;
  } catch {
    return null;
  }
}

/** Remembers a size; a storage that refuses (quota, blocked site data) leaves it unremembered. */
export function writeDialogSize(storage: SizeStorage | null, key: string, size: DialogSize): void {
  if (storage === null) return;
  try {
    storage.setItem(
      key,
      JSON.stringify({ width: Math.round(size.width), height: Math.round(size.height) }),
    );
  } catch {
    // Not remembered: the dialog keeps the size for as long as the page stays open.
  }
}

/**
 * What an arrow key on a border's handle asks for, as the px the border moves (`dx`, `dy`), or
 * null for a key the handle ignores. Each key moves the border the way the arrow points, so the
 * left border's ← and the right border's → both widen the dialog.
 */
export function stepFromKey(
  edge: Exclude<DialogResizeEdge, "corner">,
  key: string,
  step: number = DIALOG_RESIZE_STEP_PX,
): { dx: number; dy: number } | null {
  if (edge === "bottom") {
    if (key === "ArrowDown") return { dx: 0, dy: step };
    if (key === "ArrowUp") return { dx: 0, dy: -step };
    return null;
  }
  if (key === "ArrowRight") return { dx: step, dy: 0 };
  if (key === "ArrowLeft") return { dx: -step, dy: 0 };
  return null;
}
