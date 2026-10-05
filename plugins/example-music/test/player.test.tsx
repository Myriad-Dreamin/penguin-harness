/**
 * The player (src/player.tsx): a themed card driving an `<audio>` on the file URL the web app
 * hands it, in the app's interface language, and the time arithmetic under it.
 */
import { createElement, Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerenderToNodeStream } from "react-dom/static";
import { describe, expect, it } from "vitest";
import {
  AudioCard,
  AudioFile,
  AudioFailed,
  formatClock,
  knownLength,
  loadedEnd,
} from "../src/player";
import type { AudioPlayback } from "../src/player";
import { stringsFor } from "../src/strings";
import { ExampleMusic } from "../src/index";

/** A `Language` that never changes: what a static render reads. */
const language = (locale: "zh" | "en") => ({ get: () => locale, subscribe: () => () => {} });

const ZH = stringsFor("zh");

describe("AudioFile", () => {
  it("drives an <audio> on the file URL, fetched only on play, without the browser's chrome", () => {
    const url = "/api/sessions/s1/files/content?path=music%2F%E5%A4%9C%E6%9B%B2.wav";
    const html = renderToStaticMarkup(
      createElement(AudioFile, {
        url,
        path: "music/夜曲.wav",
        name: "夜曲.wav",
        language: language("zh"),
      }),
    );
    expect(html).toMatch(/<audio preload="none" src="[^"]+"><\/audio>/);
    expect(html).toContain(`src="${url.replace(/&/g, "&amp;")}"`);
    expect(html).not.toContain("controls");
    expect(html).toContain('data-audio-file="paused"');
  });
});

const IDLE: AudioPlayback = { playing: false, waiting: false, time: 0, duration: null, loaded: 0 };
const card = (playback: AudioPlayback) =>
  renderToStaticMarkup(
    createElement(AudioCard, {
      name: "夜曲.wav",
      strings: ZH,
      playback,
      onToggle: () => {},
      onSeek: () => {},
      children: null,
    }),
  );

describe("AudioCard", () => {
  it("before play: a named play button, the file name, an unknown length, and the seek bar off", () => {
    const html = card(IDLE);
    expect(html).toContain('<button type="button" aria-label="播放 夜曲.wav"');
    expect(html).toContain(">夜曲.wav</span>");
    expect(html).toContain("0:00 / -:--");
    expect(html).toMatch(
      /<input type="range"[^>]* disabled=""[^>]*aria-label="夜曲.wav 的播放位置"/,
    );
    // The playhead waits at the start, not at the far end.
    expect(html).toContain("left:0%");
    expect(html).not.toContain("left:100%");
    expect(html).not.toContain("aria-busy");
  });

  it("while loading: the button is busy and its spinner says what loads", () => {
    const html = card({ ...IDLE, waiting: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("正在加载 夜曲.wav");
  });

  it("while playing: a pause button, the clock, and a seek bar that reads its position", () => {
    const html = card({ playing: true, waiting: false, time: 3.4, duration: 72, loaded: 72 });
    expect(html).toContain('data-audio-file="playing"');
    expect(html).toContain('aria-label="暂停 夜曲.wav"');
    expect(html).toContain("0:03 / 1:12");
    expect(html).toContain('aria-valuetext="0:03，共 1:12"');
    expect(html).not.toMatch(/<input type="range"[^>]* disabled=""/);
  });

  it("a file shorter than a second reads 0:01, never a length of 0:00", () => {
    const html = card({ playing: false, waiting: false, time: 0.25, duration: 0.25, loaded: 0.25 });
    expect(html).toContain("0:01 / 0:01");
  });

  it("ended: back to a play button with the bar full", () => {
    const html = card({ playing: false, waiting: false, time: 72, duration: 72, loaded: 72 });
    expect(html).toContain('aria-label="播放 夜曲.wav"');
    expect(html).toContain("1:12 / 1:12");
    expect(html).toContain("left:100%");
  });
});

describe("AudioFailed", () => {
  it("is a status line naming the file, in the card's shape, with no control left", () => {
    const html = renderToStaticMarkup(
      createElement(AudioFailed, { name: "chime.ogg", strings: ZH }),
    );
    expect(html).toContain('data-audio-file="failed"');
    expect(html).toMatch(/role="status"[^>]*>无法播放 chime.ogg：/);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
  });
});

describe("the interface language", () => {
  it("names the controls in English on an English interface", () => {
    const html = renderToStaticMarkup(
      createElement(AudioFile, {
        url: "/a.wav",
        path: "a.wav",
        name: "a.wav",
        language: language("en"),
      }),
    );
    expect(html).toContain('aria-label="Play a.wav"');
    expect(html).toContain('aria-label="Position in a.wav"');
  });

  it("is the language the module hands the player it loads", async () => {
    const mod = new ExampleMusic();
    // Wired before setup, as the kernel does.
    mod.language = language("zh");
    mod.setup();
    const player = createElement(mod.audio, { url: "/a.wav", path: "a.wav", name: "a.wav" });
    const { prelude } = await prerenderToNodeStream(
      createElement(Suspense, { fallback: "loading" }, player),
    );
    let html = "";
    for await (const chunk of prelude) html += String(chunk);
    expect(html).toContain('aria-label="播放 a.wav"');
  });
});

describe("time arithmetic", () => {
  it("reads m:ss, h:mm:ss from an hour, and -:-- for an unknown length", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(59.9)).toBe("0:59");
    expect(formatClock(72)).toBe("1:12");
    expect(formatClock(3723)).toBe("1:02:03");
    expect(formatClock(null)).toBe("-:--");
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe("-:--");
    expect(formatClock(0.25, "up")).toBe("0:01");
  });

  it("knows a length only once the element reports a finite, positive one", () => {
    expect(knownLength(Number.NaN)).toBeNull();
    expect(knownLength(0)).toBeNull();
    expect(knownLength(Number.POSITIVE_INFINITY)).toBeNull();
    expect(knownLength(72)).toBe(72);
  });

  it("can seek as far as the furthest seekable or buffered end", () => {
    const ranges = (...ends: number[]) => ({ length: ends.length, end: (i: number) => ends[i]! });
    expect(loadedEnd(ranges(), ranges())).toBe(0);
    expect(loadedEnd(ranges(), ranges(2, 7.5))).toBe(7.5);
    expect(loadedEnd(ranges(9), ranges(4))).toBe(9);
  });
});
