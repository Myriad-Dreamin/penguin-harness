/**
 * The boundary a slot's owner renders deferred code under (lib/lazy-component.ts): the pages, the
 * dock's panel bodies, the chat page's session tabs, the sidebar's sections and the shell's layers.
 *
 * While a chunk is in flight it shows `fallback` — by default the boot status (boot-pending.tsx),
 * which fades in only after a short delay, so a load that is over in a few hundred milliseconds
 * never blinks a word, and which fills its box, so the layout around it does not move. A slot that
 * lists things (the sidebar) passes `null` and stays empty instead. The router's navigations are
 * transitions, so a boundary already on screen keeps the page it shows until the next page's chunk
 * has arrived; the fallback is only seen on a first mount.
 *
 * A chunk that does not arrive (a dropped connection, a build replaced under the tab) stops here as
 * a short notice with a Retry rather than as a blank box. The Retry reloads the page: a browser
 * keeps a failed module import for the life of the document (Chromium answers the same `import()`
 * with the same failure), so only a new document can fetch the chunk again. Only that failure
 * stops here: any other error rethrows to the boundary above, the app's rescue path, exactly as it
 * did before the code was deferred. `resetKey` clears a failure when it changes (the router passes
 * the path, so navigating away from a page whose chunk failed leaves the notice behind).
 */
import { Component, Suspense } from "react";
import type { ReactNode } from "react";
import { Button } from "@prismshadow/penguin-ui";
import { isChunkLoadError } from "../../lib/lazy-component";
import { S } from "../../lib/strings";
import { BootPending } from "./boot-pending";

interface Props {
  children: ReactNode;
  /** What stands in while the code loads; the delayed boot status when omitted. */
  fallback?: ReactNode;
  /** A value whose change forgets a failed load. */
  resetKey?: unknown;
}

type State = { error: unknown } | { error: null };

class ChunkBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  override componentDidUpdate(prev: Props): void {
    if (this.state.error !== null && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    // Not a load failure: the boundary above (the rescue panel) is where it belongs.
    if (!isChunkLoadError(error)) throw error;
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-sm text-fg-muted"
      >
        <p>{S.common.loadPartFailed}</p>
        <Button size="sm" onClick={() => window.location.reload()}>
          {S.common.retry}
        </Button>
      </div>
    );
  }
}

export function Deferred({ children, fallback, resetKey }: Props) {
  return (
    <ChunkBoundary resetKey={resetKey}>
      <Suspense fallback={fallback === undefined ? <BootPending /> : fallback}>{children}</Suspense>
    </ChunkBoundary>
  );
}
