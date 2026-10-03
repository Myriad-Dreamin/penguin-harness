/**
 * What the shell binds into its root component (lib/module-deps.tsx): the page table. Kept apart
 * from module.ts so the router and the sidebar can read it without importing the module class,
 * which only the composition root does.
 */
import { createDeps } from "../lib/module-deps";
import type { ShellPage } from "./page-table";

export interface ShellDeps {
  pages: readonly ShellPage[];
}

export const shellDeps = createDeps<ShellDeps>();
