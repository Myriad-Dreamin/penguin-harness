/**
 * Components whose code loads on first render instead of with the entry bundle.
 *
 * A slot's code half may be bound as a `Separable` (plugin-types.ts): a loader, typically an
 * `import()` of the file that holds the component, so that file is its own chunk. The contributor
 * says only that much — the app's own modules and plugins' alike:
 *
 *     @Bind("agents.list") list = { load: () => import("./agents-page").then((m) => m.AgentsPage) };
 *
 * The slot's owner turns what it was handed into a component with `componentOf`, the one place a
 * loader becomes a deferred component, and renders it under a `<Deferred>` boundary
 * (components/ui/deferred.tsx), which shows the quiet pending state while the chunk is in flight
 * and a retry when it fails. A module that defers a part of its own (a dialog it opens) calls
 * `lazyComponent` directly; that is its own composition, not a slot's.
 *
 * Not `React.lazy`: a deferred component exposes `preload()`, which the nav calls on hover and
 * focus (shell/sidebar/router-link.tsx), so the click finds the chunk already there — for a
 * plugin's page as for the app's own — and it marks a failed load as a `ChunkLoadError`, which
 * the boundary answers with a reload rather than a remount. Once loaded, the component renders
 * the target directly, with no suspension, on every later mount. A failed load stays failed: the
 * browser would answer the same `import()` with the same failure for the rest of the document's
 * life, so the boundary's retry is a reload.
 */
import { createElement, use } from "react";
import type { ComponentType, FunctionComponent } from "react";
import type { Separable } from "../plugin-types";

/**
 * A deferred component: render it under a `<Deferred>` boundary. `preload()` starts its load early
 * and settles with the target, or a `ChunkLoadError`.
 */
export type LazyComponent<P> = FunctionComponent<P> & { preload(): Promise<ComponentType<P>> };

/** A slot's code half as a contributor may bind it: the code itself, or a loader of it. */
export type CodeHalf<C> = C | Separable<C>;

/**
 * The failure a deferred component throws when its code does not arrive — the chunk failed to
 * load, or it held no component. `<Deferred>` offers a reload for it (a remount would meet the
 * same cached failure); for any other error, a remount.
 */
export class ChunkLoadError extends Error {
  constructor(what: string, cause: unknown) {
    super(`could not load ${what}`, { cause });
    this.name = "ChunkLoadError";
  }
}

/**
 * Whether an error is a failed code load. Every deferred component the app renders comes through
 * `lazyComponent`, which turns any rejection of its loader into a `ChunkLoadError`.
 */
export function isChunkLoadError(error: unknown): boolean {
  return error instanceof ChunkLoadError;
}

/** The component `load` resolves to, as a deferred component; `name` names it in messages. */
export function lazyComponent<P extends object>(
  load: () => Promise<ComponentType<P>>,
  name: string,
): LazyComponent<P> {
  type C = ComponentType<P>;
  let loaded: C | null = null;
  let pending: Promise<C> | null = null;
  const start = (): Promise<C> =>
    (pending ??= Promise.resolve()
      .then(load)
      .then(
        (target) => {
          if (target === undefined || target === null) {
            throw new ChunkLoadError(name, new Error("it resolved to no component"));
          }
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

/** Whether a code half is a loader rather than the code itself (a component is never one). */
export function isSeparable<C>(half: CodeHalf<C>): half is Separable<C> {
  return (
    typeof half === "object" &&
    half !== null &&
    !("$$typeof" in half) &&
    typeof (half as { load?: unknown }).load === "function"
  );
}

/** One deferred component per loader, so a loader bound to two slots loads once. */
const deferred = new WeakMap<object, LazyComponent<never>>();

/**
 * A component slot's code half as the slot's owner renders it: a component as it is, a loader as
 * a deferred component (the same one every time for the same loader). `what` names it in a load
 * failure — the contribution's id. The owner renders the result under a `<Deferred>` boundary.
 */
export function componentOf<P extends object>(
  half: CodeHalf<ComponentType<P>>,
  what: string,
): ComponentType<P> {
  if (!isSeparable(half)) return half;
  let component = deferred.get(half) as LazyComponent<P> | undefined;
  if (component === undefined) {
    component = lazyComponent(() => half.load(), what);
    deferred.set(half, component as LazyComponent<never>);
  }
  return component;
}

/**
 * Starts loading a component's code if it is a deferred one; anything else is already loaded. A
 * hint only: a failure here is left for the render to meet, under its boundary.
 */
export function preloadComponent(component: unknown): void {
  const preload = (component as { preload?: unknown } | null)?.preload;
  if (typeof preload === "function") (preload as () => Promise<unknown>)().catch(() => undefined);
}
