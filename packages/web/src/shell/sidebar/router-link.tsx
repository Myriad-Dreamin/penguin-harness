/**
 * The router's side of the shell's link rows: the UI package draws a nav row or a rail entry, and
 * hands its link over through `renderLink`; the app draws that link as the router's `Link`, so a
 * click navigates in place, and says which link is the current page.
 *
 * A row also starts loading the code of the page it leads to as soon as the pointer rests on it or
 * focus lands on it (pages load on first visit, lib/lazy-component.ts), so by the click the chunk
 * is usually there. That is the only prefetch the app does.
 */
import { Link, matchPath } from "react-router";
import type { NavRowLinkProps } from "@prismshadow/penguin-ui";
import { preloadComponent } from "../../lib/lazy-component";
import { useShellPages } from "../contributions";
import type { ShellPage } from "../page-table";

/** A package row's link as the router's own: the row's classes, state and content, navigating in place. */
export function renderRouterLink(link: NavRowLinkProps) {
  return <RouterLink {...link} />;
}

function RouterLink(link: NavRowLinkProps) {
  const prefetch = usePrefetchPage(link.href);
  return (
    <Link
      to={link.href}
      className={link.className}
      aria-current={link["aria-current"]}
      aria-label={link["aria-label"]}
      data-tooltip={link["data-tooltip"]}
      draggable={link.draggable}
      onClick={link.onClick}
      onPointerEnter={prefetch}
      onFocus={prefetch}
    >
      {link.children}
    </Link>
  );
}

/**
 * The page that answers `href`: the first in the table whose rooted route matches it (an
 * organization's page is company mode's `/org/*`; the catch-all home is never one).
 */
export function pageForHref(pages: readonly ShellPage[], href: string): ShellPage | undefined {
  return pages.find((p) => p.path.startsWith("/") && matchPath(p.path, href) !== null);
}

/**
 * Starts loading the code of the page that answers `href`. A page already loaded, or one that was
 * never deferred, makes it a no-op.
 */
function usePrefetchPage(href: string): () => void {
  const pages = useShellPages();
  return () => preloadComponent(pageForHref(pages, href)?.Component);
}

/**
 * Whether `to` is the page the reader is on: the path itself or anything under it, the rule a
 * router `NavLink` applies by default (so `/agents` stays current on an Agent's own page).
 */
export function isCurrentPath(to: string, pathname: string): boolean {
  return matchPath({ path: to, end: false }, pathname) !== null;
}
