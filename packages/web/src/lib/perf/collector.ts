/**
 * The page's telemetry collector (PRFC-0008, browser half). Loaded by a dynamic import from
 * ./switch.ts only once `/api/me` says telemetry is on, so none of this is in the entry bundle,
 * and none of it runs — no observer, no listener, no timer — while telemetry is off.
 *
 * What it records, all shape and never content (the server keeps only `web.*` samples of
 * numbers and short strings, see server telemetry/browser.ts):
 *
 * - `web.boot` — once per page: navigation, the entry script's download and the first paints,
 *   from the browser's own Navigation / Resource / Paint Timing (buffered), so the boot path
 *   itself carries no marks.
 * - `web.longtasks` — long tasks and their blocking time (duration past 50 ms), summed per send
 *   window; not attributed to a script.
 * - `web.session.open` / `web.turn` — a session's history load, then each turn, from the socket
 *   frame to the React commit, in segments (see StreamProbe).
 * - `web.socket.connect` and `web.sessions.fanout` arrive from their hooks via switch.ts.
 *
 * Samples are queued and posted in batches. A 409 from the intake means the switch went off on
 * the server: the collector stops itself. Any other failure drops the batch — a telemetry
 * outage must never become a retry storm.
 */

/** A sample as a hook hands it over; the server stamps the time. */
export interface PerfSampleInput {
  probe: string;
  durMs?: number;
  bytes?: number;
  n?: number;
  status?: string;
  session?: string;
  attrs?: Record<string, string | number | boolean>;
}

/** Where each kind of report goes. The error reports (a separate intake that stays open while telemetry is off) join here by their own kind. */
export const REPORT_URLS = {
  sample: "/api/telemetry/samples",
} as const;
export type ReportKind = keyof typeof REPORT_URLS;

/** Posts one JSON report; resolves to the HTTP status (0 when the request did not complete). */
export async function sendReport(kind: ReportKind, body: unknown): Promise<number> {
  try {
    const res = await fetch(REPORT_URLS[kind], {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Lets the last batch leave with a page that is being closed.
      keepalive: true,
    });
    return res.status;
  } catch {
    return 0;
  }
}

/** How often the queue is sent, and the most one post carries (the server caps at 200). */
const FLUSH_MS = 5_000;
const BATCH_MAX = 100;
/** The queue's bound: past it, new samples are dropped until the next send. */
const QUEUE_MAX = 500;
/** A long task blocks the main thread for whatever it runs past this. */
const LONG_TASK_BUDGET_MS = 50;

const round = (ms: number): number => Math.round(ms * 10) / 10;

/**
 * One session's timings: its history load, then every turn, split into the segments the page
 * spends between a socket frame and what is on screen.
 *
 * - reduce: time inside the stream controller's handlers (the frame's reducer work);
 * - wait: from the first frame after a commit to the next commit — the coalescing point's
 *   delay (one animation frame, and at least 120 ms between commits);
 * - render: from that commit to React's layout effect for it — rendering the new model.
 *
 * The open sample adds `fetchMs`, the history request itself. A turn runs from the first
 * frame after the session goes `running` to the last render before it leaves it.
 */
export class StreamProbe {
  #open: { at: number; fetchMs: number } | null;
  #frames = 0;
  #reduceMs = 0;
  #waitMs = 0;
  #maxWaitMs = 0;
  #renderMs = 0;
  #maxRenderMs = 0;
  #commits = 0;
  #firstFrameAt: number | null = null;
  #lastRenderAt: number | null = null;
  #pendingFrameAt: number | null = null;
  #commitAt: number | null = null;
  #inTurn = false;
  #loaded = false;

  constructor(
    private readonly sessionId: string,
    openedAt: number,
    private readonly add: (sample: PerfSampleInput) => void,
  ) {
    this.#open = { at: openedAt, fetchMs: 0 };
  }

