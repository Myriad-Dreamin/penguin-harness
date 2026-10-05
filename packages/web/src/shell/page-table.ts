/**
 * The web app's pages. Each one is a contribution to the shell's `pages` slot (shell/module.ts):
 * the module that owns it declares its route, its frame, whether it sits in the main nav and its
 * nav row, and binds the component that draws it (or a loader of it, which the shell defers).
 * `pageTableOf` turns the contributions into the table the router mounts and the sidebar derives
 * its nav group from. Pages the server's modules and plugins contribute are folded in after them
 * by shell/contributions.tsx, which also drops the pages the modules' `pageRemovals` name
 * (removedPagesOf).
 *
 * Where a page sits, whether the server refuses it to non-admins and whether it is offered yet
 * are the app's decisions (`PagePlacement`). The app's own pages state them, one author for one
 * product; a page a plugin's module contributes states none of them — plugins/page-claims.ts
 * refuses a plugin that does — and the shell places it (placedPagesOf).
 */
import type { ComponentType } from "react";
import { matchPath } from "react-router";
import type { Contributed } from "@prismshadow/penguin-core/kernel";
import type { RendererRef } from "@prismshadow/penguin-server/api";
import { componentOf } from "../lib/lazy-component";
import type { CodeHalf } from "../lib/lazy-component";

/** A page as its module declares it, whoever the module is. */
export interface PageFields {
  key: string;
  path: string;
  /** "bare" mounts outside the app shell (no sidebar, no Project context): the terminal, a workflow's app page. */
  frame: "shell" | "bare";
  nav: "main" | "none";
  /** A main-nav page's row: its name in English and in Chinese, and its glyph's name in the UI package's icon registry (`ICONS`). */
  title?: string;
  titleZh?: string;
  icon?: string;
  /**
   * The key of the page this one sits under: the nav draws it as an indented row below that
   * page (shell/sidebar/nav-state.ts). One level only — see parentedPagesOf.
   */
  parent?: string;
}

/** What the app decides about a page: the app's own pages state it, the shell decides it for the rest. */
export interface PagePlacement {
  admin: boolean;
  /** Built but not yet offered: reachable by URL and tests, hidden from the nav. */
  released: boolean;
  /** The page's place in the table, and so in the nav. */
  order: number;
}

/** The fields of `PagePlacement`: what a plugin's page may not state (plugins/page-claims.ts). */
export const PLACEMENT_FIELDS = ["admin", "released", "order"] as const satisfies ReadonlyArray<
  keyof PagePlacement
>;

/**
 * The data half of a `pages` contribution: the page's fields, and its placement when the app
 * states it — every one of the app's own pages states all three; a page that states no `order`
 * is placed by the shell.
 */
export interface PageData extends PageFields {
  admin?: boolean;
  released?: boolean;
  order?: number;
}

/** A page with the component its feature bound, or the one a server-contributed page's renderer resolved to. */
export interface ShellPage extends Omit<PageFields, "nav">, PagePlacement {
  id: string;
  /**
   * `org`: a company-mode page the server contributed, with no row in the main nav; its path is
   * relative to an organization (features/company/org-routes.tsx mounts it there).
   */
  nav: PageFields["nav"] | "org";
  Component: ComponentType;
  /** The renderer a server-contributed page named; absent on the modules' own pages. */
  renderer?: RendererRef;
}

/** A page the server contributed: the renderer it named stays beside the component, for the readers that key on it. */
export type ServerPage = ShellPage & { renderer: RendererRef };

/**
 * Hands out the places after every page of `pages`, one after another: where the shell puts the
 * pages it places itself — a plugin module's (pageTableOf) and a server-contributed one
 * (shell/contributions.tsx) — so they come after the app's own, and, under a parent, after the
 * app's own children.
 */
export function placesAfter(pages: readonly Pick<PagePlacement, "order">[]): () => number {
  let order = pages.reduce((last, p) => Math.max(last, p.order), 0);
  return () => ++order;
}

/**
 * The `pages` contributions as the router and the nav read them: the pages that state their
 * placement by `order`, then the rest in slot order, placed after them — offered, and open to
 * every role. The slot's order is the tree's: the root's plugin children come after the app's
 * modules in package-name order (web-root.ts, plugins/assemble.ts), each module's contributions
 * in the order it lists them — so the shell's places are stable from load to load. A page bound
 * as a loader is deferred (the router draws every page under `<Deferred>`).
 */
