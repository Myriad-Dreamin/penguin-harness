/**
 * The boundary a slot's owner renders deferred or contributed code under (lib/lazy-component.ts):
 * the pages, the dock's panel bodies, the chat page's session tabs and file renderers, the
 * sidebar's sections and the shell's layers.
 *
 * While a chunk is in flight it shows `fallback` — by default the boot status (boot-pending.tsx),
 * which fades in only after a short delay, so a load that is over in a few hundred milliseconds
 * never blinks a word, and which fills its box, so the layout around it does not move. A slot that
 * lists things (the sidebar) passes `null` and stays empty instead. The router's navigations are
 * transitions, so a boundary already on screen keeps the page it shows until the next page's chunk
 * has arrived; the fallback is only seen on a first mount.
 *
 * ONE RULE: every error thrown below stops here — a chunk that did not arrive (a dropped
 * connection, a build or a plugin rebuilt under the tab) and a component that threw while
 * rendering alike — as a short notice with a Retry, so a failing part, a plugin's above all,
 * degrades only its own block and never the whole app. The Retry differs by cause: a failed
 * chunk reloads the page, since a browser keeps a failed module import for the life of the
 * document (Chromium answers the same `import()` with the same failure), so only a new document
 * can fetch it again; any other failure remounts the part. `resetKey` clears a failure when it
 * changes (the router passes the path, so navigating away from a failed page leaves the notice
 * behind).
 */
import { Component, Fragment, Suspense } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Button } from "@prismshadow/penguin-ui";
import { isChunkLoadError } from "../../lib/lazy-component";
import { S } from "../../lib/strings";
import { BootPending } from "./boot-pending";

interface Props {
  children: ReactNode;
  /** What stands in while the code loads; the delayed boot status when omitted. */
  fallback?: ReactNode;
  /** A value whose change forgets a failure. */
  resetKey?: unknown;
}

interface State {
  error: unknown;
  /** Bumped by a Retry that remounts: the children are drawn afresh under a new key. */
  attempt: number;
}

/** No error held. `null` is not used: `throw null` is a value React reports as an error too. */
const NONE: unique symbol = Symbol("no error");

class PartBoundary extends Component<Props, State> {
  override state: State = { error: NONE, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // The part is replaced by the notice; the cause stays diagnosable in the console.
    console.error("[deferred] a part of the page failed", error, info.componentStack);
  }

  override componentDidUpdate(prev: Props): void {
    if (this.state.error !== NONE && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: NONE });
    }
  }

  private readonly retry = () => {
    if (isChunkLoadError(this.state.error)) window.location.reload();
    else this.setState((s) => ({ error: NONE, attempt: s.attempt + 1 }));
  };

  override render(): ReactNode {
    const { error, attempt } = this.state;
    if (error === NONE) return <Fragment key={attempt}>{this.props.children}</Fragment>;
    return (
      <div
        role="alert"
        data-part-failed
        className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-sm text-fg-muted"
      >
        <p>{isChunkLoadError(error) ? S.common.loadPartFailed : S.common.partFailed}</p>
        <Button size="sm" onClick={this.retry}>
          {S.common.retry}
        </Button>
      </div>
    );
  }
}

export function Deferred({ children, fallback, resetKey }: Props) {
  return (
    <PartBoundary resetKey={resetKey}>
      <Suspense fallback={fallback === undefined ? <BootPending /> : fallback}>{children}</Suspense>
    </PartBoundary>
  );
}
