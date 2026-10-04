/**
 * File renderers on the web side: the chat module reads its `fileRenderers` contributions — each
 * one's extensions and component, in module order (fileRenderersOf in features/chat/deps.ts) —
 * and the conversation picks the files a reply block draws (features/chat/reply-files.ts). The
 * renderers themselves come from plugins (the music example's player is tested in its package).
 */
import type { Contributed } from "@prismshadow/penguin-core/kernel";
import { describe, expect, it } from "vitest";
import { fileRenderersOf } from "../src/features/chat/deps";
import type { FileRendererRule } from "../src/features/chat/deps";
import type { FileRenderer } from "../src/features/chat/iface";
import { extensionOf, replyFilesOf } from "../src/features/chat/reply-files";
import type { ReplyFilesInput } from "../src/features/chat/reply-files";

const Audio: FileRenderer = () => null;
const Other: FileRenderer = () => null;
const WS = "/home/u/ws";

const contribution = (id: string, extensions: unknown[], code: unknown): Contributed =>
  ({ id, from: "M", data: { extensions }, code }) as unknown as Contributed;

describe("fileRenderersOf", () => {
  it("is empty without contributions", () => {
    expect(fileRenderersOf([])).toEqual([]);
  });

  it("drops a leading dot, lowercases, keeps module order, and skips one left with no extension", () => {
    expect(
      fileRenderersOf([
        contribution("a", ["MP3", ".Wav", ""], Audio),
        contribution("none", ["", "."], Other),
        contribution("b", ["ogg"], Other),
      ]),
    ).toEqual([
      { id: "a", extensions: ["mp3", "wav"], Renderer: Audio },
      { id: "b", extensions: ["ogg"], Renderer: Other },
    ]);
  });
});

function input(rules: readonly FileRendererRule[]): ReplyFilesInput {
  return { workspace: WS, rules, urlOf: (path) => `url:${path}` };
}

const AUDIO_RULE: FileRendererRule = { id: "m", extensions: ["mp3", "wav"], Renderer: Audio };

describe("replyFilesOf", () => {
  it("matches the extension case-insensitively, one entry per file, in link order", () => {
    const files = replyFilesOf(
      ["music/B.WAV", "a.mp3", "./music/B.WAV", `${WS}/a.mp3`, "notes.txt"],
      input([AUDIO_RULE]),
    );
    expect(files.map(({ path, name, url, Renderer }) => [path, name, url, Renderer])).toEqual([
      ["music/B.WAV", "B.WAV", "url:music/B.WAV", Audio],
      ["a.mp3", "a.mp3", "url:a.mp3", Audio],
    ]);
  });

  it("decodes a percent-encoded name and drops a query", () => {
    const files = replyFilesOf(["%E5%A4%9C%E6%9B%B2.mp3?v=2"], input([AUDIO_RULE]));
    expect(files.map((f) => f.path)).toEqual(["夜曲.mp3"]);
  });

  it("takes the first contribution listing the extension", () => {
    const rules: FileRendererRule[] = [
      { id: "x", extensions: ["ogg"], Renderer: Audio },
      { id: "y", extensions: ["mp3"], Renderer: Other },
      { id: "z", extensions: ["mp3"], Renderer: Audio },
    ];
    expect(replyFilesOf(["a.mp3"], input(rules)).map((f) => f.Renderer)).toEqual([Other]);
    expect(replyFilesOf(["a.mp3"], input([]))).toEqual([]);
  });

  it("draws nothing for an external link, an anchor, or a path outside the Workspace", () => {
    expect(
      replyFilesOf(
        ["https://example.com/a.mp3", "#a.mp3", "../out.mp3", "/etc/a.mp3", "~/a.mp3", "mp3"],
        input([AUDIO_RULE]),
      ),
    ).toEqual([]);
  });

  it("reads an extension only after a name's first character", () => {
    expect(extensionOf("a.MP3")).toBe("mp3");
    expect(extensionOf(".mp3")).toBe("");
    expect(extensionOf("mp3")).toBe("");
  });
});
