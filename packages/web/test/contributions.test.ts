/**
 * The server's contributions folded into the shell's page table (shell/contributions.tsx).
 *
 * - The store asks once per signed-in user; a failure leaves no answer, so the table is the
 *   compiled one; a user change drops the last answer and asks again, and a late answer for
 *   the user just left is dropped; signing out clears it.
 * - The merge appends iframe pages after the compiled ones; a compiled page wins a key or
 *   path clash; a builtin renderer is skipped (this build carries none); an entry without a
 *   key, a path or an iframe src is skipped. A page's title, Chinese title, glyph and parent
 *   are kept when they are strings, and its frame is named by its title.
 * - A merged iframe page is routed at its path and draws a sandboxed frame of its src.
 * - Safe mode is the one switch: the provider tells the store nobody is signed in, so the table
 *   is the compiled one with nothing in flight; off again, the signed-in user's request is due.
 */
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import type { ContributionsResponse } from "@prismshadow/penguin-server/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  contributedPagesOf,
  createContributionsStore,
  ShellPagesProvider,
  useShellPages,
  useShellPagesPending,
} from "../src/shell/contributions";
import { shellDeps } from "../src/shell/deps";
import type { ShellDeps } from "../src/shell/deps";
import { setSafeMode } from "../src/rescue/safe-mode";
import type { ShellPage } from "../src/shell";
import { ThemeProvider } from "../src/state/theme";

// The provider reads the signed-in user and asks the server through these.
vi.mock("../src/state/auth", () => ({ useAuth: () => ({ user: { userId: "bob" } }) }));
vi.mock("../src/api/endpoints", () => ({
  getContributions: vi.fn(() => new Promise<never>(() => undefined)),
}));

const Blank: ComponentType = () => null;

const COMPILED: ShellPage[] = [
  {
    id: "agents.page",
    key: "agents",
    path: "/agents",
    frame: "shell",
    nav: "main",
    admin: false,
    released: true,
    order: 20,
    Component: Blank,
  },
  {
    id: "terminal.page",
    key: "terminal",
    path: "/terminal",
    frame: "bare",
    nav: "none",
    admin: false,
    released: true,
    order: 100,
    Component: Blank,
  },
];

const frame = (src: string) => ({ iframe: { src, namespace: "hello" } });

/** An answer as the server might send it: entries the app must check, malformed ones included. */
function answer(pages: readonly object[]): ContributionsResponse {
  return { pages: pages as ContributionsResponse["pages"], agentTabs: [], sessionTabs: [] };
}

/** A fetch whose answers the test hands out by hand, in order. */
function manualFetch() {
  const calls: Array<{ resolve: (r: ContributionsResponse) => void; reject: (e: Error) => void }> =
    [];
  const fetch = vi.fn(
    () => new Promise<ContributionsResponse>((resolve, reject) => calls.push({ resolve, reject })),
  );
  return { fetch, calls };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("createContributionsStore", () => {
  it("asks once per signed-in user and holds the answer", async () => {
    const { fetch, calls } = manualFetch();
    const store = createContributionsStore(fetch);
    const seen = vi.fn();
    store.subscribe(seen);
    store.setUser("alice");
    store.setUser("alice");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.current()).toEqual({ user: "alice", answer: null, pending: true });
    const res = answer([{ id: "x.hello", from: "x", key: "hello" }]);
    calls[0]!.resolve(res);
    await settle();
    expect(store.current()).toEqual({ user: "alice", answer: res, pending: false });
    expect(seen).toHaveBeenCalled();
  });

  it("a failed request leaves no answer, so the table is the compiled one", async () => {
    const { fetch, calls } = manualFetch();
    const store = createContributionsStore(fetch);
    store.setUser("alice");
    calls[0]!.reject(new Error("500"));
    await settle();
    expect(store.current()).toEqual({ user: "alice", answer: null, pending: false });
    expect(contributedPagesOf(COMPILED, store.current().answer)).toBe(COMPILED);
  });

  it("a user change drops the last answer and asks again; a late answer for the old user is dropped", async () => {
    const { fetch, calls } = manualFetch();
    const store = createContributionsStore(fetch);
    store.setUser("alice");
    calls[0]!.resolve(answer([{ id: "a", from: "x", key: "a" }]));
    await settle();
    store.setUser("bob");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.current()).toEqual({ user: "bob", answer: null, pending: true });

    store.setUser("carol");
    calls[1]!.resolve(answer([{ id: "b", from: "x", key: "b" }]));
    await settle();
    expect(store.current()).toEqual({ user: "carol", answer: null, pending: true });

    store.setUser(null);
    expect(store.current()).toEqual({ user: null, answer: null, pending: false });
    calls[2]!.resolve(answer([]));
    await settle();
    expect(store.current().answer).toBeNull();
  });
});

