/**
 * The app-wide error boundary: always on. A render that throws anywhere below it leaves a
 * message and a way back (reload) instead of a blank page, and is reported to the server's
 * error table when the browser-side switch is on (lib/error-report.ts) — a render error is
 * one the server never sees.
 */
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { S } from "../lib/strings";
import { reportBrowserError } from "../lib/error-report";
import { Button } from "./ui/button";

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    const err = error instanceof Error ? error : new Error(String(error));
    reportBrowserError({
      kind: "render",
      code: "render_error",
      message: `${err.name}: ${err.message}`,
      // The component stack says where in the tree; the error's own stack says where in the code.
      stack: [err.stack, info.componentStack].filter(Boolean).join("\n"),
    });
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-white px-4 text-center dark:bg-gray-950">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {S.errors.renderFailed}
        </p>
        <p className="max-w-md text-xs text-gray-500 dark:text-gray-400">
          {S.errors.renderFailedHint}
        </p>
        <Button className="mt-2" onClick={() => location.reload()}>
          {S.errors.reload}
        </Button>
      </div>
    );
  }
}
