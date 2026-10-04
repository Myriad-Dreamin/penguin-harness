/**
 * The audio player's seek bar: a thin track in the rule ink, the loaded share a step darker, the
 * played share in the accent, and a dot at the playhead. The control itself is a native range
 * input laid over the drawing and made transparent, so pointer dragging, the slider role and its
 * value text come from the browser, while the look comes from theme tokens rather than each
 * browser's own range chrome. Its keyboard focus is drawn on the wrapper with the ring every
 * button and link shares (`--ui-focus-ring`), since an invisible input cannot show its own.
 *
 * The loaded share is drawn because it is where a seek can land (audio-clock.ts `loadedEnd`):
 * the parent clamps a seek to it, and the bar shows the reader that limit instead of hiding it.
 */
import type { KeyboardEvent } from "react";

/** How far one arrow key press moves the playhead, in seconds. */
const ARROW_STEP = 5;

const percent = (value: number, total: number) =>
  `${total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0}%`;

export function AudioSeek({
  duration,
  time,
  loaded,
  label,
  valueText,
  onSeek,
}: {
  /** The file's length in seconds; null until its metadata has loaded, which disables the bar. */
  duration: number | null;
  time: number;
  /** Seconds received so far: the furthest point a seek can reach. */
  loaded: number;
  label: string;
  valueText: string;
  onSeek: (seconds: number) => void;
}) {
  const total = duration ?? 0;
  const ready = duration !== null && duration > 0;

  // Arrow keys move by a fixed step rather than the input's `step="any"`, which browsers resolve
  // to a step too small to hear; Home and End go to either end.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const target: Record<string, number> = {
      ArrowLeft: time - ARROW_STEP,
      ArrowDown: time - ARROW_STEP,
      ArrowRight: time + ARROW_STEP,
      ArrowUp: time + ARROW_STEP,
      Home: 0,
      End: total,
    };
    const next = target[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onSeek(Math.min(total, Math.max(0, next)));
  };

  return (
    <div className="mp:relative mp:h-3 mp:w-full mp:rounded-full mp:has-[:focus-visible]:[outline:var(--ui-focus-ring)] mp:has-[:focus-visible]:[outline-offset:var(--ui-focus-ring-offset)]">
      <div className="mp:absolute mp:inset-x-0 mp:top-1/2 mp:h-1 mp:-translate-y-1/2 mp:overflow-hidden mp:rounded-full mp:bg-line-muted">
        <div
          className="mp:absolute mp:inset-y-0 mp:left-0 mp:bg-line-emphasis"
          style={{ width: percent(loaded, total) }}
        />
        <div
          className="mp:absolute mp:inset-y-0 mp:left-0 mp:bg-accent"
          style={{ width: percent(time, total) }}
        />
      </div>
      {ready && (
        <div
          aria-hidden
          className="mp:pointer-events-none mp:absolute mp:top-1/2 mp:size-2.5 mp:-translate-x-1/2 mp:-translate-y-1/2 mp:rounded-full mp:bg-accent"
          style={{ left: percent(time, total) }}
        />
      )}
      <input
        type="range"
        min={0}
        max={total}
        step="any"
        value={Math.min(time, total)}
        disabled={!ready}
        aria-label={label}
        aria-valuetext={valueText}
        onChange={(e) => onSeek(Number(e.target.value))}
        onKeyDown={onKeyDown}
        className="mp:absolute mp:inset-0 mp:m-0 mp:h-full mp:w-full mp:cursor-pointer mp:appearance-none mp:opacity-0 mp:outline-none mp:disabled:cursor-default"
      />
    </div>
  );
}
