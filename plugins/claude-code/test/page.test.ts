/**
 * What the queue shows and is configured with, apart from the queue itself: the console page's
 * script, the settings' bounds, and the refusal the routes answer with.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAPACITY,
  DEFAULT_IDLE_MINUTES,
  PAGE_STRINGS,
  QueueError,
  pageHtml,
  queueConfigOf,
} from "../src/index.js";

describe("the console page", () => {
  it("serves a script that compiles and asks the organization's runs", () => {
    const html = pageHtml();
    expect(html).toContain('<main id="main"><h1>Claude Code</h1>');
    const script = /<script>([\s\S]*)<\/script>/.exec(html)![1]!;
    // The script is written inside a template literal: an escape gone wrong is a syntax error here.
    expect(() => new Function(script)).not.toThrow();
    // The placeholders in the words are filled (a regular expression here once lost its
    // backslashes to the template literal, and the page said "{running} of {capacity}").
    const fillLine = /^const fill = .*$/m.exec(script)![0];
    const fill = new Function(`${fillLine} return fill;`)() as (
      text: string,
      values: Record<string, unknown>,
    ) => string;
    expect(fill(PAGE_STRINGS.en.slots, { running: 1, capacity: 4, queued: 2 })).toBe(
      "1 of 4 slots in use on this server · 2 waiting",
    );
    expect(fill(PAGE_STRINGS.zh.position, { n: 3 })).toBe("第 3 位");
    expect(script).toContain('"/organizations/" + m[2] + "/claude-code"');
    expect(script).toContain('base + "/runs"');
    // Open names the machine the organization runs on: the app never fetched these runs, so
    // without it the chat page asks its own server for the Session and falls back to home.
    const pathLine = /^const sessionPath = .*$/m.exec(script)![0];
    const sessionPath = (machine: string | null) =>
      new Function("machine", `${pathLine} return sessionPath;`)(machine) as (id: string) => string;
    expect(sessionPath("dev box")("s 1")).toBe("/chat/s%201?machine=dev%20box");
    expect(sessionPath(null)("s1")).toBe("/chat/s1");
    expect(script).toContain("go(sessionPath(");
    expect(script).toContain("esc(sessionPath(r.sessionId))");
  });
});

describe("the settings", () => {
  it("read out-of-bounds values as the defaults", () => {
    expect(queueConfigOf({})).toEqual({
      capacity: DEFAULT_CAPACITY,
      idleMinutes: DEFAULT_IDLE_MINUTES,
    });
    expect(queueConfigOf({ capacity: 0, idleMinutes: -1 })).toEqual({
      capacity: DEFAULT_CAPACITY,
      idleMinutes: DEFAULT_IDLE_MINUTES,
    });
    expect(queueConfigOf({ capacity: 8, idleMinutes: 0 })).toEqual({ capacity: 8, idleMinutes: 0 });
  });
});

describe("QueueError", () => {
  it("carries the status and code the routes answer with", () => {
    const err = new QueueError(409, "remote_org", "far");
    expect([err.status, err.code, err.message]).toEqual([409, "remote_org", "far"]);
  });
});
