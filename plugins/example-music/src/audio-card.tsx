/**
 * What the audio player draws, from the playback state audio-file.tsx keeps: a compact one-row
 * card — a round play/pause button, the file name, the elapsed / total time and the seek bar — or,
 * for a file that cannot be played, the same card shape holding a line that says so.
 *
 * It is drawn from theme tokens: the radius, line and surface of the transcript's other cards
 * (the files card, a tool call's card), the accent for its one action and the danger tone for the
 * failed mark, so it reads as part of the app in every theme and both modes. The classes are the
 * host's utilities under the plugin's `mp:` prefix, compiled into its own stylesheet (styles.css)
 * over the host's tokens. The width is capped so it does not span a wide chat column, and every
 * part keeps its box from the first render — the clock is a fixed-width monospace readout — so
 * nothing shifts when the file's length arrives.
 */
import type { ReactNode } from "react";
import { GlyphIcon, ICONS, ICON_SIZE, Spinner } from "@prismshadow/penguin-ui";
import { formatClock } from "./audio-clock";
import { AudioSeek } from "./audio-seek";
import type { AudioStrings } from "./strings";

/** The card around the player and around the line it becomes: one shape, one height. */
const CARD =
  "mp:flex mp:w-full mp:max-w-md mp:items-center mp:gap-3 mp:rounded-xl mp:border mp:border-line mp:bg-surface mp:px-2.5 mp:py-2";

/** The danger tone's ink (the web app's lib/tone.ts `toneInk.danger`, which a plugin cannot import). */
const DANGER_INK = "mp:text-red-600 mp:dark:text-red-400";

/** The round slot that leads the card: the play button, or the failed mark in its place. */
const DISC = "mp:flex mp:size-8 mp:shrink-0 mp:items-center mp:justify-center mp:rounded-full";

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
  const elapsed = formatClock(time);
  const total = formatClock(duration);
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
        <GlyphIcon d={ICONS.xCircle} size={ICON_SIZE.iconButton} className={DANGER_INK} />
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
