/**
 * A jumpable clock for the fuzz harness — the Node shape of Go's `testing/synctest`.
 *
 * synctest hands a test a private world whose clock only moves when every goroutine in that
 * world is durably blocked, and then moves it straight to the next timer. The property that
 * matters here: a `--timeout 3s` wait costs no wall time, and a turn that spends 12 s waiting
 * out a recoverable LLM failure's backoff spends none either — the wait is still *observed*,
 * in order, but it is observed on a clock that can be moved.
 *
 * This is that clock for one Node process. Both sides of the harness share it: the CLI's own
 * timers are the process's timers, and the server's Clock seam reads the same value (see
 * FuzzerClock's `source`), so `--timeout` on one side and a scheduled tick on the other agree
 * on what "now" means.
 *
 *   install()            setTimeout/setInterval/clearTimeout/Date.now become the clock's
 *   driveToCompletion()  run one promise; while the process has nothing in flight, move the
 *                        clock to the earliest pending timer and fire it
 *   uninstall()          the globals come back, and the clock is dead
 *
 * Three deliberate differences from synctest:
 *
 *  - **I/O stays real.** A file read, a child process or a socket in flight means the process
 *    is not durably blocked, and the clock waits for it. The CLI leg makes its own hop to the
 *    server in memory (cli/src/fetch-shim.ts) the way synctest's examples use `net.Pipe`: over
 *    a real socket an open stream keeps the process looking busy for as long as it is open, and
 *    the clock would never move.
 *  - **Real time still counts.** The clock runs at real speed and jumps *ahead* on top of it,
 *    so `Date.now()`, file mtimes and the server's own clock stay consistent with each other.
 *    A pure bubble clock (synctest's) would freeze the calendar between jumps, and every
 *    freshness check in the product compares a file's mtime against `Date.now()`.
 *  - **The harness's own deadline is believed last.** synctest knows exactly when its world is
 *    durably blocked; a census of this process's handles only samples one, so the deadline that
 *    exists to end a stuck command (not to test anything) is reached only after a longer
 *    stillness than a product timer needs. See `DEADLINE_GRACE_MS`.
 *
 * Between drives nothing moves the clock: a timer a command left pending fires at the next
 * drive's first idle moment instead of being lost with the globals.
 */

const realSetImmediate = setImmediate;
const realSetTimeout = setTimeout;
const realClearTimeout = clearTimeout;
const realNow = Date.now.bind(Date);

const VIRTUAL: unique symbol = Symbol("penguin-fuzzer-virtual-timer");

/**
 * What `setTimeout` returns while the clock is installed. A real Node handle answers
 * `unref`/`ref`/`hasRef`/`refresh` and coerces to a number, and product code does call those,
 * so this one answers the same way instead of turning a `.unref()` into a TypeError.
 */
export interface VirtualHandle {
  readonly [VIRTUAL]: true;
  readonly id: number;
  unref(): VirtualHandle;
  ref(): VirtualHandle;
  hasRef(): boolean;
  refresh(): VirtualHandle;
  [Symbol.toPrimitive](): number;
}

interface TimerRecord {
  readonly id: number;
  /** Virtual ms the timer is due at. */
  at: number;
  /** The delay it was armed with, for `refresh()`. */
  readonly delay: number;
  readonly fn: () => void;
  /** The period, when this came from `setInterval`. */
  readonly every?: number;
}

function isVirtualHandle(value: unknown): value is VirtualHandle {
  return typeof value === "object" && value !== null && VIRTUAL in value;
}

export class VirtualTime {
  private readonly origin: number;
  private readonly originReal: number;
  private jumped = 0;
  private last: number;
  private seq = 1;
  private readonly timers = new Map<number, TimerRecord>();
  /** Timers that are the harness's own deadline (see `markHarnessDeadline`). */
  private readonly harnessDeadlines = new Set<number>();
  private saved: {
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
    setInterval: typeof setInterval;
    clearInterval: typeof clearInterval;
    dateNow: () => number;
  } | null = null;

