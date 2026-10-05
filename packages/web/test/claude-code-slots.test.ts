/**
 * The Claude Code slot list (features/company/claude-code-slots{,-model}.tsx) and the session
 * dialog's slot line (claude-session-slot.tsx): Ctrl+Alt+; and the command palette both open the
 * list; a row says the roadmap, employee, working or idle, who queued it and the prompt; queued
 * runs follow by place in line; other organizations' slots are only counted; Open enters the
 * run's session in the session dialog; Release asks first, then ends the run and reads again;
 * and the dialog's line says whether the session holds a slot, waits for one, or holds none.
 *
 * Node environment, no DOM: the list's body is a plain element tree, so its buttons are found by
 * their data attribute and clicked through their props.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SessionInfo } from "@prismshadow/penguin-server/api";
import type { OrgClaudeRun, OrgClaudeRuns } from "../src/api/claude-code";
import type { SlotsState } from "../src/features/company/claude-code-slots-model";
import { handleShortcutKeydown } from "../src/lib/shortcuts/dispatcher";
import { setPlatformForTests } from "../src/lib/shortcuts/platform";
import { configureKeybindingsStoreForTests } from "../src/lib/shortcuts/store";
import { S } from "../src/lib/strings";

vi.mock("../src/features/chat/session-surface-view", () => ({
  SessionSurfaceView: () => null,
}));

const model = await import("../src/features/company/claude-code-slots-model");
const { SlotsBody, ReleaseConfirm } = await import("../src/features/company/claude-code-slots");
const { standingPaletteActions } = await import("../src/features/palette/app-palette");
const open = await import("../src/features/company/claude-session-open");
const slot = await import("../src/features/company/claude-session-slot");

const T = S.company.claudeSlots;
const NOW = Date.parse("2026-10-05T12:00:00Z");
const NAMES = new Map([
  ["dev", "Dev Lead"],
  ["web", "Web Dev"],
]);

const run = (over: Partial<OrgClaudeRun> & { id: number }): OrgClaudeRun => ({
  status: "running",
  agentId: "dev",
  by: "user:alice",
  prompt: "",
  ...over,
});

const LIST: OrgClaudeRuns = {
  // Newest first, as the route answers.
  runs: [
    run({ id: 6, status: "queued", agentId: "web", position: 4, prompt: "Second in our line" }),
    run({
      id: 5,
      status: "queued",
      agentId: "dev",
      position: 2,
      by: "agent:web",
      prompt: "Fix it",
    }),
    run({
      id: 4,
      agentId: "web",
      by: "agent:dev",
      prompt: `Review the change ${"x".repeat(300)}`,
      activity: "idle",
      idleSince: "2026-10-05T11:48:00Z",
      startedAt: "2026-10-05T11:00:00Z",
    }),
    run({
      id: 3,
      claudeSessionId: "cs-roadmap-7",
      activity: "working",
      startedAt: "2026-10-05T10:00:00Z",
      sessionId: "cc-3",
    }),
    run({ id: 1, status: "ended" }),
  ],
  capacity: 4,
  idleMinutes: 30,
  // Server-wide: one more running and two more queued belong to other organizations.
  running: 3,
  queued: 4,
};
const ROADMAPS = new Map([["cs-roadmap-7", 7]]);

let offs: Array<() => void> = [];
beforeEach(() => {
  setPlatformForTests("linux");
  configureKeybindingsStoreForTests({
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    layout: null,
  });
});
afterEach(() => {
  for (const off of offs.splice(0)) off();
  model.closeClaudeCodeSlots();
  open.closeClaudeSession();
  setPlatformForTests(null);
  configureKeybindingsStoreForTests({ storage: null, layout: null });
});

/** Whether the list is open, read the way its host reads it. */
function slotsOpen(): boolean {
  let seen = false;
  const Probe = () => {
    seen = model.useClaudeCodeSlotsOpen();
    return null;
  };
  renderToStaticMarkup(createElement(Probe));
  return seen;
}

