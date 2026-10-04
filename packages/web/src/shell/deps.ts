/**
 * What the shell binds into its root component (lib/module-deps.tsx): the page table, the
 * renderers a server-contributed page may name, the session providers, the layers, the user event handlers, the sidebar the layout mounts and the
 * chat drafts its New chat command opens. Kept apart
 * from module.ts so the router and the sidebar can read it without importing the module class,
 * which only the composition root does.
 */
import type { ComponentType, ReactNode } from "react";
import { createDeps } from "../lib/module-deps";
import type { UserEventHandler } from "../state/user-events";
import type { ChatDrafts } from "../features/chat";
import type { ShellPage } from "./page-table";
import type { Sidebar } from "./sidebar/iface";

/** A contributed provider of the signed-in session. */
export interface ShellSessionProvider {
  id: string;
  Component: ComponentType<{ children: ReactNode }>;
}

/** A contributed layer: an overlay or a headless runtime, mounted once beside every page. */
export interface ShellLayer {
  id: string;
  Component: ComponentType;
}

export interface ShellDeps {
  pages: readonly ShellPage[];
  /** By name: what a server-contributed page's `builtin` renderer resolves to (shell/contributions.tsx). */
  pageRenderers: ReadonlyMap<string, ComponentType>;
  /** Outermost first. */
  sessionProviders: readonly ShellSessionProvider[];
  layers: readonly ShellLayer[];
  /** In dispatch order; the session list hands them every event it does not keep. */
  userEvents: readonly UserEventHandler[];
  sidebar: Sidebar;
  drafts: ChatDrafts;
}

export const shellDeps = createDeps<ShellDeps>();
