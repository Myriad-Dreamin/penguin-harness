/**
 * The one consumer of GET /api/contributions: what the server's modules and plugins contribute
 * to the web slots, as data, folded into the shell's page table. The fetch, its failure and the
 * merge all live here, so the interface can be swapped by changing this file alone; the router
 * and the sidebar read the merged table through `useShellPages()` and never learn where a page
 * came from.
 *
 * The module tree boots before anyone signs in and does no network, so the contributions are
 * state of the signed-in session, held by a provider under the shell's root: fetched once per
 * user, dropped and asked again when the user changes. Until the server answers — and if it
 * never does — the table is exactly the compiled one; no contributed page is load-bearing.
 *
 * A contributed page names a renderer instead of carrying a component. `iframe` is drawn by
 * the shell's frame page (shell/frame-page.tsx). `builtin` names a renderer in this build's own
 * registry, and this build carries no builtin page renderer, so such a page is skipped — there
 * is nothing to draw it with. A compiled page wins over a contributed one with the same key or
 * path: a plugin adds pages here, it does not shadow the app's own.
 *
 * Safe mode (rescue/safe-mode.ts) is the one switch over all of it: while it is on, the store is
 * told nobody is signed in, so nothing is asked and the table is the compiled one; leaving it
 * asks again.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type { ContributionsResponse } from "@prismshadow/penguin-server/api";
import * as api from "../api/endpoints";
import { useSafeMode } from "../rescue/safe-mode";
import { useAuth } from "../state/auth";
import { shellDeps } from "./deps";
import { FramePage } from "./frame-page";
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

/**
 * The compiled pages plus the contributed ones this build can draw, appended in the server's
 * order after the last compiled page. An entry is skipped when it lacks a key or a path, when
 * a compiled page (or an earlier entry) owns its key or path, or when its renderer is not an
 * iframe with a `src`.
 */
export function contributedPagesOf(
  compiled: readonly ShellPage[],
  answer: ContributionsResponse | null,
): readonly ShellPage[] {
  if (answer === null || answer.pages.length === 0) return compiled;
  const keys = new Set(compiled.map((p) => p.key));
  const paths = new Set([...ROUTER_PATHS, ...compiled.map((p) => p.path)]);
  let order = compiled.reduce((last, p) => Math.max(last, p.order), 0);
  const out = [...compiled];
  for (const entry of answer.pages) {
    const { key, path, nav, admin, renderer } = entry;
    if (typeof key !== "string" || key === "" || keys.has(key)) continue;
    if (typeof path !== "string" || !path.startsWith("/") || paths.has(path)) continue;
    const src = (renderer as { iframe?: { src?: unknown } } | undefined)?.iframe?.src;
    if (typeof src !== "string") continue;
    keys.add(key);
    paths.add(path);
    out.push({
      id: entry.id,
      key,
      path,
      frame: "shell",
      nav: nav === "main" ? "main" : "none",
      admin: admin === true,
      released: true,
      order: ++order,
      Component: framePageFor(src, key),
    });
  }
  return out;
}

interface ShellPagesValue {
  pages: readonly ShellPage[];
  pending: boolean;
}

const PagesContext = createContext<ShellPagesValue | null>(null);

/** Holds the signed-in user's contributions and the merged page table, for everything under the router. */
export function ShellPagesProvider({ children }: { children: ReactNode }) {
  const { pages: compiled } = shellDeps.useDeps();
  const signedIn = useAuth().user?.userId ?? null;
  const userId = useSafeMode() ? null : signedIn;
  const [store] = useState(() => createContributionsStore(api.getContributions));
  useEffect(() => store.setUser(userId), [store, userId]);
  const state = useSyncExternalStore(store.subscribe, store.current, store.current);
  // Until the effect above has told the store about a new user, the state is the last user's:
  // none of it is shown, and the new user's request counts as already in flight.
  const current = state.user === userId;
  const answer = current ? state.answer : null;
  const pending = current ? state.pending : userId !== null;
  const value = useMemo(
    () => ({ pages: contributedPagesOf(compiled, answer), pending }),
    [compiled, answer, pending],
  );
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

/**
 * Whether the server's pages may still arrive. The router's catch-all waits on it, so a
 * contributed page opened by its URL is not redirected away before the table holds it.
 */
export function useShellPagesPending(): boolean {
  return usePagesValue().pending;
}