  /** Start the clock at `startMs` (default: now); real time counts from here on. */
  constructor(startMs: number = realNow()) {
    this.origin = startMs;
    this.originReal = realNow();
    this.last = startMs;
  }

  /** Current virtual time: the origin, plus real elapsed, plus every jump so far. */
  now(): number {
    const wall = this.origin + (realNow() - this.originReal) + this.jumped;
    this.last = Math.max(this.last, wall);
    return this.last;
  }

  /**
   * The earliest pending timer a jump may fire — a one-shot one — or null when none is armed.
   *
   * An interval is background: a heartbeat, a sweep, a poll that re-arms itself. Firing one
   * never settles the promise a drive is waiting on, and it costs a whole period of virtual
   * time. A stream that outlived its command leaves its heartbeat armed, and those leftovers
   * are the earliest timers in the process: jumping to them steps the clock 20 s at a time and
   * blows through deadlines the command was nowhere near. So the clock jumps only to timers
   * that fire once — the deadlines and backoffs a command actually waits on.
   */
  nextTimer(): { id: number; at: number; delay: number; every: number | null } | null {
    let earliest: TimerRecord | null = null;
    for (const timer of this.timers.values()) {
      if (timer.every !== undefined) continue;
      if (earliest === null || timer.at < earliest.at) earliest = timer;
    }
    return earliest === null
      ? null
      : { id: earliest.id, at: earliest.at, delay: earliest.delay, every: earliest.every ?? null };
  }

  /**
   * Mark a timer as the harness's own safety net (the per-command soft timeout) rather than an
   * event the code under test is waiting on.
   *
   * The driver treats it differently: see `DEADLINE_GRACE_MS`. "Nothing is in flight" is a
   * census of this process's handles, and it has holes — a file read between two of its own
   * callbacks, a promise chain whose next step is a microtask — so a jump taken on that census
   * can fire the harness's deadline while the command was still working. A *product* timer has
   * to fire when it is due (that is the behaviour under test); the harness's own deadline is a
   * claim about the code, so it must be the last thing believed.
   */
  markHarnessDeadline(handle: unknown): void {
    if (typeof handle === "number") this.harnessDeadlines.add(handle);
    else if (isVirtualHandle(handle)) this.harnessDeadlines.add(handle.id);
  }

  /** Whether this timer is the harness's own deadline (see `markHarnessDeadline`). */
  isHarnessDeadline(id: number): boolean {
    return this.harnessDeadlines.has(id);
  }

  pending(): number {
    return this.timers.size;
  }

  /** How far the clock has jumped ahead of real time — the waiting this leg did not spend. */
  get jumpedMs(): number {
    return this.jumped;
  }

  /**
   * Move the clock to `target`, firing — in order — every timer due at or before it.
   * Returns how many fired. An interval re-arms on the clock it fired on, so one call is one
   * period; the clock never moves backwards.
   */
  advanceTo(target: number): number {
    let fired = 0;
    for (;;) {
      let next: TimerRecord | null = null;
      for (const timer of this.timers.values()) {
        if (timer.at > target) continue;
        if (next === null || timer.at < next.at || (timer.at === next.at && timer.id < next.id)) {
          next = timer;
        }
      }
      if (next === null) break;
      this.jumpTo(next.at);
      if (next.every === undefined) {
        this.timers.delete(next.id);
        this.harnessDeadlines.delete(next.id);
      } else next.at = this.now() + next.every;
      fired += 1;
      try {
        next.fn();
      } catch {
        // A timer callback's own throw is the code under test's business, not the clock's.
      }
    }
    this.jumpTo(target);
    return fired;
  }

  private jumpTo(at: number): void {
    const now = this.now();
    if (at > now) {
      this.jumped += at - now;
      this.last = at;
    }
  }

