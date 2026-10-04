/**
 * The player: a linked audio file as a compact card below the reply paragraph that links it — a
 * round play/pause button, the file name, the elapsed / total time and a seek bar. This file is
 * the plugin's lazy chunk (index.ts binds its default export through `lazy`).
 *
 * Underneath is a plain `<audio>` without controls — the browser's own player chrome differs per
 * browser and ignores the theme — and the card follows the element's media events, so the element
 * stays the one source of truth for whether it plays and where it is.
 *
 * States:
 * - Before play: `preload="none"` — a transcript can link many files, and nothing is fetched
 *   until the reader presses play — so the length reads `-:--` and the seek bar is off, its
 *   playhead at the start.
 * - Loading: pressing play shows a spinner in the button until the element has enough data.
 * - Playing / paused / ended: the clock and the bar follow the element. The file comes through the
 *   Workspace file URL, which answers the whole file (no Range requests): it seeks only within
 *   what has loaded, so a seek is clamped to that extent, and the bar draws it.
 * - Failed: a file that cannot be played — gone since the reply was written, or in a format this
 *   browser does not decode — turns the card into a line saying so once playback has been tried;
 *   the link above it still opens the file in the Files panel.
 *
 * Styling: the classes are the host's Tailwind utilities under the plugin's `mp:` prefix, compiled
 * into its own stylesheet over the host's tokens (styles.css), so the card has the radius, line and
 * surface of the transcript's other cards in every theme and both modes. Every part keeps its box
 * from the first render — the clock is a fixed-width monospace readout — so nothing shifts when
 * the file's length arrives.
 */
import { useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, SyntheticEvent } from "react";
import { GlyphIcon, ICONS, ICON_SIZE, Spinner } from "@prismshadow/penguin-ui";
import type { FileRendererProps } from "@prismshadow/penguin-web/plugin-types";
import { stringsFor } from "./strings";
import type { AudioStrings } from "./strings";

export interface AudioPlayback {
  playing: boolean;
  /** Asked to play and still waiting for data. */
  waiting: boolean;
  /** Seconds into the file. */
  time: number;
  /** The file's length in seconds; null until its metadata has loaded. */
  duration: number | null;
  /** Seconds received so far: how far a seek can reach. */
  loaded: number;
}

const IDLE: AudioPlayback = { playing: false, waiting: false, time: 0, duration: null, loaded: 0 };

export default function AudioFile({ url, name, locale }: FileRendererProps) {
  const strings = stringsFor(locale);
  const ref = useRef<HTMLAudioElement>(null);
  const [failed, setFailed] = useState(false);
  const [playback, setPlayback] = useState<AudioPlayback>(IDLE);

  if (failed) return <AudioFailed name={name} strings={strings} />;

  const patch = (next: Partial<AudioPlayback>) => setPlayback((p) => ({ ...p, ...next }));
  // Where the element is, read from it rather than tracked beside it.
  const sync = (e: SyntheticEvent<HTMLAudioElement>, next: Partial<AudioPlayback> = {}) => {
    const el = e.currentTarget;
    patch({
      time: el.currentTime,
      duration: knownLength(el.duration),
      loaded: loadedEnd(el.seekable, el.buffered),
      ...next,
    });
  };

  const toggle = () => {
    const el = ref.current;
    if (el === null) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    patch({ waiting: el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA });
    // A failed load reports through the element's error event; a refused play (a pause racing
    // it) leaves the card paused, which is already what it shows.
    el.play().catch(() => patch({ waiting: false }));
  };

  const seek = (seconds: number) => {
    const el = ref.current;
    if (el === null) return;
    const to = Math.min(seconds, loadedEnd(el.seekable, el.buffered));
    el.currentTime = to;
    patch({ time: to });
  };

  return (
    <AudioCard name={name} strings={strings} playback={playback} onToggle={toggle} onSeek={seek}>
      <audio
        ref={ref}
        preload="none"
        src={url}
        onPlay={() => patch({ playing: true })}
        onPlaying={(e) => sync(e, { waiting: false })}
        onWaiting={() => patch({ waiting: true })}
        onPause={(e) => sync(e, { playing: false, waiting: false })}
        onEnded={(e) => sync(e, { playing: false, waiting: false })}
        onLoadedMetadata={sync}
        onDurationChange={sync}
        onTimeUpdate={sync}
        onProgress={sync}
        onError={() => setFailed(true)}
      />
    </AudioCard>
  );
}

// ── the card ──

/** The card around the player and around the line it becomes: one shape, one height. */
const CARD =
  "mp:flex mp:w-full mp:max-w-md mp:items-center mp:gap-3 mp:rounded-xl mp:border mp:border-line mp:bg-surface mp:px-2.5 mp:py-2";

/** The round slot that leads the card: the play button, or the failed mark in its place. */
const DISC = "mp:flex mp:size-8 mp:shrink-0 mp:items-center mp:justify-center mp:rounded-full";

