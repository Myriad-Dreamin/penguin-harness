/**
 * The page table with what the server's plugins contribute folded in (GET /api/contributions,
 * lib/pages.ts `mergePages`) — read here for its company-mode pages (`nav: "org"`): the router
 * mounts them under the organization layout and the sidebar draws their rows.
 *
 * One fetch per signed-in user, shared by every caller through a module-level store. Until it
 * answers — and if it never does — the table is the local manifest alone: no contributed page
 * is load-bearing. {@link useOrgPagesState} says which of the two a caller is looking at, so a
 * route can tell "not contributed" from "not asked yet".
 *
 * TODO(contributions-provider): the web UI stack's state/contributions.tsx (ContributionsProvider,
 * which also carries the session surfaces) holds this same merged table for the whole tree. Once
 * both stacks are on one line, read `useContributions().pages` instead and delete this module.
 */
import { useEffect, useSyncExternalStore } from "react";
import * as api from "../../api/endpoints";
import { PAGES, mergePages, type PageEntry } from "../../lib/pages";
import { useAuth } from "../../state/auth";
import { ORG_PAGE_RENDERERS } from "./company-nav";

/** The builtin renderers a contributed company-mode page may name; one naming another is skipped. */
const ORG_RENDERER_NAMES: ReadonlySet<string> = new Set(Object.keys(ORG_PAGE_RENDERERS));

/**
 * How far the merged table has got: nobody signed in to ask for (`idle`), the contributions
 * are on their way (`loading`), they answered (`ready`), or the request failed and the table
 * stays on the local manifest (`error`). Only `ready` and `error` have settled the table: until
 * then a page missing from it may still arrive, so a lookup must not read a miss as "there is
 * no such page".
 */
export type OrgPagesStatus = "idle" | "loading" | "ready" | "error";

export interface OrgPagesState {
  /** The merged page table: the local manifest alone until the contributions answer. */
  pages: readonly PageEntry[];
  status: OrgPagesStatus;
}

let loadedFor: string | null = null;
let state: OrgPagesState = { pages: PAGES, status: "idle" };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Replaces the store's state; the object identity is what `useSyncExternalStore` compares. */
function publish(next: OrgPagesState): void {
  state = next;
  listeners.forEach((l) => l());
}

function load(userId: string | null): void {
  if (userId === loadedFor) return;
  loadedFor = userId;
  publish({ pages: PAGES, status: userId === null ? "idle" : "loading" });
  if (userId === null) return;
  api.getContributions().then(
    (res) => {
      if (loadedFor !== userId) return;
      publish({ pages: mergePages(PAGES, res.pages, ORG_RENDERER_NAMES), status: "ready" });
    },
    () => {
      // Nothing to fold in: the App stays on its local manifest, which is a complete App.
      // The table is settled all the same — a page it does not hold is not coming.
      if (loadedFor !== userId) return;
      publish({ pages: PAGES, status: "error" });
    },
  );
}

function useOrgPagesStore(): OrgPagesState {
  const userId = useAuth().user?.userId ?? null;
  useEffect(() => load(userId), [userId]);
  return useSyncExternalStore(subscribe, () => state);
}

/** The merged page table (local manifest plus contributed pages this build can render). */
export function useOrgPages(): readonly PageEntry[] {
  return useOrgPagesStore().pages;
}

/**
 * The merged table with how far its fetch has got. A route that mounts a contributed page
 * waits for the table to settle before it treats a page it cannot find as absent: a cold deep
 * link is routed before the contributions answer, and sending it to the fallback then would
 * lose it for the rest of the visit.
 */
export function useOrgPagesState(): OrgPagesState {
  return useOrgPagesStore();
}
