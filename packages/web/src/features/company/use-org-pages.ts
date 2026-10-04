/**
 * The company-mode pages (`nav: "org"`) among the pages in the shell's table — the ones the
 * server's plugins contribute that this build can draw (shell/contributions.tsx reads them and
 * resolves their renderers): company mode routes them under the organization layout
 * (org-routes.tsx), the sidebar draws their rows, and the roadmaps and proposals features key off
 * their presence. Until the server answers — and if it never does — there are none: no
 * contributed page is load-bearing.
 */
import { useMemo } from "react";
import { useShellPages } from "../../shell";
import type { ServerPage, ShellPage } from "../../shell";

/** The company-mode pages in a page table, in table order. */
export function orgPagesOf(pages: readonly ShellPage[]): ServerPage[] {
  return pages.filter((p): p is ServerPage => p.nav === "org" && p.renderer !== undefined);
}

/** The company-mode pages the server contributed that this build can draw. */
export function useOrgPages(): readonly ServerPage[] {
  const pages = useShellPages();
  return useMemo(() => orgPagesOf(pages), [pages]);
}
