/**
 * The shell's public face: the page table, for whatever renders under the shell's root, and how
 * a server-contributed page is drawn.
 */
import { shellDeps } from "./deps";
import type { ShellPage } from "./page-table";

export type { PageData, PageEntry, ShellPage } from "./page-table";
export { navPagesOf, orgPagesOf } from "./page-table";
export { ContributedPage } from "./contributed-page";

/** Every page the modules contributed, by `order`. */
export function useShellPages(): readonly ShellPage[] {
  return shellDeps.useDeps().pages;
}
