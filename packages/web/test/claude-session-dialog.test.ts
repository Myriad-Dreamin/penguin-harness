/**
 * Opening a Claude Code session in place (features/company/claude-session-open.ts and
 * claude-session-dialog.tsx): a plain click on Open session or on a channel message's session
 * link opens the dialog instead of navigating, a modified click is the browser's; the dialog's
 * three states each say what they should; a queued run attaches by itself once it starts; and
 * closing the dialog sends nothing that would end the session — every request is a read.
 *
 * Node environment, no DOM: clicks are driven through the handlers with a stand-in event, the
 * dialog's body is rendered to static markup, and the chat page's terminal view is stood in by
 * a marker naming the Session it was handed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { MouseEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SessionInfo } from "@prismshadow/penguin-server/api";
import { json, stubFetch } from "./helpers/fetch";

vi.mock("../src/features/chat/session-surface-view", () => ({
  SessionSurfaceView: (props: { session: { sessionId: string } }) =>
    createElement("i", { "data-terminal": props.session.sessionId }),
}));

const open = await import("../src/features/company/claude-session-open");
const { ClaudeSessionBody } = await import("../src/features/company/claude-session-dialog");
const { RoadmapSessionLink } = await import("../src/features/company/roadmap-session");
const { ChannelMessageBody } = await import("../src/features/company/channel-markdown");
const { S } = await import("../src/lib/strings");

const {
  OPEN_POLL_MS,
  claudeSessionLinkBehavior,
  claudeSessionPath,
  closeClaudeSession,
  followOpen,
  machineOfOpenPath,
  onClaudeSessionClick,
  registerClaudeSessionHost,
  useClaudeSessionTarget,
} = open;

const SESSION_LINK =
  "/api/claude-code/open/1a2b3c4d-0000-4000-8000-00000000abcd?org=acme&agent=dev";
const ROADMAP_LINK = "/api/claude-code/open?org=acme&project=p&roadmap=3";

/** A click as React hands one to a handler: a left button with no modifier unless told otherwise. */
function click(
  over: { button?: number; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean } = {},
) {
  const preventDefault = vi.fn();
  const event = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    preventDefault,
    ...over,
  } as unknown as MouseEvent<HTMLAnchorElement>;
  return { event, preventDefault };
}

/** The link the dialog is open on, read the way the host reads it. */
function openPath(): string | null {
  let seen: string | null = null;
  const Probe = () => {
    const target = useClaudeSessionTarget();
    seen = target?.kind === "link" ? target.path : null;
    return null;
  };
  renderToStaticMarkup(createElement(Probe));
  return seen;
}

const RUN = { projectId: "p", orgId: "acme", runId: 7, machine: null };

const session = (sessionId: string) =>
  ({ sessionId, surface: "claude-code" }) as unknown as SessionInfo;

let unregister: (() => void) | null = null;
afterEach(() => {
  unregister?.();
  unregister = null;
  closeClaudeSession();
});

describe("which links open the dialog", () => {
  it("is the open route by id or by roadmap, on this origin, behind a machine or not", () => {
    const origin = "http://localhost";
    expect(claudeSessionPath(SESSION_LINK, origin)).toBe(SESSION_LINK);
    expect(claudeSessionPath(ROADMAP_LINK, origin)).toBe(ROADMAP_LINK);
    expect(claudeSessionPath(`/server/box${ROADMAP_LINK}`, origin)).toBe(
      `/server/box${ROADMAP_LINK}`,
    );
    expect(claudeSessionPath(`${origin}${SESSION_LINK}`, origin)).toBe(SESSION_LINK);
    expect(claudeSessionPath(`https://elsewhere.example${SESSION_LINK}`, origin)).toBeNull();
    expect(claudeSessionPath("/api/claude-code/opener", origin)).toBeNull();
    expect(claudeSessionPath("/api/claude-code/open/a/b", origin)).toBeNull();
    expect(claudeSessionPath("https://example.com/", origin)).toBeNull();
    expect(claudeSessionPath(undefined, origin)).toBeNull();
    expect(machineOfOpenPath(`/server/box${ROADMAP_LINK}`)).toBe("box");
    expect(machineOfOpenPath(ROADMAP_LINK)).toBeNull();
  });
});

describe("clicking Open session", () => {
  it("opens the dialog on the link instead of following it", () => {
    unregister = registerClaudeSessionHost();
    const html = renderToStaticMarkup(
      createElement(RoadmapSessionLink, {
        session: {
          href: ROADMAP_LINK,
          agentId: "dev",
          projectId: "p",
          orgId: "acme",
          claudeSessionId: "1a2b3c4d-0000-4000-8000-00000000abcd",
        },
        name: "Dev",
      }),
    );
    // The link is still a link: a new tab, or the app without a dialog, lands on its page.
    expect(html).toContain(`href="${ROADMAP_LINK.replace(/&/g, "&amp;")}"`);
    const { event, preventDefault } = click();
    onClaudeSessionClick(event, ROADMAP_LINK);
    expect(preventDefault).toHaveBeenCalled();
    expect(openPath()).toBe(ROADMAP_LINK);
  });

  it("leaves a modified click, another button and a page without the dialog to the browser", () => {
    unregister = registerClaudeSessionHost();
    for (const over of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
      const { event, preventDefault } = click(over);
      onClaudeSessionClick(event, ROADMAP_LINK);
      expect(preventDefault, JSON.stringify(over)).not.toHaveBeenCalled();
    }
    expect(openPath()).toBeNull();
    unregister();
    unregister = null;
    const { event, preventDefault } = click();
    onClaudeSessionClick(event, ROADMAP_LINK);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(openPath()).toBeNull();
  });
});

