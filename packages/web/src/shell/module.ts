/**
 * The shell module: the app's frame and its router. Features reach it only through its slots —
 * a page is a contribution to `ShellModule.pages` with the component bound by id — so the shell
 * imports no feature. What it provides is the root component the app mounts, with the page
 * table bound into it (shell/deps.ts).
 *
 * The kernel addresses a slot by the providing MODULE's name (`ShellModule.pages`), while the
 * slot declaration hangs on the interface the module provides (`ShellSlots` beside `Shell`) —
 * the same split as the server's `HttpModule.routes` and `HttpSlots`.
 */
import type { ComponentType } from "react";
import { Interface, Module, Provide } from "@prismshadow/penguin-core/kernel";
import type { ClassCtx, Slot } from "@prismshadow/penguin-core/kernel";
import { shellDeps } from "./deps";
import { pageTableOf } from "./page-table";
import type { PageData } from "./page-table";
import { AppRouter } from "./router";
import type { AppRouterProps } from "./router";

@Interface()
export abstract class Shell {
  /** The whole routed app, everything it renders under the shell's bindings. */
  abstract readonly Root: ComponentType<AppRouterProps>;
}

export interface ShellSlots {
  /** A routed page; its component is the code half. */
  pages: Slot<PageData, ComponentType>;
}

@Module()
export class ShellModule {
  @Provide() shell!: Shell;
  setup({ contributions }: ClassCtx) {
    const pages = pageTableOf(contributions.pages ?? []);
    this.shell = { Root: shellDeps.provide({ pages }, AppRouter) };
  }
}
