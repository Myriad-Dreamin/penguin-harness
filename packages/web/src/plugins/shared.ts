/**
 * The app's own instances of what a plugin's web module shares instead of bundling: React, its
 * JSX runtime, the kernel and the UI package. A plugin's build resolves each of these specifiers
 * to a stub that reads the instance from `globalThis[SHARED_GLOBAL]` (scripts/lib/web-shared.mjs —
 * the two lists must agree, which test/plugin-modules.test.ts checks), so a plugin's component
 * renders with the app's React and its hooks, its decorators record onto the classes the app's
 * kernel reads, and the UI package's contexts are the app's.
 *
 * Put up once, before the first plugin module is imported; the record is frozen, so a plugin
 * cannot swap an instance under the others.
 */
import * as React from "react";
import * as JsxRuntime from "react/jsx-runtime";
import * as Kernel from "@prismshadow/penguin-core/kernel";
import * as Ui from "@prismshadow/penguin-ui";

export const SHARED_GLOBAL = "__penguinShared";

/** Specifier key → the app's instance. */
export const SHARED_MODULES: Readonly<Record<string, unknown>> = Object.freeze({
  react: React,
  "react/jsx-runtime": JsxRuntime,
  "@prismshadow/penguin-core/kernel": Kernel,
  "@prismshadow/penguin-ui": Ui,
});

/** Shares the app's instances with plugin modules; idempotent. */
export function shareHostModules(): void {
  const g = globalThis as Record<string, unknown>;
  g[SHARED_GLOBAL] ??= SHARED_MODULES;
}
