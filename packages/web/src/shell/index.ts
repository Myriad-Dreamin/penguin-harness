/**
 * The shell's public face: the page table and the layers, for whatever renders under the
 * shell's root, and how a server-contributed page is drawn.
 */
import { shellDeps } from "./deps";
import type { ShellLayer } from "./deps";

export type { PageData, PageEntry, ShellPage } from "./page-table";
export { navPagesOf, orgPagesOf, pageTitle } from "./page-table";
export { ContributedPage } from "./contributed-page";
export { useShellPages } from "./contributions";

/** The contributed layers, by `order`: the app layout mounts each once, beside the page. */
export function useShellLayers(): readonly ShellLayer[] {
  return shellDeps.useDeps().layers;
}