function press(init: { code: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }) {
  const state = { defaultPrevented: false };
  handleShortcutKeydown({
    key: "",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    ...init,
    defaultPrevented: false,
    preventDefault: () => {
      state.defaultPrevented = true;
    },
  } as unknown as KeyboardEvent);
  return state;
}

/** Every element of a tree whose props carry `attr` = `value`. */
function find(node: ReactNode, attr: string, value: string): ReactElement[] {
  const out: ReactElement[] = [];
  const walk = (n: ReactNode): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isValidElement(n)) return;
    const props = n.props as Record<string, unknown>;
    if (props[attr] === value) out.push(n);
    walk(props.children as ReactNode);
  };
  walk(node);
  return out;
}

const body = (over: Partial<Parameters<typeof SlotsBody>[0]> = {}) => {
  const props = {
    state: { kind: "ready", model: model.slotsModel(LIST, ROADMAPS), error: null } as const,
    names: NAMES,
    now: NOW,
    onOpen: vi.fn(),
    onAskRelease: vi.fn(),
    onRetry: vi.fn(),
    ...over,
  };
  return {
    props,
    tree: SlotsBody(props),
    html: renderToStaticMarkup(createElement(SlotsBody, props)),
  };
};

describe("opening the list", () => {
  it("opens on Ctrl+Alt+; once the host has registered the command", () => {
    expect(press({ code: "Semicolon", ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(slotsOpen()).toBe(false);
    offs.push(model.registerClaudeCodeSlotsCommand());
    expect(press({ code: "Semicolon", ctrlKey: true, altKey: true }).defaultPrevented).toBe(true);
    expect(slotsOpen()).toBe(true);
  });

  it("opens on ⌥⌘; on macOS", () => {
    setPlatformForTests("mac");
    offs.push(model.registerClaudeCodeSlotsCommand());
    press({ code: "Semicolon", metaKey: true, altKey: true });
    expect(slotsOpen()).toBe(true);
  });

  it("is a command palette entry wherever the command is answered", () => {
    const history = vi.fn();
    expect(standingPaletteActions(history).map((a) => a.id)).not.toContain("claude-code-slots");
    offs.push(model.registerClaudeCodeSlotsCommand());
    const entry = standingPaletteActions(history).find((a) => a.id === "claude-code-slots");
    expect(entry?.label).toBe(S.commandPalette.claudeCodeSlots);
    entry!.run();
    expect(slotsOpen()).toBe(true);
    expect(history).not.toHaveBeenCalled();
  });
});

describe("what the list shows", () => {
  it("lists this organization's running runs, oldest first, and its queued ones by place", () => {
    const m = model.slotsModel(LIST, ROADMAPS);
    expect(m.running.map((r) => [r.run.id, r.roadmap])).toEqual([
      [3, 7],
      [4, null],
    ]);
    expect(m.queued.map((r) => [r.run.id, r.run.position])).toEqual([
      [5, 2],
      [6, 4],
    ]);
  });

  it("counts other organizations' slots and queued runs, never lists them", () => {
    const m = model.slotsModel(LIST, ROADMAPS);
    expect(m).toMatchObject({ capacity: 4, used: 3, othersRunning: 1, othersQueued: 2 });
    const { html } = body();
    expect(html).toContain(T.summary(3, 4));
    expect(html).toContain(T.others(1));
    expect(html).toContain(T.othersQueued(2));
    expect(html.match(/data-slot-run=/g)).toHaveLength(4);
  });

  it("gives each row its roadmap, employee, state, who queued it and its prompt", () => {
    const { html } = body();
    expect(html).toContain(T.roadmap(7));
    expect(html).toContain("Dev Lead");
    expect(html).toContain(T.working);
    expect(html).toContain(T.resumed);
    expect(html).toContain(T.queuedBy("alice"));
    // A run with no roadmap goes by its number; idle for twelve minutes; queued by an employee, by name.
    expect(html).toContain(T.run(4));
    expect(html).toContain(T.idle(12));
    expect(html).toContain(T.queuedBy("Dev Lead"));
    expect(html).toContain(`Review the change ${"x".repeat(80)}`);
    expect(html).not.toContain("x".repeat(200));
    expect(html).toContain("…");
    expect(html).toContain(T.position(2));
    expect(html).toContain(T.position(4));
    expect(html.indexOf(T.position(2))).toBeLessThan(html.indexOf(T.position(4)));
  });

  it("says when nothing of this organization holds or waits for a slot", () => {
    const empty = model.slotsModel({ ...LIST, runs: [], running: 2, queued: 0 }, new Map());
    const { html } = body({ state: { kind: "ready", model: empty, error: null } });
    expect(html).toContain(T.empty);
    expect(html).toContain(T.others(2));
  });

  it("shows loading, and a failure with a retry", () => {
    expect(body({ state: { kind: "loading" } }).html).toContain(T.loading);
    const failed = body({ state: { kind: "failed", message: "No organization acme." } });
    expect(failed.html).toContain("No organization acme.");
    expect(failed.html).toContain(T.retry);
  });
});

describe("Open", () => {
  it("hands the row to the opener, which opens the session dialog on that run", async () => {
    const { props, tree } = body();
    const [first] = find(tree, "data-slot-action", "open");
    (first!.props as { onClick: () => void }).onClick();
    expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ roadmap: 7 }));

    const ref = { projectId: "p", orgId: "acme", runId: 3, machine: null };
    open.openClaudeRun(ref);
    let seen: unknown = null;
    renderToStaticMarkup(
      createElement(() => {
        seen = open.useClaudeSessionTarget();
        return null;
      }),
    );
    expect(seen).toEqual({ kind: "run", run: ref });

    // Following a run only reads it, and attaches its Session at once when it runs.
    const views: string[] = [];
    await open.followRun(ref, (v) => views.push(v.kind), new AbortController().signal, {
      ask: async () => {
        throw new Error("a run is not asked through a link");
      },
      run: async () => run({ id: 3, sessionId: "cc-3" }),
      session: async (id) => ({ sessionId: id }) as unknown as SessionInfo,
      wait: async () => {},
    });
    expect(views).toEqual(["running"]);
  });
});

