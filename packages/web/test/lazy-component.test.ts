/**
 * Deferred components (src/lib/lazy-component.ts), the boundary their slots render them under
 * (src/components/ui/deferred.tsx) and the nav's prefetch target (src/shell/sidebar/router-link.tsx).
 *
 * - A deferred component draws the quiet fallback while its code is in flight and the target once
 *   it has arrived; preload() loads it once, however often it is asked.
 * - A failed load is a ChunkLoadError, and is not asked again within the document.
 * - preloadComponent() leaves a component that was never deferred alone.
 * - The boundary stops every error below it: a failed load (its own or a plugin's dynamic import)
 *   shows the load notice, any other error the part-failed notice, each with a Retry — a reload
 *   for a load, a remount otherwise; a changed reset key forgets the failure.
 * - A nav row prefetches the page its address lands on: the first rooted route that matches, never
 *   the catch-all home.
 */
import { createElement } from "react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Deferred } from "../src/components/ui/deferred";
import {
  ChunkLoadError,
  isChunkLoadError,
  lazyComponent,
  preloadComponent,
} from "../src/lib/lazy-component";
import { S } from "../src/lib/strings";
import { pageForHref } from "../src/shell/sidebar/router-link";
import type { ShellPage } from "../src/shell";

function Greeting({ name }: { name: string }) {
  return createElement("p", null, `hello ${name}`);
}

/** A module loader that counts its calls and fails the first `failures` of them. */
function loader(failures = 0) {
  const state = { calls: 0 };
  const load = () => {
    state.calls += 1;
    return state.calls <= failures
      ? Promise.reject(new Error("network"))
      : Promise.resolve({ Greeting });
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

  it("leaves a component that was never deferred alone", () => {
    expect(() => preloadComponent(Greeting)).not.toThrow();
    expect(() => preloadComponent(undefined)).not.toThrow();
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

  it("treats a dynamic import the browser could not fetch as a failed load", () => {
    const chromium = new TypeError(
      "Failed to fetch dynamically imported module: /api/plugins/x.js",
    );
    expect(isChunkLoadError(chromium)).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
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
