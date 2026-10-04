/**
 * The list's quiet reconcile. A provisional list — drawn from the list cache, or built before
 * every source answered (`sourcesPending`, state/sessions.tsx) — is replaced wholesale by the
 * answer, and the answer usually differs from it in a few rows at the top. Swapped in as is,
 * every row below a change jumps. Instead, for the commits that replace a provisional list:
 *
 * - a row that stays glides from where it was to where it is now (FLIP: measured before and
 *   after the commit, then animated from the old offset back to none);
 * - a row that arrives fades in where it lands;
 * - a row that leaves is gone, and the rows below it glide up into its room — the collapse.
 *
 * Nothing else is animated here: an ordinary update (a run moving its row to the top, a page
 * loaded below) behaves as it always has. Short and quiet by design: the theme's fast duration
 * (`--ui-dur-fast`, 120–150 ms), capped at {@link MAX_MS}, on its layout curve
 * (`--ui-ease-layout` — a theme that jumps in steps jumps here too). Nothing moves under
 * prefers-reduced-motion or the app's own reduced-motion setting (`data-motion="reduced"`).
 *
 * Rows are found by the `data-session-id` the UI package's SessionRow carries, so the three
 * groupings need no wiring of their own. A row with no box (inside a closed fold) is skipped.
 */
import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

const MAX_MS = 180;

/** Each drawn row's offset from the top of `root`, by Session id. */
function measure(root: HTMLElement): Map<string, { el: HTMLElement; top: number }> {
  const origin = root.getBoundingClientRect().top;
  const out = new Map<string, { el: HTMLElement; top: number }>();
  for (const el of root.querySelectorAll<HTMLElement>("[data-session-id]")) {
    const id = el.dataset.sessionId;
    const rect = el.getBoundingClientRect();
    if (id === undefined || rect.height === 0 || out.has(id)) continue;
    out.set(id, { el, top: rect.top - origin });
  }
  return out;
}

/** The theme's timing for the reconcile, or null where nothing should move. */
function motion(): { duration: number; easing: string } | null {
  const root = document.documentElement;
  if (root.dataset.motion === "reduced") return null;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;
  const style = getComputedStyle(root);
  const raw = style.getPropertyValue("--ui-dur-fast").trim();
  const value = Number.parseFloat(raw);
  const ms = raw.endsWith("ms") ? value : raw.endsWith("s") ? value * 1000 : Number.NaN;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const easing = style.getPropertyValue("--ui-ease-layout").trim() || "ease-out";
  return { duration: Math.min(ms, MAX_MS), easing };
}

/**
 * Animates the rows under `root` across the commit that replaces a provisional list (see the
 * header). `provisional` is the list's `sourcesPending`.
 */
export function useReconcileMotion(
  root: RefObject<HTMLElement | null>,
  provisional: boolean,
): void {
  /** Where each row was drawn in the last commit of a provisional list; null otherwise. */
  const before = useRef<Map<string, { el: HTMLElement; top: number }> | null>(null);
  // No dependency list: the rows move on any commit, and the work is skipped outright unless
  // a provisional list is (or was, one commit ago) on screen.
  useLayoutEffect(() => {
    const el = root.current;
    const previous = before.current;
    if (el === null || (!provisional && previous === null)) return;
    const now = measure(el);
    before.current = provisional ? now : null;
    if (previous === null) return;
    const timing = motion();
    if (timing === null) return;
    for (const [id, { el: row, top }] of now) {
      const was = previous.get(id);
      if (was === undefined) {
        row.animate([{ opacity: 0 }, { opacity: 1 }], timing);
      } else if (Math.abs(was.top - top) >= 1) {
        row.animate([{ translate: `0 ${was.top - top}px` }, { translate: "0 0" }], timing);
      }
    }
  });
}
