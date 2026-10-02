/**
 * useDialogResize: the state behind a dialog whose borders a pointer drags to resize it — the
 * size the reader chose (remembered in browser storage under the caller's key), the viewport it
 * is held to, and the handlers its border handles spread.
 *
 * The chosen size is kept as chosen and clamped on render, so a window shrunk and grown again
 * gives the dialog its size back instead of the smaller one it was squeezed to on the way. With
 * no size chosen the dialog keeps its stylesheet default and the hook sets no dimensions at all.
 *
 * A drag never re-renders: each pointer move writes the box's inline width and height in the
 * next animation frame, and only the release commits the size to state and storage. Below the
 * `sm` breakpoint the dialog fills the screen and the hook is inert — no handles, no dimensions.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { usePointerDrag } from "../../layout/resize-handle/use-pointer-drag";
import {
  DIALOG_MIN_SIZE,
  DIALOG_VIEWPORT_MARGIN_PX,
  browserSizeStorage,
  clampDialogSize,
  maxDialogSize,
  readDialogSize,
  resizeFromEdge,
  stepFromKey,
  writeDialogSize,
} from "./dialog-size";
import type { DialogResizeEdge, DialogSize } from "./dialog-size";

/** Tailwind's `sm` breakpoint, as the query the stylesheet itself answers (rem in a media query is the browser's default size). */
const WIDE_QUERY = "(min-width: 40rem)";

const EDGES: ReadonlySet<string> = new Set<DialogResizeEdge>(["left", "right", "bottom", "corner"]);

function readViewport(): DialogSize | null {
  if (typeof window === "undefined") return null;
  return { width: window.innerWidth, height: window.innerHeight };
}

/** The overlay's padding in px: 1rem at the live root size, which tracks the text-size setting. */
function readMargin(): number {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") {
    return DIALOG_VIEWPORT_MARGIN_PX;
  }
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(rem) && rem > 0 ? rem : DIALOG_VIEWPORT_MARGIN_PX;
}

function readWide(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(WIDE_QUERY).matches;
}

/** The handle an event came from, by its `data-edge`. */
function edgeOf(element: HTMLElement): DialogResizeEdge | null {
  const edge = element.dataset["edge"];
  return edge !== undefined && EDGES.has(edge) ? (edge as DialogResizeEdge) : null;
}

const sameSize = (a: DialogSize | null, b: DialogSize | null) =>
  a === b || (a !== null && b !== null && a.width === b.width && a.height === b.height);