describe("a session link in a channel message", () => {
  it("opens the dialog on a plain click, and every other link keeps a new tab", () => {
    unregister = registerClaudeSessionHost();
    const other = claudeSessionLinkBehavior("https://example.com/");
    expect(other).toEqual({ target: "_blank", rel: "noreferrer" });
    const behavior = claudeSessionLinkBehavior(SESSION_LINK);
    expect(behavior).toMatchObject({ target: "_blank", rel: "noreferrer" });
    const { event, preventDefault } = click();
    behavior.onClick!(event);
    expect(preventDefault).toHaveBeenCalled();
    expect(openPath()).toBe(SESSION_LINK);
  });

  it("renders the link in the message as a link", () => {
    const html = renderToStaticMarkup(
      createElement(ChannelMessageBody, { text: `Done. [Open the session](${SESSION_LINK})` }),
    );
    expect(html).toContain(`href="${SESSION_LINK.replace(/&/g, "&amp;")}"`);
    expect(html).toContain('target="_blank"');
  });
});

describe("the dialog's content", () => {
  const T = S.company.roadmaps.sessionDialog;
  const body = (view: Parameters<typeof ClaudeSessionBody>[0]["view"]) =>
    renderToStaticMarkup(
      createElement(ClaudeSessionBody, {
        view,
        targetKey: `link:${ROADMAP_LINK}`,
        onRetry: () => {},
      }),
    );

  it("attaches the running Session's terminal, kept outside the dialog", () => {
    expect(body({ kind: "running", session: session("cc-7"), run: RUN })).toContain(
      'data-resident-session="cc-7"',
    );
  });

  it("says the place in line while queued, and that it is starting when there is none", () => {
    expect(body({ kind: "queued", position: 2 })).toContain(T.queued(2));
    expect(body({ kind: "queued", position: null })).toContain(T.queued(null));
    expect(body({ kind: "queued", position: 2 })).not.toContain("data-resident-session");
  });

  it("names the process, terminal and tmux pane that hold a session elsewhere", () => {
    const html = body({
      kind: "elsewhere",
      where: {
        pid: 4242,
        cwd: "/work/repo",
        tty: "/dev/pts/7",
        tmux: { socket: "/tmp/tmux-1/default", pane: "%3" },
      },
    });
    expect(html).toContain(T.elsewhere);
    expect(html).toContain("4242");
    expect(html).toContain("/dev/pts/7");
    expect(html).toContain("%3");
    expect(html).toContain("/work/repo");
    expect(html).not.toContain("data-resident-session");
  });

  it("offers to try again when the run ended or the link failed", () => {
    expect(body({ kind: "ended", reason: "claude not found" })).toContain(T.retry);
    expect(body({ kind: "failed", message: "No organization acme." })).toContain(
      "No organization acme.",
    );
  });
});

describe("following the link", () => {
  it("attaches by itself once a queued run starts", async () => {
    const views: string[] = [];
    const polls = [
      { id: 1, status: "queued" as const, position: 1 },
      { id: 1, status: "running" as const, sessionId: "cc-9" },
    ];
    const waits: number[] = [];
    await followOpen(
      ROADMAP_LINK,
      (v) =>
        views.push(v.kind === "running" ? `running:${v.session.sessionId}` : JSON.stringify(v)),
      new AbortController().signal,
      {
        ask: async () => ({
          state: "queued",
          runId: 1,
          position: 2,
          projectId: "p",
          orgId: "acme",
        }),
        run: async () => polls.shift()!,
        session: async (id) => session(id),
        wait: async (ms) => {
          waits.push(ms);
        },
      },
    );
    expect(views).toEqual([
      JSON.stringify({ kind: "queued", position: 2 }),
      JSON.stringify({ kind: "queued", position: 1 }),
      "running:cc-9",
    ]);
    expect(waits).toEqual([OPEN_POLL_MS, OPEN_POLL_MS]);
  });

  it("asks the machine the link names, and only ever reads", async () => {
    const fake = stubFetch((r) => {
      if (r.path === "/api/claude-code/open")
        return json({ state: "queued", runId: 4, projectId: "p", orgId: "acme", machine: "box" });
      if (r.path.endsWith("/claude-code/runs/4"))
        return json({ id: 4, status: "running", sessionId: "cc-4" });
      if (r.path === "/api/sessions/cc-4") return json({ session: session("cc-4") });
      return json({ error: { code: "not_found", message: "no" } }, 404);
    });
    const views: string[] = [];
    await followOpen(
      `/server/box${ROADMAP_LINK}`,
      (v) => views.push(v.kind),
      new AbortController().signal,
      { ...open.OPEN_DEPS, wait: async () => {} },
    );
    expect(views).toEqual(["queued", "running"]);
    // The terminal's lookup starts beside the Session's read, on the same machine.
    expect(fake.requests.map((r) => [r.method, r.machine, r.path]).sort()).toEqual([
      ["GET", "box", "/api/claude-code/open"],
      ["GET", "box", "/api/projects/p/organizations/acme/claude-code/runs/4"],
      ["GET", "box", "/api/sessions/cc-4"],
      ["GET", "box", "/api/sessions/cc-4/surface"],
    ]);
  });

  it("stops at the close, and sends nothing that would end the session", async () => {
    const fake = stubFetch(() =>
      json({ state: "queued", runId: 1, position: 1, projectId: "p", orgId: "acme" }),
    );
    const closing = new AbortController();
    const views: string[] = [];
    const following = followOpen(
      ROADMAP_LINK,
      (v) => {
        views.push(v.kind);
        closing.abort(); // The reader closes the dialog while the run waits.
      },
      closing.signal,
    );
    await following;
    expect(views).toEqual(["queued"]);
    expect(fake.requests.map((r) => [r.method, r.path])).toEqual([
      ["GET", "/api/claude-code/open"],
    ]);
  });
});