  install(): void {
    if (this.saved !== null) return;
    this.saved = {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      dateNow: Date.now,
    };
    globalThis.setTimeout = ((
      callback: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) =>
      this.schedule(
        () => callback(...args),
        Number(delay ?? 0),
      ) as unknown as ReturnType<typeof setTimeout>) as typeof setTimeout;
    globalThis.setInterval = ((
      callback: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) =>
      this.schedule(
        () => callback(...args),
        Number(delay ?? 0),
        Math.max(1, Number(delay ?? 0)),
      ) as unknown as ReturnType<typeof setInterval>) as typeof setInterval;
    globalThis.clearTimeout = ((handle: unknown) => {
      if (typeof handle === "number") {
        this.timers.delete(handle);
        this.harnessDeadlines.delete(handle);
      } else if (isVirtualHandle(handle)) {
        this.timers.delete(handle.id);
        this.harnessDeadlines.delete(handle.id);
      } else if (this.saved !== null) this.saved.clearTimeout(handle as ReturnType<typeof setTimeout>);
    }) as typeof clearTimeout;
    globalThis.clearInterval = globalThis.clearTimeout as unknown as typeof clearInterval;
    Date.now = () => this.now();
  }

  uninstall(): void {
    if (this.saved === null) return;
    globalThis.setTimeout = this.saved.setTimeout;
    globalThis.clearTimeout = this.saved.clearTimeout;
    globalThis.setInterval = this.saved.setInterval;
    globalThis.clearInterval = this.saved.clearInterval;
    Date.now = this.saved.dateNow;
    this.saved = null;
    this.timers.clear();
  }

  private schedule(fn: () => void, delayMs: number, every?: number): VirtualHandle {
    const id = this.seq++;
    const delay = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0;
    this.timers.set(id, {
      id,
      at: this.now() + delay,
      delay,
      fn,
      ...(every !== undefined ? { every } : {}),
    });
    return this.handle(id);
  }

  private handle(id: number): VirtualHandle {
    const handle: VirtualHandle = {
      [VIRTUAL]: true,
      id,
      unref() {
        return handle;
      },
      ref() {
        return handle;
      },
      hasRef() {
        return false;
      },
      refresh: () => {
        const timer = this.timers.get(id);
        if (timer !== undefined) timer.at = this.now() + timer.delay;
        return handle;
      },
      [Symbol.toPrimitive]: () => id,
    };
    return handle;
  }
}

/** Real milliseconds, even while a virtual clock is installed. */
export function realMs(): number {
  return realNow();
}

/** One real event-loop turn: lets pending microtasks and I/O callbacks run. */
export function realTurn(): Promise<void> {
  return new Promise((resolve) => realSetImmediate(() => resolve()));
}

/** Sleep in real time, even while a virtual clock is installed. */
export function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => realSetTimeout(() => resolve(), ms));
}

/**
 * "Nothing in this process can make progress without time" — the state a jump is allowed in.
 *
 * The census is `process.getActiveResourcesInfo()`, the libuv handles and requests this
 * process has in flight, against a baseline taken when the process is known to be idle. Timers
 * are the clock's own and mean nothing here; an `Immediate` is a tick away, and the driver's
 * own turns must not count themselves in.
 *
 * The baseline absorbs *handles that live between commands* — the harness's own listener, this
 * process's stdio pipes, a socket a timed-out command leaked — and never work in flight. A
 * file read is a request, not a handle: it exists only while it runs, so one that is running is
 * the process making progress, whatever the baseline says. Absorbing them cost a false stall —
 * a command loading modules for the first time has dozens of reads in flight, and after one
 * sighting of that count the driver could not tell a working process from an idle one.
 */
const WORK_IN_FLIGHT = new Set([
  "FSReqPromise",
  "FSReqCallback",
  "CloseReq",
  "WriteWrap",
  "ShutdownWrap",
  "Zlib",
]);

export class Quiescence {
  private baseline: Record<string, number> = {};

  constructor() {
    // A fresh baseline at creation: the caller that keeps one for the whole run calls
    // `observe()` again when it knows the process is idle.
    this.observe();
  }

