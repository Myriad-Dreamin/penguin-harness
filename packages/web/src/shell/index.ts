/** The shell's public face: the page table and the layers, for whatever renders under the shell's root. */
import { shellDeps } from "./deps";
import type { ShellLayer } from "./deps";

export type { PageData, ShellPage } from "./page-table";
export { navPagesOf, pageTitle } from "./page-table";
export { useShellPages } from "./contributions";

/** The contributed layers, by `order`: the app layout mounts each once, beside the page. */
export function useShellLayers(): readonly ShellLayer[] {
  return shellDeps.useDeps().layers;
}
