/**
 * formatMessageTime reuses one Intl.DateTimeFormat per UI language instead of building one per
 * call (lib/format.ts): the text must be exactly what `toLocaleString` with the same options
 * produced.
 */
import { describe, expect, it } from "vitest";
import { formatMessageTime } from "../src/lib/format";

const options = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;

describe("formatMessageTime", () => {
  it("reads exactly as toLocaleString with the same options, in both languages", () => {
    const stamps = [0, Date.UTC(2026, 6, 2, 14, 58), Date.UTC(2026, 11, 31, 23, 5), Date.now()];
    for (const ms of stamps) {
      expect(formatMessageTime(ms, "en")).toBe(new Date(ms).toLocaleString("en-US", options));
      expect(formatMessageTime(ms, "zh")).toBe(new Date(ms).toLocaleString("zh-CN", options));
    }
  });

  it("is empty for a value that is not a time", () => {
    expect(formatMessageTime(Number.NaN, "en")).toBe("");
  });
});
