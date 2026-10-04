/**
 * The one consumer of GET /api/contributions: what the server's modules and plugins contribute
 * to the web slots, as data, folded into the shell's page table. The fetch, its failure and the
 * merge all live here, so the interface can be swapped by changing this file alone; the router
 * and the sidebar read the merged table through `useShellPages()` and never learn where a page
 * came from. The rest of the answer is handed out as it came (`useContributions()`): the
 * session surfaces the chat page offers and draws, and the module plugins' quick starts the
 * Plugins page pre-fills, which also asks for everything again after a plugin change.
 *
 * The module tree boots before anyone signs in and does no network, so the contributions are
 * state of the signed-in session, held by a provider under the shell's root: fetched once per
 * user, dropped and asked again when the user changes. Until the server answers — and if it
 * never does — the table is exactly the compiled one; no contributed page is load-bearing.
 *
 * A contributed page names a renderer instead of carrying a component. `iframe` is drawn by
 * the shell's frame page (shell/frame-page.tsx). `builtin` names a component a module
 * contributed to `ShellModule.pageRenderers`; a name nobody contributed is skipped — there is
 * nothing to draw it with. A compiled page wins over a contributed one
 * with the same key or path: a plugin adds pages here, it does not shadow the app's own.
 *
 * The modules' page removals (`ShellModule.pageRemovals`, in the module tree from the first
 * render — a plugin's arrive with its web modules) apply to the merged table, the app's own pages
 * and contributed ones alike: such a page leaves the table with the routes under its path and the
 * pages under it (removedPagesOf), so it has no nav row and its paths fall to the catch-all,
 * company mode's `home` page. Neither that page nor the pages it leads to can be removed
 * (page-table.ts HOME_PATHS).
 *
 * Safe mode (rescue/safe-mode.ts) is the one switch over all of it: while it is on, the store is
 * told nobody is signed in, so nothing is asked and the table is the compiled one — no
 * company-mode page, no session surface, no quick start, and a refresh asks nothing; leaving it
 * asks again. (A safe-mode boot assembles no plugin either, so no plugin's removal applies.)
 *
 * The answer also forwards the enabled plugins' web modules (`webModules`); those are not read
 * here but by the boot, which assembles them into the module tree before the first render
 * (plugins/forwarded.ts, whose request is this store's first one, so it is not repeated). Each
 * answer is handed back there, to keep the boot's cached list current and to reload once when
 * the tree holds another list.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ComponentType, ReactNode } from "react";
import type {
  ContributionsResponse,
  RendererRef,
  SessionSurfaceSummary,
} from "@prismshadow/penguin-server/api";
import * as api from "../api/endpoints";
import { reconcileWebModules, takeBootContributions } from "../plugins/forwarded";
import { useSafeMode } from "../rescue/safe-mode";
import { useAuth } from "../state/auth";
import { shellDeps } from "./deps";
import { FramePage } from "./frame-page";
import { parentedPagesOf, removedPagesOf } from "./page-table";
import type { ShellPage } from "./page-table";

/** What the store holds for the current user. */
export interface ContributionsState {
  /** Whose state this is. */
  user: string | null;
  /** The server's answer; null until it has answered, and for good when it failed. */
  answer: ContributionsResponse | null;
  /** A signed-in user's request is in flight: a path that is not in the table yet may still arrive. */
  pending: boolean;
}

export interface ContributionsStore {
  /** The signed-in user (null = nobody): a change drops the last user's answer and asks again. */
  setUser(userId: string | null): void;
  /**
   * Asks again for the signed-in user (after a plugin is installed or removed) and answers the
   * new response, or null when nobody is signed in or the request failed — which keeps the
   * answer held so far.
   */
  refresh(): Promise<ContributionsResponse | null>;
  current(): ContributionsState;
  subscribe(listener: () => void): () => void;
}