  /**
   * Raise the baseline to what is in flight right now. Call it when the process *should* be
   * idle — a socket a timed-out command leaked must not wedge every later drive.
   */
  observe(): void {
    for (const [type, count] of Object.entries(Quiescence.census())) {
      if (WORK_IN_FLIGHT.has(type)) continue;
      this.baseline[type] = Math.max(this.baseline[type] ?? 0, count);
    }
  }

  /** What is in flight above the baseline, as `type+count` — empty when the process is idle. */
  busy(): string {
    const extra: string[] = [];
    for (const [type, count] of Object.entries(Quiescence.census())) {
      if (type === "Timeout" || type === "Immediate" || type === "Microtask") continue;
      const above = WORK_IN_FLIGHT.has(type) ? count : count - (this.baseline[type] ?? 0);
      if (above > 0) extra.push(`${type}+${above}`);
    }
    return extra.join(",");
  }

  private static census(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const type of process.getActiveResourcesInfo()) counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }
}

export interface DriveOptions {
  /**
   * Real-time bound on one drive. The command's own deadlines are virtual and fire in order;
   * this only catches a wait no timer will ever release.
   */
  watchdogMs?: number;
  /** How much virtual time one drive may move through before it gives up. */
  maxAdvanceMs?: number;
  /** How many timers one drive may fire before it gives up. */
  maxTimers?: number;
  /** The process-wide idle baseline; one per run, kept current by the caller. */
  quiet?: Quiescence;
  /** One line per loop turn, for a leg that needs to see what the driver saw. */
  trace?: (line: string) => void;
}

export type Driven<T> =
  | { ok: true; value: T; advancedMs: number; realMs: number; timers: number }
  | {
      ok: false;
      /** `watchdog`: real-time bound hit. `deadlock`: nothing in flight, no timer pending. */
      why: "watchdog" | "cap" | "deadlock";
      advancedMs: number;
      realMs: number;
      timers: number;
    };

/** How long "nothing in flight, no timer pending" must hold before it is called a deadlock. */
const DEADLOCK_MS = 250;
/**
 * How long the process must look idle before the clock may move.
 *
 * "Nothing in flight" is a sample, not a state: a read is a chain of its own callbacks (open,
 * read, close) with sub-millisecond gaps, and a module loading for the first time reads,
 * compiles and links in steps that register nothing at all. A jump taken in one of those gaps
 * fires deadlines the code was nowhere near — measured on this product, a `run` step's real
 * work between two requests can leave the process looking idle for tens of milliseconds.
 *
 * A command that is genuinely waiting on a deadline stays idle for the whole wait (seconds),
 * so a few tens of milliseconds separates "between two steps" from "blocked" with room to
 * spare, and costs that much real time once per jump.
 */
const QUIET_MS = 50;

/**
 * How long the process must look idle before the harness's *own* deadline may fire.
 *
 * The soft timeout is not product behaviour: it is the harness's claim that a command stopped
 * making progress. The idle census that licenses a jump is a sample of this process's handles,
 * and it has holes the product's own timers do not — a file read between two of its callbacks,
 * a response whose last step is a microtask. A jump taken in one of those holes fires a timer
 * the product armed (correct: that timer was due) *and* the harness's deadline in the same
 * synchronous batch, and the batch wins the race: the command is reported stuck although its
 * work was one callback away. Measured on this leg: ordinary `session ls` / `session rename`
 * calls flagged as stuck, with their response arriving right after the jump, and the same input
 * passing on a rerun.
 *
 * So the clock still jumps to product timers as soon as the stillness holds, but a jump whose
 * only purpose is to reach the harness's deadline waits this much longer. A command that really
 * is stuck costs a second of real time to say so; one that is merely slow gets the second it
 * needed. Anything jumping *past* the deadline (a product timer due later) is unaffected — the
 * deadline is armed earlier, so it is that product timer's jump that fires it, and that is a
 * real 15 s of virtual time observed.
 */
const DEADLINE_GRACE_MS = 1_000;

