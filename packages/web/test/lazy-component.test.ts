/**
 * Deferred components (src/lib/lazy-component.ts), the boundary their slots render them under
 * (src/components/ui/deferred.tsx) and the nav's prefetch target (src/shell/sidebar/router-link.tsx).
 *
 * - A deferred component draws the quiet fallback while its code is in flight and the target once
 *   it has arrived; preload() loads it once, however often it is asked.
 * - A failed load is a ChunkLoadError — a rejected or throwing loader, or one that resolves to no
 *   component — and is not asked again within the document.
 * - preloadComponent() leaves a component that was never deferred alone.
 * - A slot owner's componentOf() keeps a component as it is and defers a loader, once per loader,
 *   so its preload() is what the nav's hover calls; an object component is never taken for one.
 * - The boundary stops every error below it: a failed load shows the load notice, any other error
 *   (a dynamic import's own rejection included: only the host's loader path marks a load) the
 *   part-failed notice, each with a Retry — a reload for a load, a remount otherwise; a changed
 *   reset key forgets the failure.
 * - A nav row prefetches the page its address lands on: the first rooted route that matches, never
 *   the catch-all home.
 * - Every page renders under a boundary of its own, keyed by the page: a navigation into a page
 *   still loading never holds the page being left on screen, where its effects would act on the
 *   route it was drawn for (shell/router.tsx pageElement).
 */
import { createElement, memo } from "react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { Deferred } from "../src/components/ui/deferred";
import {
  ChunkLoadError,
  componentOf,
  isChunkLoadError,
  isSeparable,
  lazyComponent,
  preloadComponent,
} from "../src/lib/lazy-component";
import { S } from "../src/lib/strings";
import { pageForHref } from "../src/shell/sidebar/router-link";
import { pageElement } from "../src/shell/router";
import type { ShellPage } from "../src/shell";

function Greeting({ name }: { name: string }) {
  return createElement("p", null, `hello ${name}`);
}

/** A component loader that counts its calls and fails the first `failures` of them. */
function loader(failures = 0) {
  const state = { calls: 0 };
  const load = () => {
    state.calls += 1;
    return state.calls <= failures
      ? Promise.reject(new Error("network"))
      : Promise.resolve(Greeting);
  };
  return { state, load };
}

const inBoundary = (node: ReactElement) =>
  renderToStaticMarkup(createElement(Deferred, { fallback: "pending", children: node }));

describe("a deferred component", () => {
  it("draws the fallback while its code loads, then the target", async () => {
    const { state, load } = loader();
    const Lazy = lazyComponent(load, "Greeting");
    expect(inBoundary(createElement(Lazy, { name: "a" }))).toBe("pending");
    await Lazy.preload();
    expect(inBoundary(createElement(Lazy, { name: "a" }))).toBe("<p>hello a</p>");
    // Once loaded it renders the target itself: no suspension, the same element type.
    expect((Lazy({ name: "b" }) as ReactElement).type).toBe(Greeting);
    expect(state.calls).toBe(1);
  });

  it("loads once however often it is asked", async () => {
    const { state, load } = loader();
    const Lazy = lazyComponent(load, "Greeting");
    const [a, b] = await Promise.all([Lazy.preload(), Lazy.preload(), Lazy.preload()]);
    expect(a).toBe(Greeting);
    expect(b).toBe(Greeting);
    preloadComponent(Lazy);
    expect(state.calls).toBe(1);
  });

  it("marks a failed load as one, and does not ask again within the document", async () => {
    const { state, load } = loader(1);
    const Lazy = lazyComponent(load, "Greeting");
    await expect(Lazy.preload()).rejects.toBeInstanceOf(ChunkLoadError);
    // The browser keeps a failed import for the document's life; the boundary's retry reloads.
    await expect(Lazy.preload()).rejects.toBeInstanceOf(ChunkLoadError);
    expect(state.calls).toBe(1);
    // As a hint, a failed preload is swallowed.
    expect(() => preloadComponent(Lazy)).not.toThrow();
  });

  it("marks a loader that throws, or resolves to nothing, as a failed load", async () => {
    const throwing = lazyComponent(() => {
      throw new Error("sync");
    }, "Throwing");
    await expect(throwing.preload()).rejects.toBeInstanceOf(ChunkLoadError);
    const empty = lazyComponent(
      () => Promise.resolve(undefined as unknown as typeof Greeting),
      "Empty",
    );
    await expect(empty.preload()).rejects.toBeInstanceOf(ChunkLoadError);
  });

  it("leaves a component that was never deferred alone", () => {
    expect(() => preloadComponent(Greeting)).not.toThrow();
    expect(() => preloadComponent(undefined)).not.toThrow();
  });
});

describe("a slot owner's code half", () => {
  it("is the component itself when the contributor bound one", () => {
    expect(componentOf(Greeting, "x")).toBe(Greeting);
    const Memo = memo(Greeting);
    expect(isSeparable(Memo)).toBe(false);
    expect(componentOf(Memo, "x")).toBe(Memo);
  });

  it("is one deferred component per loader, preloadable, loading once", async () => {
    const { state, load } = loader();
    const half = { load };
    expect(isSeparable(half)).toBe(true);
    const Page = componentOf(half, "x.page");
    expect(componentOf(half, "x.page")).toBe(Page);
    expect(state.calls).toBe(0);
    preloadComponent(Page);
    expect(await (Page as unknown as { preload(): Promise<unknown> }).preload()).toBe(Greeting);
    expect(inBoundary(createElement(Page, { name: "p" }))).toBe("<p>hello p</p>");
    expect(state.calls).toBe(1);
  });

  it("marks a loader's rejection — a plugin chunk the browser could not fetch — as a failed load", async () => {
    const lost = new TypeError("Failed to fetch dynamically imported module: /api/plugins/x.js");
    const Page = componentOf({ load: () => Promise.reject(lost) }, "x.page");
    const error = await (Page as unknown as { preload(): Promise<unknown> })
      .preload()
      .catch((e: unknown) => e);
    expect(isChunkLoadError(error)).toBe(true);
    expect((error as Error).cause).toBe(lost);
  });
});