describe("Release", () => {
  it("asks first: the button only opens the confirmation", () => {
    const { props, tree } = body();
    const buttons = find(tree, "data-slot-action", "release");
    expect(buttons).toHaveLength(4);
    (buttons[0]!.props as { onClick: () => void }).onClick();
    expect(props.onAskRelease).toHaveBeenCalledWith(expect.objectContaining({ roadmap: 7 }));
  });

  it("says what releasing does, for a running run and a queued one", () => {
    const m = model.slotsModel(LIST, ROADMAPS);
    const confirm = (row: (typeof m.running)[number]) =>
      ReleaseConfirm({ row, names: NAMES, busy: false, onCancel: () => {}, onConfirm: () => {} });
    const running = confirm(m.running[0]!);
    expect((running.props as { confirmLabel: string }).confirmLabel).toBe(T.release);
    expect(renderToStaticMarkup((running.props as { children: ReactElement }).children)).toContain(
      T.confirmRunning(T.run(3), "Dev Lead"),
    );
    const queued = confirm(m.queued[0]!);
    expect(renderToStaticMarkup((queued.props as { children: ReactElement }).children)).toContain(
      T.confirmQueued(T.run(5), "Dev Lead"),
    );
  });

  it("ends the run once confirmed, then reads the list again", async () => {
    const calls: string[] = [];
    let ended = false;
    const states: string[] = [];
    const feed = new model.SlotsFeed(
      "p",
      "acme",
      (s) => states.push(s.kind === "ready" ? `ready:${s.model.running.length}` : s.kind),
      {
        list: async () => {
          calls.push("list");
          return ended ? { ...LIST, runs: LIST.runs.filter((r) => r.id !== 3), running: 2 } : LIST;
        },
        sessions: async () => {
          calls.push("sessions");
          return { roadmaps: [{ roadmap: 7, sessionId: "cs-roadmap-7" }] };
        },
        release: async (_p, _o, id) => {
          calls.push(`release:${id}`);
          ended = true;
        },
        schedule: () => () => {},
      },
    );
    await feed.refresh();
    await feed.release(3);
    feed.stop();
    expect(calls).toEqual(["sessions", "list", "release:3", "list"]);
    expect(states).toEqual(["ready:2", "ready:1"]);
  });
});

