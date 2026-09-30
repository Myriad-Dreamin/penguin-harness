/**
 * Browser error reports: what this page sees go wrong that the server cannot — a render
 * error, an unhandled rejection, a request that reached nobody (status 0), the API socket's
 * timeouts and silences — sent to the server's error table (`POST /api/errors/browser`).
 *
 * An ApiError is never reported: the server answered it, and recorded it when it was worth
 * recording. A network-level ApiError (status 0) is reported where it is made, in the API
 * client, so a rejection carrying one is not reported a second time.
 *
 * OFF unless the browser-side switch is on (`penguin.reportErrors` = "1" in local storage):
 * while off, `reportBrowserError` is one storage read and returns. The error boundary itself
 * is always on — only the sending waits for the switch.
 *
 * Bounded on this side as the server bounds its own: the same kind · code · message is sent
 * once per DEDUP_WINDOW_MS, at most PER_MINUTE a minute and PER_PAGE per page load, in small
 * batches over plain fetch (never the API socket, whose own failures are among the reports,
 * and never apiFetch, whose failures would report themselves).
 */
import type { BrowserErrorReport } from "@prismshadow/penguin-server/api";

/** The local-storage key of the browser-side switch: "1" = send reports. */
export const REPORT_SWITCH_KEY = "penguin.reportErrors";
export const DEDUP_WINDOW_MS = 60_000;
export const PER_MINUTE = 20;
export const PER_PAGE = 100;
/** How long a report waits for others to share its request. */
export const BATCH_DELAY_MS = 2_000;
/** The server's own cap on one request's reports (api/types.ts BROWSER_ERRORS_MAX_BATCH). */
const MAX_BATCH = 20;
const MESSAGE_MAX = 500;
const STACK_MAX = 4000;
/** Remembered dedup keys before the table is cleared (bounded like the server's). */
const DEDUP_KEYS_MAX = 200;

/** The project the page is on (state/project.tsx keeps the selection under this key). */
const PROJECT_KEY = "penguin.lastProjectId";

export interface BrowserErrorInput {
  /** `render`, `rejection`, `window`, `network`, `socket`. */
  kind: string;
  /** Lower-case `[a-z0-9_]`: `network_error`, `socket_call_no_answer`, … */
  code: string;
  message: string;
  stack?: string;
}

/** Where a report goes and when: injectable so a test drives time and the transport. */
export interface ReporterDeps {
  enabled: () => boolean;
  now: () => number;
  send: (reports: BrowserErrorReport[]) => Promise<void>;
  schedule: (run: () => void, ms: number) => void;
  /** The project and session the page is on, when it knows them. */
  context: () => { projectId?: string; sessionId?: string };
}

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function pageContext(): { projectId?: string; sessionId?: string } {
  const out: { projectId?: string; sessionId?: string } = {};
  const projectId = storageGet(PROJECT_KEY);
  if (projectId) out.projectId = projectId;
  const session = /^\/chat\/([^/]+)/.exec(location.pathname)?.[1];
  if (session) out.sessionId = decodeURIComponent(session);
  return out;
}

const defaultDeps: ReporterDeps = {
  enabled: () => storageGet(REPORT_SWITCH_KEY) === "1",
  now: () => Date.now(),
  send: async (reports) => {
    await fetch("/api/errors/browser", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reports }),
      keepalive: true,
    });
  },
  schedule: (run, ms) => void setTimeout(run, ms),
  context: pageContext,
};

export class ErrorReporter {
  readonly #deps: ReporterDeps;
  readonly #lastSent = new Map<string, number>();
  #minuteStart = 0;
  #minuteTaken = 0;
  #pageTaken = 0;
  #queue: BrowserErrorReport[] = [];
  #scheduled = false;

  constructor(deps: ReporterDeps = defaultDeps) {
    this.#deps = deps;
  }

  /** Queues one report, or drops it: switch off, a repeat within the window, or over a cap. */
  report(input: BrowserErrorInput): boolean {
    try {
      if (!this.#deps.enabled()) return false;
      const now = this.#deps.now();
      const key = `${input.kind}\0${input.code}\0${input.message.slice(0, 200)}`;
      const last = this.#lastSent.get(key);
      if (last !== undefined && now - last < DEDUP_WINDOW_MS) return false;
      if (now - this.#minuteStart >= 60_000) {
        this.#minuteStart = now;
        this.#minuteTaken = 0;
      }
      if (this.#minuteTaken >= PER_MINUTE || this.#pageTaken >= PER_PAGE) return false;
      if (this.#lastSent.size >= DEDUP_KEYS_MAX) this.#lastSent.clear();
      this.#lastSent.set(key, now);
      this.#minuteTaken += 1;
      this.#pageTaken += 1;
      const report: BrowserErrorReport = {
        kind: input.kind,
        code: input.code,
        message: input.message.slice(0, MESSAGE_MAX),
        ...this.#deps.context(),
      };
      if (input.stack) report.stack = input.stack.slice(0, STACK_MAX);
      this.#queue.push(report);
      this.#arm();
      return true;
    } catch {
      // Reporting must never be the next error.
      return false;
    }
  }

  #arm(): void {
    if (this.#scheduled) return;
    this.#scheduled = true;
    this.#deps.schedule(() => {
      this.#scheduled = false;
      this.flush();
    }, BATCH_DELAY_MS);
  }

  /** Sends what is queued now, in batches the server takes. */
  flush(): void {
    while (this.#queue.length > 0) {
      const batch = this.#queue.splice(0, MAX_BATCH);
      void this.#deps.send(batch).catch(() => undefined);
    }
  }
}

const reporter = new ErrorReporter();

/** Reports one error the server cannot see (no-op while the browser-side switch is off). */
export function reportBrowserError(input: BrowserErrorInput): void {
  reporter.report(input);
}

function describe(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) {
    return {
      message: `${reason.name}: ${reason.message}`,
      ...(reason.stack ? { stack: reason.stack } : {}),
    };
  }
  return { message: typeof reason === "string" ? reason : String(reason) };
}

/** Whether a rejection is an ApiError — answered (and recorded) by the server, or already reported as status 0. */
function isApiError(reason: unknown): boolean {
  return reason instanceof Error && reason.name === "ApiError";
}

/** The two page-wide listeners: window errors and unhandled rejections. Installed once, before the mount. */
export function installErrorListeners(target: Window = window): void {
  target.addEventListener("error", (event) => {
    // A resource that failed to load fires here too, with no error object; that is the network's, not code's.
    if (typeof ErrorEvent !== "undefined" && !(event instanceof ErrorEvent)) return;
    const { message, stack } = describe(event.error ?? event.message);
    reportBrowserError({
      kind: "window",
      code: "window_error",
      message,
      ...(stack ? { stack } : {}),
    });
  });
  target.addEventListener("unhandledrejection", (event) => {
    if (isApiError(event.reason)) return;
    const { message, stack } = describe(event.reason);
    reportBrowserError({
      kind: "rejection",
      code: "unhandled_rejection",
      message,
      ...(stack ? { stack } : {}),
    });
  });
}