describe("contributedPagesOf", () => {
  it("returns the compiled table as it is without an answer", () => {
    expect(contributedPagesOf(COMPILED, null)).toBe(COMPILED);
    expect(contributedPagesOf(COMPILED, answer([]))).toBe(COMPILED);
  });

  it("appends an iframe page after the compiled ones, inside the shell", () => {
    const merged = contributedPagesOf(
      COMPILED,
      answer([
        {
          id: "hello.page",
          from: "HelloModule",
          key: "hello",
          path: "/hello",
          nav: "main",
          admin: false,
          renderer: frame("/hello.html"),
        },
      ]),
    );
    expect(merged.slice(0, 2)).toEqual(COMPILED);
    expect(merged[2]).toMatchObject({
      id: "hello.page",
      key: "hello",
      path: "/hello",
      frame: "shell",
      nav: "main",
      admin: false,
      released: true,
      order: 101,
    });
  });

  it("keeps a page's nav name, glyph and parent when they are strings, and names its frame by its title", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    const merged = contributedPagesOf(
      COMPILED,
      answer([
        {
          id: "a",
          from: "x",
          key: "a",
          path: "/a",
          nav: "main",
          parent: "agents",
          title: "Hello World",
          titleZh: "你好世界",
          icon: "sparkle",
          renderer: frame("/a.html"),
        },
        {
          id: "b",
          from: "x",
          key: "b",
          path: "/b",
          parent: 7,
          title: null,
          icon: [],
          renderer: frame("/b.html"),
        },
      ]),
    );
    expect(merged[2]).toMatchObject({
      key: "a",
      parent: "agents",
      title: "Hello World",
      titleZh: "你好世界",
      icon: "sparkle",
    });
    expect(merged[3]).not.toHaveProperty("parent");
    expect(merged[3]).not.toHaveProperty("title");
    expect(merged[3]).not.toHaveProperty("icon");
    const html = renderToStaticMarkup(
      createElement(ThemeProvider, null, createElement(merged[2]!.Component)),
    );
    expect(html).toContain('title="Hello World"');
  });

  it("a compiled page wins a key or a path clash, and the first of two contributed ones wins", () => {
    const merged = contributedPagesOf(
      COMPILED,
      answer([
        { id: "a", from: "x", key: "agents", path: "/elsewhere", renderer: frame("/a.html") },
        { id: "b", from: "x", key: "mine", path: "/terminal", renderer: frame("/b.html") },
        { id: "c", from: "x", key: "login", path: "/login", renderer: frame("/c.html") },
        { id: "d", from: "x", key: "d", path: "/d", renderer: frame("/d.html") },
        { id: "e", from: "x", key: "d", path: "/e", renderer: frame("/e.html") },
      ]),
    );
    expect(merged.map((p) => p.id)).toEqual(["agents.page", "terminal.page", "d"]);
  });

  it("skips a builtin renderer, and an entry without a key, a path or an iframe src", () => {
    const merged = contributedPagesOf(
      COMPILED,
      answer([
        { id: "a", from: "x", key: "a", path: "/a", renderer: { builtin: "AgentsPage" } },
        { id: "b", from: "x", path: "/b", renderer: frame("/b.html") },
        { id: "c", from: "x", key: "c", renderer: frame("/c.html") },
        { id: "d", from: "x", key: "d", path: "d", renderer: frame("/d.html") },
        { id: "e", from: "x", key: "e", path: "/e", renderer: { iframe: { namespace: "e" } } },
        { id: "f", from: "x", key: "f", path: "/f" },
      ]),
    );
    expect(merged.map((p) => p.id)).toEqual(["agents.page", "terminal.page"]);
  });

  it("routes an iframe page at its path and draws a sandboxed frame of its src", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    const merged = contributedPagesOf(
      COMPILED,
      answer([
        {
          id: "hello.page",
          from: "HelloModule",
          key: "hello",
          path: "/hello",
          nav: "none",
          admin: false,
          renderer: frame("/plugins/hello/index.html"),
        },
      ]),
    );
    const html = renderToStaticMarkup(
      createElement(
        ThemeProvider,
        null,
        createElement(
          MemoryRouter,
          { initialEntries: ["/hello"] },
          createElement(
            Routes,
            null,
            merged.map(({ id, path, Component }) =>
              createElement(Route, { key: id, path, element: createElement(Component) }),
            ),
          ),
        ),
      ),
    );
    expect(html).toContain('src="/plugins/hello/index.html"');
    expect(html).toContain('title="hello"');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin');
  });
});

describe("safe mode", () => {
  afterEach(() => setSafeMode(false));

  /** The provider's table and pending flag as its first render sees them, before any effect. */
  function firstRender(): string {
    function Probe() {
      const pages = useShellPages();
      return createElement(
        "p",
        null,
        `${pages.map((p) => p.key).join(",")} pending=${String(useShellPagesPending())}`,
      );
    }
    const Root = shellDeps.provide({ pages: COMPILED } as unknown as ShellDeps, () =>
      createElement(ShellPagesProvider, null, createElement(Probe)),
    );
    return renderToStaticMarkup(createElement(Root));
  }

  it("skips every contribution: the table is the compiled one and nothing is in flight", () => {
    setSafeMode(true);
    expect(firstRender()).toBe("<p>agents,terminal pending=false</p>");
  });

  it("leaving it makes the signed-in user's request due again", () => {
    setSafeMode(true);
    firstRender();
    setSafeMode(false);
    expect(firstRender()).toBe("<p>agents,terminal pending=true</p>");
  });
});