  /** A history request's duration (the open's first, and any later page). */
  fetched(ms: number): void {
    if (this.#open !== null) this.#open.fetchMs += ms;
  }

  /** One socket frame through the controller: `start`/`end` bracket its reducer work. */
  frame(start: number, end: number): void {
    this.#frames += 1;
    this.#reduceMs += end - start;
    this.#firstFrameAt ??= start;
    this.#pendingFrameAt ??= start;
  }

  /** The coalescing point committed a new model version. */
  commit(): void {
    const now = performance.now();
    if (this.#pendingFrameAt !== null) {
      const wait = now - this.#pendingFrameAt;
      this.#waitMs += wait;
      this.#maxWaitMs = Math.max(this.#maxWaitMs, wait);
      this.#pendingFrameAt = null;
    }
    this.#commitAt ??= now;
  }

  /** React ran the layout effects of a committed version. */
  rendered(): void {
    if (this.#commitAt === null) return;
    const now = performance.now();
    const render = now - this.#commitAt;
    this.#commitAt = null;
    this.#commits += 1;
    this.#renderMs += render;
    this.#maxRenderMs = Math.max(this.#maxRenderMs, render);
    this.#lastRenderAt = now;
    // The open ends with the first version rendered after the history arrived.
    if (this.#open !== null && this.#loaded) this.#finishOpen(now);
  }

  /** The probe arrived after the history had loaded: no open sample, turns only. */
  skipOpen(): void {
    this.#open = null;
    this.#reset();
  }

  /** The history load settled (the controller's `loading` went false). */
  loaded(): void {
    this.#loaded = true;
  }

  /** The session's task state; a turn is one stretch of `running`. */
  taskState(state: string): void {
    if (state === "running" && !this.#inTurn) {
      if (this.#open === null) this.#reset();
      this.#inTurn = true;
    } else if (state !== "running" && this.#inTurn) {
      this.#inTurn = false;
      if (this.#open === null) this.#finishTurn();
    }
  }

  #finishOpen(now: number): void {
    const open = this.#open;
    if (open === null) return;
    this.add({
      probe: "web.session.open",
      durMs: round(now - open.at),
      n: this.#frames,
      session: this.sessionId,
      attrs: {
        fetchMs: round(open.fetchMs),
        ...this.#segments(),
      },
    });
    this.#open = null;
    this.#reset();
  }

  #finishTurn(): void {
    if (this.#firstFrameAt === null || this.#lastRenderAt === null) return this.#reset();
    this.add({
      probe: "web.turn",
      durMs: round(this.#lastRenderAt - this.#firstFrameAt),
      n: this.#frames,
      session: this.sessionId,
      attrs: this.#segments(),
    });
    this.#reset();
  }

  #segments(): Record<string, number> {
    return {
      commits: this.#commits,
      reduceMs: round(this.#reduceMs),
      waitMs: round(this.#waitMs),
      maxWaitMs: round(this.#maxWaitMs),
      renderMs: round(this.#renderMs),
      maxRenderMs: round(this.#maxRenderMs),
    };
  }

  #reset(): void {
    this.#frames = 0;
    this.#reduceMs = 0;
    this.#waitMs = 0;
    this.#maxWaitMs = 0;
    this.#renderMs = 0;
    this.#maxRenderMs = 0;
    this.#commits = 0;
    this.#firstFrameAt = null;
    this.#lastRenderAt = null;
    this.#pendingFrameAt = null;
  }
}

/** The boot figures the browser already holds, as one sample; null until the first contentful paint is known. */
export function bootSample(
  entries: {
    navigation: PerformanceNavigationTiming | undefined;
    paints: readonly PerformanceEntry[];
    entryScript: PerformanceResourceTiming | undefined;
  },
  longTasks: { count: number; blockingMs: number },
): PerfSampleInput | null {
  const fcp = entries.paints.find((p) => p.name === "first-contentful-paint");
  if (fcp === undefined) return null;
  const fp = entries.paints.find((p) => p.name === "first-paint");
  const nav = entries.navigation;
  const script = entries.entryScript;
  const attrs: Record<string, number | boolean> = {
    fcpMs: round(fcp.startTime),
    longTasks: longTasks.count,
    blockingMs: round(longTasks.blockingMs),
  };
  if (fp !== undefined) attrs.fpMs = round(fp.startTime);
  if (nav !== undefined) {
    attrs.ttfbMs = round(nav.responseStart);
    attrs.domInteractiveMs = round(nav.domInteractive);
    if (nav.domContentLoadedEventEnd > 0) attrs.dclMs = round(nav.domContentLoadedEventEnd);
    if (nav.loadEventEnd > 0) attrs.loadMs = round(nav.loadEventEnd);
  }
  if (script !== undefined) {
    attrs.entryMs = round(script.responseEnd);
    // From the entry script's last byte to the first contentful paint: parse, run, mount.
    attrs.entryToPaintMs = round(fcp.startTime - script.responseEnd);
    attrs.entryCached = script.transferSize === 0;
  }
  return {
    probe: "web.boot",
    durMs: round(fcp.startTime),
    ...(script !== undefined && script.transferSize > 0 ? { bytes: script.transferSize } : {}),
    attrs,
  };
}

export interface PerfCollector {
  add(sample: PerfSampleInput): void;
  stream(sessionId: string, openedAt: number): StreamProbe;
  /** Sends what is queued, then removes the observer, the listener and the timer. */
  stop(): void;
}

/**
 * Starts collecting: the observer, the send timer and the page-hide listener. `onRefused` is
 * called when the intake answers 409 — the switch went off on the server.
 */
export function startCollector(opts: { onRefused: () => void }): PerfCollector {
  let queue: PerfSampleInput[] = [];
  let stopped = false;
  let longTaskCount = 0;
  let longTaskBlockingMs = 0;
  let longTaskMaxMs = 0;
  let bootSent = false;
  const paints: PerformanceEntry[] = [];

  const add = (sample: PerfSampleInput) => {
    if (stopped || queue.length >= QUEUE_MAX) return;
    queue.push(sample);
  };

  const entryScript = (): PerformanceResourceTiming | undefined => {
    const src = document.querySelector<HTMLScriptElement>("script[type=module][src]")?.src;
    if (src === undefined) return undefined;
    return performance.getEntriesByName(src, "resource")[0] as
      PerformanceResourceTiming | undefined;
  };

  const tryBoot = () => {
    if (bootSent) return;
    const sample = bootSample(
      {
        navigation: performance.getEntriesByType("navigation")[0] as
          PerformanceNavigationTiming | undefined,
        paints,
        entryScript: entryScript(),
      },
      { count: longTaskCount, blockingMs: longTaskBlockingMs },
    );
    if (sample === null) return;
    bootSent = true;
    add(sample);
    // The boot sample carried the long tasks so far; the windows after it start from zero.
    longTaskCount = 0;
    longTaskBlockingMs = 0;
    longTaskMaxMs = 0;
  };

  let observer: PerformanceObserver | null = null;
  if (typeof PerformanceObserver !== "undefined") {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === "paint") paints.push(entry);
        else if (entry.entryType === "longtask") {
          longTaskCount += 1;
          longTaskBlockingMs += Math.max(0, entry.duration - LONG_TASK_BUDGET_MS);
          longTaskMaxMs = Math.max(longTaskMaxMs, entry.duration);
        }
      }
      tryBoot();
    });
    const supported = PerformanceObserver.supportedEntryTypes ?? [];
    for (const type of ["paint", "longtask"]) {
      if (supported.includes(type)) observer.observe({ type, buffered: true });
    }
  }

  const flush = () => {
    if (!bootSent) tryBoot();
    if (longTaskCount > 0 && bootSent) {
      add({
        probe: "web.longtasks",
        durMs: round(longTaskBlockingMs),
        n: longTaskCount,
        attrs: { maxMs: round(longTaskMaxMs) },
      });
      longTaskCount = 0;
      longTaskBlockingMs = 0;
      longTaskMaxMs = 0;
    }
    while (queue.length > 0) {
      const batch = queue.slice(0, BATCH_MAX);
      queue = queue.slice(BATCH_MAX);
      void sendReport("sample", { samples: batch }).then((status) => {
        if (status === 409 && !stopped) {
          halt();
          opts.onRefused();
        }
      });
    }
  };

  const timer = window.setInterval(flush, FLUSH_MS);
  const onHide = () => {
    if (document.visibilityState === "hidden") flush();
  };
  document.addEventListener("visibilitychange", onHide);

  /** Stops without sending: the server refused, or `stop` already sent. */
  function halt() {
    stopped = true;
    queue = [];
    observer?.disconnect();
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onHide);
  }

  return {
    add,
    stream: (sessionId, openedAt) => new StreamProbe(sessionId, openedAt, add),
    stop() {
      if (stopped) return;
      flush();
      halt();
    },
  };
}