export interface DialogResize {
  /** Resizing is on and the screen is wide: draw the handles and apply `style`. */
  enabled: boolean;
  /** Inline dimensions for the resized box, or undefined while it keeps its default size. */
  style: CSSProperties | undefined;
  /** The box's size as drawn (chosen, or measured at its default), once known. */
  current: DialogSize | null;
  min: DialogSize;
  /** The largest the box may be in this viewport. */
  max: DialogSize | null;
  /** Spread on every handle; the handle names its border with `data-edge`. */
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

interface DragPayload {
  edge: DialogResizeEdge;
  x: number;
  y: number;
  start: DialogSize;
}

/**
 * @param storageKey where the size is remembered; undefined turns resizing off entirely.
 * @param open whether the dialog is showing (the box is measured only then).
 * @param boxRef the element whose width and height are set: the dialog's sized box.
 */
export function useDialogResize(
  storageKey: string | undefined,
  open: boolean,
  boxRef: RefObject<HTMLElement | null>,
): DialogResize {
  const on = storageKey !== undefined;
  const [chosen, setChosen] = useState<DialogSize | null>(() =>
    storageKey === undefined ? null : readDialogSize(browserSizeStorage(), storageKey),
  );
  const [viewport, setViewport] = useState(readViewport);
  const [wide, setWide] = useState(readWide);
  const [measured, setMeasured] = useState<DialogSize | null>(null);

  useEffect(() => {
    if (!on || typeof window === "undefined") return;
    const query = typeof window.matchMedia === "function" ? window.matchMedia(WIDE_QUERY) : null;
    const sync = () => {
      setViewport((previous) => {
        const next = readViewport();
        return sameSize(previous, next) ? previous : next;
      });
      setWide(query?.matches ?? false);
    };
    // A change between the first render and this subscription would otherwise go unseen.
    sync();
    window.addEventListener("resize", sync);
    query?.addEventListener("change", sync);
    return () => {
      window.removeEventListener("resize", sync);
      query?.removeEventListener("change", sync);
    };
  }, [on]);

  const enabled = on && wide && viewport !== null;
  const margin = enabled ? readMargin() : DIALOG_VIEWPORT_MARGIN_PX;
  const rendered =
    enabled && viewport !== null && chosen !== null
      ? clampDialogSize(chosen, viewport, { margin })
      : null;
  const sized = rendered !== null;
  const style: CSSProperties | undefined =
    rendered === null ? undefined : { width: rendered.width, height: rendered.height };

  // The default size is the stylesheet's; measure it so the handles can report a value and the
  // first arrow key has somewhere to step from.
  useLayoutEffect(() => {
    if (!enabled || !open || sized) return;
    const box = boxRef.current;
    if (box === null) return;
    const rect = box.getBoundingClientRect();
    const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
    setMeasured((previous) => (sameSize(previous, next) ? previous : next));
  }, [enabled, open, sized, viewport, boxRef]);

  const commit = useCallback(
    (size: DialogSize) => {
      if (storageKey === undefined) return;
      setChosen(size);
      writeDialogSize(browserSizeStorage(), storageKey, size);
    },
    [storageKey],
  );

  const paint = (size: DialogSize | null) => {
    const box = boxRef.current;
    if (box === null) return;
    box.style.width = size === null ? "" : `${size.width}px`;
    box.style.height = size === null ? "" : `${size.height}px`;
  };

  const frame = useRef<number | null>(null);
  const pending = useRef<DialogSize | null>(null);
  const stopFrame = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  useEffect(() => stopFrame, []);

  const drag = usePointerDrag<DragPayload>({
    threshold: 0,
    begin: (event) => {
      const edge = edgeOf(event.currentTarget);
      const box = boxRef.current;
      if (!enabled || edge === null || box === null) return null;
      event.preventDefault(); // no text selection while a border is dragged
      const rect = box.getBoundingClientRect();
      pending.current = null;
      return {
        edge,
        x: event.clientX,
        y: event.clientY,
        start: { width: rect.width, height: rect.height },
      };
    },
    onMove: (event, drag) => {
      const bounds = readViewport();
      if (bounds === null) return;
      pending.current = clampDialogSize(
        resizeFromEdge(drag.edge, drag.start, event.clientX - drag.x, event.clientY - drag.y),
        bounds,
        { margin },
      );
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        paint(pending.current);
      });
    },
    onEnd: () => {
      stopFrame();
      const size = pending.current;
      pending.current = null;
      if (size === null) return; // a press without a move: nothing changed
      paint(size);
      commit(size);
    },
    onCancel: () => {
      stopFrame();
      pending.current = null;
      paint(rendered); // back to what the last render drew
    },
  });

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const edge = edgeOf(event.currentTarget);
    if (!enabled || viewport === null || edge === null || edge === "corner") return;
    const step = stepFromKey(edge, event.key);
    const base = rendered ?? measured;
    if (step === null || base === null) return;
    event.preventDefault();
    commit(clampDialogSize(resizeFromEdge(edge, base, step.dx, step.dy), viewport, { margin }));
  };

  return {
    enabled,
    style,
    current: rendered ?? measured,
    min: DIALOG_MIN_SIZE,
    max: viewport === null ? null : maxDialogSize(viewport, margin),
    onPointerDown: drag.onPointerDown,
    onKeyDown,
  };
}