export function pageTableOf(contributions: readonly Contributed[]): readonly ShellPage[] {
  const own: ShellPage[] = [];
  const unplaced: ShellPage[] = [];
  for (const c of contributions) {
    const data = c.data as unknown as PageData;
    const page: ShellPage = {
      ...data,
      admin: data.admin ?? false,
      released: data.released ?? true,
      order: data.order ?? 0,
      id: c.id,
      Component: componentOf(c.code as CodeHalf<ComponentType>, c.id),
    };
    (data.order === undefined ? unplaced : own).push(page);
  }
  own.sort((a, b) => a.order - b.order);
  const next = placesAfter(own);
  return [...own, ...unplaced.map((p) => ({ ...p, order: next() }))];
}

/**
 * The table with every page whose `parent` cannot hold it dropped — from the nav and from the
 * routes alike, so a page never shows up detached from where it belongs: a parent that is not
 * in the table (its plugin is gone, or the page was never there), a parent that itself sits
 * under another page (one level only; the child is refused, its parent stays), or the page's
 * own key.
 */
export function parentedPagesOf(pages: readonly ShellPage[]): readonly ShellPage[] {
  if (pages.every((p) => p.parent === undefined)) return pages;
  const byKey = new Map(pages.map((p) => [p.key, p]));
  return pages.filter((p) => {
    if (p.parent === undefined) return true;
    const parent = byKey.get(p.parent);
    return parent !== undefined && parent !== p && parent.parent === undefined;
  });
}

/**
 * Where home leads: company mode's `home` page (path `*`, features/company/home-redirect.tsx)
 * answers `/`, a signed-in /login and every path nothing else matches by sending it to the
 * effective mode's home — development mode's conversations or company mode's organizations
 * (features/company/company-nav.ts `homePath`, which test/page-removal.test.ts holds to this
 * list). The pages that answer these paths, the `*` page included, are the ones no removal can
 * take away: without them home would lead to a path that falls to home again.
 */
export const HOME_PATHS: readonly string[] = ["/chat", "/org"];

/** A route pattern's segments: "/benchmark/:benchmarkId" → ["benchmark", ":benchmarkId"]. */
const segmentsOf = (path: string) => path.split("/").filter((s) => s !== "");

/**
 * The table without the pages the given keys name, nor the pages whose route lies under one of
 * theirs — whose pattern starts with every segment of the removed page's pattern, so removing
 * `benchmark` (/benchmark) takes `benchmark-detail` (/benchmark/:benchmarkId) with it but not
 * the other way round: what lives under a page's URL belongs to that page, and a removal names
 * the page a user sees, not the routes behind it. A page at "/" takes only itself. A page that
 * answers one of HOME_PATHS stays whatever names it. Keys naming no page are ignored; pages
 * under a removed one by `parent` are left to parentedPagesOf, which runs after this.
 */
export function removedPagesOf(
  pages: readonly ShellPage[],
  keys: readonly string[],
): readonly ShellPage[] {
  if (keys.length === 0) return pages;
  const removed = pages.filter((p) => keys.includes(p.key)).map((p) => segmentsOf(p.path));
  if (removed.length === 0) return pages;
  const under = (path: readonly string[], root: readonly string[]) =>
    root.length > 0 && root.length <= path.length && root.every((s, i) => s === path[i]);
  return pages.filter((p) => {
    if (HOME_PATHS.some((home) => matchPath(p.path, home) !== null)) return true;
    if (keys.includes(p.key)) return false;
    const path = segmentsOf(p.path);
    return !removed.some((root) => under(path, root));
  });
}

/** A page's nav name in the given language; the key stands in for a page that names none. */
export function pageTitle(
  page: Pick<PageFields, "key" | "title" | "titleZh">,
  locale: "zh" | "en",
): string {
  return (locale === "zh" ? page.titleZh : page.title) ?? page.title ?? page.key;
}

/** The main nav's pages, in table order — offered or not, for any role. */
export function navPagesOf(pages: readonly ShellPage[]): readonly ShellPage[] {
  return pages.filter((p) => p.nav === "main");
}