export function AudioCard({
  name,
  strings: S,
  playback: { playing, waiting, time, duration, loaded },
  onToggle,
  onSeek,
  children,
}: {
  name: string;
  strings: AudioStrings;
  playback: AudioPlayback;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  /** The media element the card drives; it draws nothing itself. */
  children: ReactNode;
}) {
  const total = formatClock(duration, "up");
  // At the end the elapsed time reads as the total, which is rounded up.
  const elapsed = duration !== null && time >= duration ? total : formatClock(time);
  const label = playing ? S.pause(name) : S.play(name);
  return (
    <div data-audio-file={playing ? "playing" : "paused"} className={CARD}>
      <button
        type="button"
        aria-label={label}
        data-tooltip={label}
        aria-busy={waiting || undefined}
        onClick={onToggle}
        className={`${DISC} mp:cursor-pointer mp:bg-accent mp:text-accent-fg mp:transition-opacity mp:duration-150 mp:hover:opacity-90`}
      >
        {waiting ? (
          <Spinner size="md" label={S.loading(name)} />
        ) : (
          <GlyphIcon d={playing ? ICONS.pause : ICONS.play} size={ICON_SIZE.iconButton} filled />
        )}
      </button>
      <div className="mp:flex mp:min-w-0 mp:flex-1 mp:flex-col mp:gap-1">
        <div className="mp:flex mp:items-baseline mp:gap-3">
          <span
            data-tooltip={name}
            className="mp:min-w-0 mp:flex-1 mp:truncate mp:font-mono mp:text-sm mp:text-fg"
          >
            {name}
          </span>
          {/* Read out by the seek bar's value text; drawn here for the eye only. */}
          <span
            aria-hidden
            className="mp:min-w-[11ch] mp:shrink-0 mp:text-right mp:font-mono mp:text-xs mp:tabular-nums mp:text-fg-subtle"
          >
            {elapsed} / {total}
          </span>
        </div>
        <AudioSeek
          duration={duration}
          time={time}
          loaded={loaded}
          label={S.seek(name)}
          valueText={S.position(elapsed, total)}
          onSeek={onSeek}
        />
      </div>
      {children}
    </div>
  );
}

/** The card a file that cannot be played becomes: the failed mark and a line naming the file. */
export function AudioFailed({ name, strings: S }: { name: string; strings: AudioStrings }) {
  return (
    <div data-audio-file="failed" className={CARD}>
      <span className={`${DISC} mp:bg-surface-muted`}>
        <GlyphIcon
          d={ICONS.xCircle}
          size={ICON_SIZE.iconButton}
          className="mp:text-tone-danger-fg"
        />
      </span>
      <span
        role="status"
        className="mp:min-w-0 mp:flex-1 mp:text-sm mp:text-fg-muted mp:[overflow-wrap:anywhere]"
      >
        {S.unavailable(name)}
      </span>
    </div>
  );
}

// ── the seek bar ──

/** How far one arrow key press moves the playhead, in seconds. */
const ARROW_STEP = 5;

const percent = (value: number, total: number) =>
  `${total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0}%`;

/**
 * A thin track in the rule ink, the loaded share a step darker, the played share in the accent,
 * and a dot at the playhead (muted, at the start, until the length is known). The control itself
 * is a native range input laid over the drawing and made transparent, so pointer dragging, the
 * slider role and its value text come from the browser, while the look comes from theme tokens
 * rather than each browser's own range chrome. Its keyboard focus is drawn on the wrapper with
 * the ring every button and link shares (`--ui-focus-ring`), since an invisible input cannot
 * show its own.
 *
 * The loaded share is drawn because it is where a seek can land (`loadedEnd`): the player clamps
 * a seek to it, and the bar shows the reader that limit instead of hiding it.
 */
function AudioSeek({
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
  const ready = duration !== null;

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
      <div
        aria-hidden
        className={`mp:pointer-events-none mp:absolute mp:top-1/2 mp:size-2.5 mp:-translate-y-1/2 mp:rounded-full ${ready ? "mp:-translate-x-1/2 mp:bg-accent" : "mp:bg-line-emphasis"}`}
        style={{ left: ready ? percent(time, total) : "0%" }}
      />
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

// ── time arithmetic ──

/** A media element's `duration` as a length: null while it is NaN (no metadata), 0 or infinite. */
export function knownLength(duration: number): number | null {
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

/**
 * `m:ss`, or `h:mm:ss` from an hour on; `-:--` while the length is not known yet. A length is
 * rounded up (`"up"`), so a file shorter than a second reads `0:01`, never a length of `0:00`.
 */
export function formatClock(seconds: number | null, round: "down" | "up" = "down"): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "-:--";
  const total = round === "up" ? Math.ceil(seconds) : Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** The ranges shape `seekable` and `buffered` share, so a test can pass a plain stand-in. */
export interface TimeRangesLike {
  readonly length: number;
  end(index: number): number;
}

/**
 * How far into the file a seek can land. The Workspace file route answers the whole file and no
 * byte ranges, so the browser can only seek within what it has already received: the furthest end
 * of the seekable and the buffered ranges, whichever the browser reports.
 */
export function loadedEnd(seekable: TimeRangesLike, buffered: TimeRangesLike): number {
  let end = 0;
  for (const ranges of [seekable, buffered]) {
    for (let i = 0; i < ranges.length; i++) end = Math.max(end, ranges.end(i));
  }
  return end;
}