describe("refreshing", () => {
  it("reads again every few seconds while open, and stops when closed", async () => {
    const scheduled: number[] = [];
    let cancelled = 0;
    let reads = 0;
    let next: (() => void) | null = null;
    const feed = new model.SlotsFeed("p", "acme", () => {}, {
      list: async () => {
        reads += 1;
        return LIST;
      },
      sessions: async () => ({ roadmaps: [] }),
      release: async () => {},
      schedule: (fn, ms) => {
        scheduled.push(ms);
        next = fn;
        return () => {
          cancelled += 1;
        };
      },
    });
    await feed.refresh();
    expect(scheduled).toEqual([model.SLOTS_POLL_MS]);
    next!();
    await vi.waitFor(() => expect(reads).toBe(2));
    feed.stop();
    expect(cancelled).toBeGreaterThan(0);
  });

  it("keeps the last reading on screen when a refresh fails", async () => {
    let fail = false;
    const states: SlotsState[] = [];
    const feed = new model.SlotsFeed("p", "acme", (s) => states.push(s), {
      list: async () => {
        if (fail) throw new Error("down");
        return LIST;
      },
      sessions: async () => {
        throw new Error("no mapping");
      },
      release: async () => {},
      schedule: () => () => {},
    });
    await feed.refresh();
    fail = true;
    await feed.refresh();
    feed.stop();
    expect(states.map((s) => s.kind)).toEqual(["ready", "ready"]);
    const last = states[1]!;
    expect(last.kind === "ready" && last.error).toBeTruthy();
    // Without the mapping the rows simply have no roadmap.
    expect(last.kind === "ready" && last.model.running[0]!.roadmap).toBeNull();
  });
});

describe("the session dialog's slot line", () => {
  const D = S.company.roadmaps.sessionDialog.slot;
  const ref = { projectId: "p", orgId: "acme", runId: 3, machine: null };
  const running = {
    kind: "running" as const,
    session: { sessionId: "cc-3" } as unknown as SessionInfo,
    run: ref,
  };

  it("says the session holds a slot, and whether its program works or idles", () => {
    expect(slot.sessionSlotLine(running, null, NOW)?.text).toBe(D.held);
    expect(slot.sessionSlotLine(running, run({ id: 3, activity: "working" }), NOW)?.text).toBe(
      D.working,
    );
    expect(
      slot.sessionSlotLine(
        running,
        run({ id: 3, activity: "idle", idleSince: "2026-10-05T11:55:00Z" }),
        NOW,
      )?.text,
    ).toBe(D.idle(5));
  });

  it("says the place in line while queued", () => {
    expect(slot.sessionSlotLine({ kind: "queued", position: 3 }, null, NOW)?.text).toBe(
      D.queued(3),
    );
  });

  it("says it holds none once released, ended, or held outside the queue", () => {
    expect(slot.sessionSlotLine(running, run({ id: 3, status: "ended" }), NOW)?.text).toBe(D.none);
    expect(slot.sessionSlotLine({ kind: "ended", reason: null }, null, NOW)?.text).toBe(D.none);
    expect(
      slot.sessionSlotLine(
        { kind: "elsewhere", where: { pid: 1, cwd: null, tty: null, tmux: null } },
        null,
        NOW,
      )?.text,
    ).toBe(D.none);
    expect(slot.sessionSlotLine({ kind: "loading" }, null, NOW)).toBeNull();
  });

  it("is drawn under the dialog's title", () => {
    const html = renderToStaticMarkup(createElement(slot.SessionSlotLine, { view: running }));
    expect(html).toContain("data-claude-session-slot");
    expect(html).toContain(D.held);
  });
});
