/**
 * The shell's public face: the page table (the modules' pages and the server's) and the layers,
 * for whatever renders under the shell's root, and the rest of what the server contributes.
 */
import { shellDeps } from "./deps";
import type { ShellLayer } from "./deps";

export type { PageData, ServerPage, ShellPage } from "./page-table";
export { navPagesOf, pageTitle } from "./page-table";
export { useContributions, useShellPages } from "./contributions";

/** The contributed layers, by `order`: the app layout mounts each once, beside the page. */
export function useShellLayers(): readonly ShellLayer[] {
  return shellDeps.useDeps().layers;
}