describe("the boundary deferred code renders under", () => {
  /** The boundary class inside `<Deferred>`, driven directly: server rendering has no error boundaries. */
  interface BoundaryInstance {
    state: unknown;
    props: { resetKey?: unknown };
    render(): ReactElement;
    setState(state: unknown): void;
    componentDidUpdate(prev: { resetKey?: unknown }): void;
  }
  const boundaryFor = (resetKey?: unknown) => {
    const element = Deferred({ children: "child", resetKey }) as ReactElement<{
      resetKey?: unknown;
    }>;
    const Boundary = element.type as unknown as (new (props: unknown) => BoundaryInstance) & {
      getDerivedStateFromError(error: unknown): unknown;
    };
    return { Boundary, instance: new Boundary(element.props) };
  };

  it("shows a Retry for a load that failed", () => {
    const { Boundary, instance } = boundaryFor();
    const error = new ChunkLoadError("Greeting", new Error("network"));
    expect(isChunkLoadError(error)).toBe(true);
    instance.state = Boundary.getDerivedStateFromError(error);
    const html = renderToStaticMarkup(instance.render());
    expect(html).toContain('role="alert"');
    expect(html).toContain(S.common.loadPartFailed);
    expect(html).toContain(S.common.retry);
  });

  it("takes only the host's own marked failure for a failed load", () => {
    expect(isChunkLoadError(new ChunkLoadError("x", null))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(false);
    expect(isChunkLoadError(new TypeError("undefined is not a function"))).toBe(false);
  });

  it("stops a render error too, with a Retry that remounts the part", () => {
    const { Boundary, instance } = boundaryFor();
    const error = new TypeError("a bug, not a lost chunk");
    instance.state = { attempt: 0, ...(Boundary.getDerivedStateFromError(error) as object) };
    const html = renderToStaticMarkup(instance.render());
    expect(html).toContain('role="alert"');
    expect(html).toContain(S.common.partFailed);
    expect(html).not.toContain(S.common.loadPartFailed);
    let next: unknown = null;
    instance.setState = (update: unknown) => {
      next =
        typeof update === "function" ? (update as (s: unknown) => unknown)(instance.state) : update;
    };
    (instance as unknown as { retry(): void }).retry();
    expect(next).toMatchObject({ attempt: 1 });
    expect(typeof (next as { error: unknown }).error).toBe("symbol");
  });

  it("forgets a failure when its reset key changes (the router passes the path)", () => {
    const { Boundary, instance } = boundaryFor("/agents");
    instance.state = Boundary.getDerivedStateFromError(new ChunkLoadError("x", null));
    let next: unknown = "unset";
    instance.setState = (state: unknown) => {
      next = state;
    };
    instance.props = { ...instance.props, resetKey: "/agents" };
    instance.componentDidUpdate({ ...instance.props });
    expect(next).toBe("unset");
    instance.props = { ...instance.props, resetKey: "/models" };
    instance.componentDidUpdate({ ...instance.props, resetKey: "/agents" });
    expect(typeof (next as { error: unknown }).error).toBe("symbol");
  });
});

describe("the page a nav row prefetches", () => {
  const page = (key: string, path: string): ShellPage =>
    ({
      id: key,
      key,
      path,
      frame: "shell",
      nav: "none",
      admin: false,
      released: true,
      order: 0,
      Component: Greeting,
    }) as unknown as ShellPage;
  const pages = [
    page("agents", "/agents"),
    page("agent-settings", "/agents/:agentId/settings"),
    page("org", "/org/*"),
    page("org-proposals", "proposals/:number?"),
    page("home", "*"),
  ];

  it("is the first rooted route that answers the row's address", () => {
    expect(pageForHref(pages, "/agents")?.key).toBe("agents");
    expect(pageForHref(pages, "/agents/a1/settings")?.key).toBe("agent-settings");
    expect(pageForHref(pages, "/org/p/acme/overview")?.key).toBe("org");
  });

  it("is never the catch-all home, nor a page relative to an organization", () => {
    expect(pageForHref(pages, "/nowhere")).toBeUndefined();
    expect(pageForHref(pages, "/proposals")).toBeUndefined();
  });
});

describe("a page's route element", () => {
  it("is a boundary of the page's own: one element type, keyed by the page", () => {
    const Lazy = lazyComponent(loader().load, "Greeting");
    const chat = pageElement("chat.page", Greeting as never);
    const org = pageElement("company.org", Lazy as never);
    expect(chat.type).toBe(org.type);
    expect(chat.key).toBe("chat.page");
    expect(org.key).toBe("company.org");
  });

  it("draws the page under that boundary, fallback first while its code loads", async () => {
    const Lazy = lazyComponent(loader().load, "Greeting");
    const Page = () => createElement(Lazy, { name: "org" });
    const draw = () =>
      renderToStaticMarkup(
        createElement(MemoryRouter, { initialEntries: ["/org"] }, pageElement("org", Page)),
      );
    expect(draw()).not.toContain("hello org");
    await Lazy.preload();
    expect(draw()).toBe("<p>hello org</p>");
  });
});
