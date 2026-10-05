/**
 * The shell module: the app's frame and its router. Features reach it only through its slots —
 * a page is a contribution to `ShellModule.pages` with the component bound by id, a provider of
 * the signed-in session one to `sessionProviders`, an overlay or a headless runtime one to
 * `layers`, a component a server-contributed page may name as its `builtin` renderer one to
 * `pageRenderers`, and taking a page away is one to `pageRemovals` (data only: a plugin removes
 * a page without shipping code) — so the shell imports no feature. What it provides is the root component the app
 * mounts, with the contributions bound into it (shell/deps.ts), and the user event handlers
 * the sessions module collects (state/user-events.ts), which the router hands to the session
 * list. The layout mounts the sidebar module's column and rail, and opens the chat module's
 * drafts on the New chat command.
 *
 * The kernel addresses a slot by the providing MODULE's name (`ShellModule.pages`), while the
 * slot declaration hangs on the interface the module provides (`ShellSlots` beside `Shell`) —
 * the same split as the server's `HttpModule.routes` and `HttpSlots`.
 */
import type { ComponentType, ReactNode } from "react";
import { Interface, Module, Provide, Use } from "@prismshadow/penguin-core/kernel/runtime";
import type { ClassCtx, Contributed, Slot } from "@prismshadow/penguin-core/kernel";
import { componentOf } from "../lib/lazy-component";
import type { CodeHalf } from "../lib/lazy-component";
import type { UserEventHandlers } from "../state/user-events";
import type { ChatDrafts } from "../features/chat";
import type { Sidebar } from "./sidebar/iface";
import { shellDeps } from "./deps";
import type { ShellLayer, ShellSessionProvider } from "./deps";
import { pageTableOf } from "./page-table";
import type { PageData } from "./page-table";
import { AppRouter } from "./router";
import type { AppRouterProps } from "./router";

@Interface()
export abstract class Shell {
  /** The whole routed app, everything it renders under the shell's bindings. */
  abstract readonly Root: ComponentType<AppRouterProps>;
}

/** The data half of a `sessionProviders` or `layers` contribution. */
export interface Ordered {
  /** The contribution's place in its slot, ascending. */
  order: number;
}

/** The data half of a `pageRenderers` contribution: the name a server-contributed page's `builtin` renderer gives. */
export interface PageRendererData {
  name: string;
}

/**
 * A `pageRemovals` contribution: the key of a page the shell drops, a module's or a
 * server-contributed one, with the routes under its path and the pages under it
 * (page-table.ts removedPagesOf). The pages home leads to stay whatever names them.
 */
export interface PageRemovalData {
  key: string;
}

/**
 * The component slots' code halves may be loaders (`CodeHalf`, lib/lazy-component.ts): the shell
 * defers them, so their code loads when first drawn (a page's, or earlier, when its nav row is
 * hovered), and draws each under a `<Deferred>` boundary. A session provider is the exception: it
 * wraps every page, so it is a component, loaded with the app.
 */
export interface ShellSlots {
  /** A routed page; its component is the code half. */
  pages: Slot<PageData, CodeHalf<ComponentType>>;
  /** Providers of the signed-in session, mounted inside Project + Sessions, outermost first. */
  sessionProviders: Slot<Ordered, ComponentType<{ children: ReactNode }>>;
  /** Mounted once beside every page: overlays and headless runtimes. */
  layers: Slot<Ordered, CodeHalf<ComponentType>>;
  /** A component a page the server contributes (shell/contributions.tsx) may name to be drawn with. */
  pageRenderers: Slot<PageRendererData, CodeHalf<ComponentType>>;
  /** A page taken away. */
  pageRemovals: PageRemovalData;
}

/** A slot's contributions by `order`, each with the component its module bound. */
function byOrder<P extends object>(
  contributions: readonly Contributed[],
  code: (c: Contributed) => ComponentType<P> = (c) => c.code as ComponentType<P>,
): ReadonlyArray<{ id: string; Component: ComponentType<P> }> {
  return [...contributions]
    .sort((a, b) => (a.data as unknown as Ordered).order - (b.data as unknown as Ordered).order)
    .map((c) => ({ id: c.id, Component: code(c) }));
}

/** A component slot's code half, deferred when it is a loader. */
const deferredCode = (c: Contributed): ComponentType =>
  componentOf(c.code as CodeHalf<ComponentType>, c.id);

@Module()
export class ShellModule {
  @Provide() shell!: Shell;
  @Use() userEventHandlers!: UserEventHandlers;
  @Use() sidebar!: Sidebar;
  @Use() drafts!: ChatDrafts;
  setup({ contributions }: ClassCtx) {
    const pages = pageTableOf(contributions.pages ?? []);
    const sessionProviders: readonly ShellSessionProvider[] = byOrder<{ children: ReactNode }>(
      contributions.sessionProviders ?? [],
    );
    const layers: readonly ShellLayer[] = byOrder(contributions.layers ?? [], deferredCode);
    const pageRenderers: ReadonlyMap<string, ComponentType> = new Map(
      (contributions.pageRenderers ?? []).map((c) => [
        (c.data as unknown as PageRendererData).name,
        deferredCode(c),
      ]),
    );
    const pageRemovals: readonly string[] = (contributions.pageRemovals ?? []).map(
      (c) => (c.data as unknown as PageRemovalData).key,
    );
    const userEvents = this.userEventHandlers.all();
    this.shell = {
      Root: shellDeps.provide(
        {
          pages,
          pageRenderers,
          pageRemovals,
          sessionProviders,
          layers,
          userEvents,
          sidebar: this.sidebar,
          drafts: this.drafts,
        },
        AppRouter,
      ),
    };
  }
}
