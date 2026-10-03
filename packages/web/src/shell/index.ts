/** The shell's public face: the page table, for whatever renders under the shell's root. */
import { shellDeps } from "./deps";
import type { ShellPage } from "./page-table";

export type { PageData, ShellPage } from "./page-table";
export { navPagesOf } from "./page-table";

/** Every page the modules contributed, by `order`. */
export function useShellPages(): readonly ShellPage[] {
  return shellDeps.useDeps().pages;
}