export function createContributionsStore(
  fetch: () => Promise<ContributionsResponse>,
): ContributionsStore {
  let state: ContributionsState = { user: null, answer: null, pending: false };
  // Which request the newest user made: a late answer for the user just left is dropped, or
  // one user's pages would show to the next.
  let asked = 0;
  const listeners = new Set<() => void>();
  const set = (next: ContributionsState) => {
    state = next;
    listeners.forEach((l) => l());
  };
  return {
    setUser(next) {
      if (next === state.user) return;
      const mine = ++asked;
      set({ user: next, answer: null, pending: next !== null });
      if (next === null) return;
      fetch().then(
        (answer) => {
          if (asked === mine) set({ user: next, answer, pending: false });
        },
        () => {
          // Nothing to fold in: the compiled table is a complete app. No retry — the next
          // sign-in asks again.
          if (asked === mine) set({ user: next, answer: null, pending: false });
        },
      );
    },
    refresh() {
      const user = state.user;
      if (user === null) return Promise.resolve(null);
      const mine = ++asked;
      return fetch().then(
        (answer) => {
          if (asked === mine) set({ user, answer, pending: false });
          return answer;
        },
        () => {
          if (asked === mine && state.pending) set({ ...state, pending: false });
          return null;
        },
      );
    },
    current: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Paths the router owns outside the page table. */
const ROUTER_PATHS = ["/login"];

/** A contributed page: a component bound to its iframe renderer. */
function framePageFor(src: string, title: string) {
  return function ContributedFramePage() {
    return <FramePage src={src} title={title} />;
  };
}

/** The renderer an entry names, as this build reads it; null when it names none it could draw. */
function rendererOf(raw: unknown): RendererRef | null {
  const ref = raw as { iframe?: { src?: unknown; namespace?: unknown }; builtin?: unknown } | null;
  const iframe = ref?.iframe;
  if (typeof iframe?.src === "string") {
    const namespace = typeof iframe.namespace === "string" ? iframe.namespace : "";
    return { iframe: { src: iframe.src, namespace } };
  }
  if (typeof ref?.builtin === "string") return { builtin: ref.builtin };
  return null;
}

/**
 * The compiled pages plus the contributed ones this build can draw, appended in the server's
 * order after the last compiled page, each keeping the renderer it named. An entry is skipped
 * when it lacks a key or a path, when a compiled page (or an earlier entry) owns its key or
 * path, or when its renderer is neither an iframe with a `src` nor a `builtin` name in
 * `renderers`. Its nav name, glyph and parent are kept when they are strings; whether its
 * parent can hold it is decided over the merged table (parentedPagesOf).
 *
 * A company-mode page (`nav: "org"`) has a path relative to an organization: company mode
 * mounts it under the organization layout (features/company/org-routes.tsx) and the router
 * beside the shell's own pages, from the root, so its path is kept without a leading slash and
 * clashes as the rooted one. Any other page's path is absolute.
 */
export function contributedPagesOf(
  compiled: readonly ShellPage[],
  answer: ContributionsResponse | null,
  renderers: ReadonlyMap<string, ComponentType>,
): readonly ShellPage[] {
  if (answer === null || answer.pages.length === 0) return compiled;
  const keys = new Set(compiled.map((p) => p.key));
  const paths = new Set([...ROUTER_PATHS, ...compiled.map((p) => p.path)]);
  let order = compiled.reduce((last, p) => Math.max(last, p.order), 0);
  const out = [...compiled];
  for (const entry of answer.pages) {
    const { key, nav, admin, released, parent, title, titleZh, icon } = entry;
    if (typeof key !== "string" || key === "" || keys.has(key)) continue;
    if (typeof entry.path !== "string") continue;
    const org = nav === "org";
    const path = org ? entry.path.replace(/^\/+/, "") : entry.path;
    if (org ? path === "" : !path.startsWith("/")) continue;
    const rooted = org ? `/${path}` : path;
    if (paths.has(rooted)) continue;
    const renderer = rendererOf(entry.renderer);
    if (renderer === null) continue;
    const Component =
      "iframe" in renderer
        ? framePageFor(renderer.iframe.src, typeof title === "string" ? title : key)
        : renderers.get(renderer.builtin);
    if (Component === undefined) continue;
    keys.add(key);
    paths.add(rooted);
    out.push({
      id: entry.id,
      key,
      path,
      frame: "shell",
      nav: org ? "org" : nav === "main" ? "main" : "none",
      admin: admin === true,
      released: released !== false,
      order: ++order,
      ...(typeof title === "string" ? { title } : {}),
      ...(typeof titleZh === "string" ? { titleZh } : {}),
      ...(typeof icon === "string" ? { icon } : {}),
      ...(typeof parent === "string" ? { parent } : {}),
      renderer,
      Component,
    });
  }
  return out;
}

/**
 * The table the router and the nav read: the compiled pages with the contributed ones appended,
 * the removed ones (`removals`, the modules' page removals) dropped from both, and then every
 * page whose parent is gone — so a removed page takes the pages under it along.
 */
export function pageTableFor(
  compiled: readonly ShellPage[],
  answer: ContributionsResponse | null,
  renderers: ReadonlyMap<string, ComponentType>,
  removals: readonly string[] = [],
): readonly ShellPage[] {
  return parentedPagesOf(removedPagesOf(contributedPagesOf(compiled, answer, renderers), removals));
}

/** The answer's parts besides the pages, for the features that read them (shell/index.ts). */
export interface ContributionsValue {
  /** The session surfaces the server's plugins contribute; none until the server answers. */
  surfaces: readonly SessionSurfaceSummary[];
  /** The module plugins' quick starts; none until the server answers. */
  quickStarts: ContributionsResponse["quickStarts"];
  refresh: () => Promise<ContributionsResponse | null>;
}

interface ShellPagesValue extends ContributionsValue {
  pages: readonly ShellPage[];
  pending: boolean;
}

const PagesContext = createContext<ShellPagesValue | null>(null);

/** Holds the signed-in user's contributions — the merged page table — for everything under the router. */
export function ShellPagesProvider({ children }: { children: ReactNode }) {
  const { pages: compiled, pageRenderers, pageRemovals } = shellDeps.useDeps();
  const signedIn = useAuth().user?.userId ?? null;
  const userId = useSafeMode() ? null : signedIn;
  const [store] = useState(() =>
    // The boot's answer first (plugins/forwarded.ts), once; every later ask goes to the server.
    createContributionsStore(() => {
      const primed = takeBootContributions();
      // A boot request that got no answer (signed out then, or failed) is asked again.
      return primed !== null
        ? primed.then((answer) => answer ?? api.getContributions())
        : api.getContributions();
    }),
  );
  useEffect(() => store.setUser(userId), [store, userId]);
  const state = useSyncExternalStore(store.subscribe, store.current, store.current);
  // Until the effect above has told the store about a new user, the state is the last user's:
  // none of it is shown, and the new user's request counts as already in flight.
  const current = state.user === userId;
  const answer = current ? state.answer : null;
  const pending = current ? state.pending : userId !== null;
  const value = useMemo<ShellPagesValue>(
    () => ({
      pages: pageTableFor(compiled, answer, pageRenderers, pageRemovals),
      pending,
      // A mocked or older server may leave these out.
      surfaces: answer?.sessionSurfaces ?? [],
      quickStarts: answer?.quickStarts ?? [],
      refresh: store.refresh,
    }),
    [compiled, answer, pageRenderers, pageRemovals, pending, store],
  );
  // Each answer against the list the tree was assembled from: a different one (a sign-in after a
  // signed-out boot, leaving safe mode, a plugin enabled or removed) is written and reloads once.
  useEffect(() => reconcileWebModules(answer, userId), [answer, userId]);
  return <PagesContext.Provider value={value}>{children}</PagesContext.Provider>;
}

function usePagesValue(): ShellPagesValue {
  const value = useContext(PagesContext);
  if (value === null) throw new Error("rendered outside the shell's page table");
  return value;
}

/** Every page: the modules' contributions by `order`, then the server's. */
export function useShellPages(): readonly ShellPage[] {
  return usePagesValue().pages;
}

/** The session surfaces and the quick starts the server contributes, and the way to ask again. */
export function useContributions(): ContributionsValue {
  return usePagesValue();
}

/**
 * Whether the server's pages may still arrive. The router's catch-all waits on it, so a
 * contributed page opened by its URL is not redirected away before the table holds it.
 */
export function useShellPagesPending(): boolean {
  return usePagesValue().pending;
}