/**
 * Drive one promise to completion, moving the clock whenever the process is durably blocked.
 *
 * The promise belongs to the code under test and settles by real work (a fetch, a file read) or
 * by a timer. Idle with a timer pending means the next thing that can happen is that timer, so
 * the clock moves to it — synctest's rule, one timer at a time. Idle with nothing pending is a
 * deadlock: no code path left can settle the promise, and saying so beats waiting out the
 * watchdog. A jump that would only reach the harness's own deadline waits `DEADLINE_GRACE_MS`
 * first, since that deadline is a claim about the code rather than an event in it.
 */
export async function driveToCompletion<T>(
  vtime: VirtualTime,
  promise: Promise<T>,
  options: DriveOptions = {},
): Promise<Driven<T>> {
  const watchdogMs = options.watchdogMs ?? 20_000;
  const maxAdvanceMs = options.maxAdvanceMs ?? 600_000;
  const maxTimers = options.maxTimers ?? 5_000;
  const quiet = options.quiet ?? new Quiescence();
  const startedAt = realMs();
  const startVirtual = vtime.now();
  // Held in a box: the assignments happen in the promise's own callbacks, which TypeScript's
  // narrowing cannot see, and a plain `let` would read as `null` for the rest of the loop.
  const settled: { current: { value: T } | { error: unknown } | null } = { current: null };
  promise.then(
    (value) => {
      settled.current ??= { value };
    },
    (error: unknown) => {
      settled.current ??= { error };
    },
  );
  let timers = 0;
  let stillSince: number | null = null;
  // The trace is a transition log, not a per-turn one: a command spends most of its turns in
  // the same state, and the shape worth reading is when it changes.
  let traced = "";
  const say = (state: string, line: string): void => {
    if (options.trace === undefined || traced === state) return;
    traced = state;
    options.trace(line);
  };
  const report = () => ({
    advancedMs: vtime.now() - startVirtual,
    realMs: realMs() - startedAt,
    timers,
  });

  for (;;) {
    await realTurn();
    await realTurn();
    const answer = settled.current;
    if (answer !== null) {
      if ("error" in answer) throw answer.error;
      return { ok: true, value: answer.value, ...report() };
    }
    if (realMs() - startedAt > watchdogMs) return { ok: false, why: "watchdog", ...report() };
    const busy = quiet.busy();
    if (busy !== "") {
      say(`busy:${busy}`, `busy ${busy}`);
      stillSince = null;
      continue;
    }
    const next = vtime.nextTimer();
    if (next === null) {
      say("waiting", `idle, no timer pending (${vtime.pending()} armed)`);
      stillSince ??= realMs();
      if (realMs() - stillSince > DEADLOCK_MS) return { ok: false, why: "deadlock", ...report() };
      await realSleep(2);
      continue;
    }
    if (stillSince === null) {
      stillSince = realMs();
      say("waiting", `idle, ${vtime.pending()} timer(s) armed, waiting for the stillness to hold`);
      await realSleep(1);
      continue;
    }
    // The harness's own deadline is a claim about the code, not an event in it: reach it only
    // after a longer stillness (see DEADLINE_GRACE_MS). A product timer jumps as before.
    const stillFor = vtime.isHarnessDeadline(next.id) ? DEADLINE_GRACE_MS : QUIET_MS;
    if (realMs() - stillSince < stillFor) {
      await realSleep(1);
      continue;
    }
    stillSince = null;
    const targetAt = next.at < vtime.now() ? vtime.now() : next.at;
    traced = "";
    options.trace?.(
      `jump +${targetAt - vtime.now()}ms to timer #${next.id} ` +
        `(delay ${next.delay}ms, every ${next.every ?? "-"}, ${vtime.pending()} armed)`,
    );
    if (targetAt - startVirtual > maxAdvanceMs) return { ok: false, why: "cap", ...report() };
    if (timers >= maxTimers) return { ok: false, why: "cap", ...report() };
    timers += vtime.advanceTo(targetAt);
  }
}
