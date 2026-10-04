/**
 * A component whose code loads on first render instead of with the entry bundle: what a module
 * binds to a slot whose code half is a plain component (a page, a dock panel, a session tab, a
 * sidebar section's block), so the feature behind it becomes its own chunk.
 *
 *     @Bind("agents.list") list = lazyComponent(() => import("./agents-page"), "AgentsPage");
 *
 * The kernel never looks inside the code half, so nothing upstream of the binding changes; what
 * the slot's owner must do is render the component under a `<Deferred>` boundary
 * (components/ui/deferred.tsx), which shows the quiet pending state while the chunk is in flight
 * and a retry when it fails.
 *
 * Not `React.lazy`: this one exposes `preload()`, which the nav calls on hover and focus
 * (shell/sidebar/router-link.tsx), so the click finds the chunk already there, and it marks a
 * failed load as a `ChunkLoadError`, which is what the boundary tells apart from a bug. Once
 * loaded, the component renders the target directly, with no suspension, on every later mount. A
 * failed load stays failed: the browser would answer the same `import()` with the same failure
 * for the rest of the document's life, so the boundary's retry is a reload.
 */
import { createElement, use } from "react";
import type { ComponentType, FunctionComponent } from "react";

/**
 * A deferred component: render it under a `<Deferred>` boundary. `preload()` starts its load early
 * and settles with the target, or a `ChunkLoadError`.
 */
export type LazyComponent<P> = FunctionComponent<P> & { preload(): Promise<ComponentType<P>> };

/**
 * The failure a deferred component throws when its chunk does not arrive. `<Deferred>` catches
 * only this one and offers a retry; any other render error goes on to the app's own boundary.
 */
export class ChunkLoadError extends Error {
  constructor(what: string, cause: unknown) {
    super(`could not load ${what}`, { cause });
    this.name = "ChunkLoadError";
  }
}

/** Whether an error is a deferred component's failed load. */
export function isChunkLoadError(error: unknown): error is ChunkLoadError {
  return error instanceof ChunkLoadError;
}

/**
 * The named export `name` of the module `load` imports, as a deferred component. `load` must be
 * an `import()` of a file in the binding module's own directory (test/module-boundaries.test.ts).
 */
export function lazyComponent<P extends object, K extends string>(
  load: () => Promise<Record<K, ComponentType<P>>>,
  name: K,
): LazyComponent<P> {
  type C = ComponentType<P>;
  let loaded: C | null = null;
  let pending: Promise<C> | null = null;
  const start = (): Promise<C> =>
    (pending ??= load().then(
      (module) => {
        const target = module[name] as C | undefined;
        if (target === undefined) throw new ChunkLoadError(name, new Error(`no export ${name}`));
        loaded = target;
        return target;
      },
      (error: unknown) => {
        throw new ChunkLoadError(name, error);
      },
    ));
  function Lazy(props: P) {
    return createElement(loaded ?? use(start()), props);
  }
  Lazy.displayName = `Lazy(${name})`;
  Lazy.preload = start;
  return Lazy;
}

/**
 * Starts loading a component's code if it is a deferred one; anything else is already loaded. A
 * hint only: a failure here is left for the render to meet, under its boundary.
 */
export function preloadComponent(component: unknown): void {
  const preload = (component as { preload?: unknown } | null)?.preload;
  if (typeof preload === "function") (preload as () => Promise<unknown>)().catch(() => undefined);
}
