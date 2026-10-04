/**
 * The player's words, in the two languages the web app ships. The app hands its interface
 * language to every file renderer (`locale` in its props), so the player follows a language
 * switch with the rest of the page.
 */

const zh = {
  /** The play/pause button's name. */
  play: (name: string) => `播放 ${name}`,
  pause: (name: string) => `暂停 ${name}`,
  /** The seek bar's name and value text. */
  seek: (name: string) => `${name} 的播放位置`,
  position: (elapsed: string, total: string) => `${elapsed}，共 ${total}`,
  /** What the spinner announces while the file loads. */
  loading: (name: string) => `正在加载 ${name}`,
  /** The line the player becomes when the file cannot be played. */
  unavailable: (name: string) => `无法播放 ${name}：文件不存在或格式不受支持。`,
};

export type AudioStrings = typeof zh;

const en: AudioStrings = {
  play: (name) => `Play ${name}`,
  pause: (name) => `Pause ${name}`,
  seek: (name) => `Position in ${name}`,
  position: (elapsed, total) => `${elapsed} of ${total}`,
  loading: (name) => `Loading ${name}`,
  unavailable: (name) => `Cannot play ${name}: the file is missing or its format is not supported.`,
};

export function stringsFor(locale: string): AudioStrings {
  return locale === "zh" ? zh : en;
}
