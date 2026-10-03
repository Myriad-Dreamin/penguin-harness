/**
 * Where the machine connection's timings go (PRFC-0008): a sink, or nothing.
 *
 * Every collection point on the way to a machine — the ssh session coming up, each command on
 * its stdin, each SOCKS handshake, each stage of a connect — asks `timingsSink()` first and
 * does nothing else when it answers null. That is the whole cost while telemetry is off: one
 * read of a slot and one comparison per point, no clock read, no allocation, no timer.
 *
 * The slot is PROCESS-wide (a `Symbol.for` key on globalThis), not a module variable, because
 * a held ssh session outlives the platform generation that opened it: it is delivered across a
 * hot push and keeps running the code of the build that created it (ssh-session.ts). A module
 * variable would leave that session reporting to a generation that is gone; a slot read at
 * each call reports to whichever generation set it last.
 *
 * Samples carry shape only — durations, counts, exit codes, stage names — and the machine's
 * address as the correlation key. Never a command's text, its output, or a path.
 */

/** One fact from a collection point: PRFC-0008's `Sample`, as far as machines use it. */
export interface MachineSample {
  /** When it was recorded, epoch ms. */
  ts: number;
  /** The collection point, named for its layer: `machine.ssh.command`, `machine.connect.stage`, … */
  probe: string;
  durMs?: number;
  n?: number;
  /** `ok`, `error`, or the point's own word (`timeout`, `exit`). */
  status?: string;
  keys: { machine: string };
  attrs?: Record<string, string | number | boolean>;
}

/** Takes a sample. Must not throw into the caller; a sink that does is caught. */
export type TimingsSink = (sample: MachineSample) => void;

const SLOT = Symbol.for("penguin.machines.timingsSink");
type Slotted = { [SLOT]?: TimingsSink | null };

/** The sink while telemetry is on; null while it is off. */
export function timingsSink(): TimingsSink | null {
  return (globalThis as Slotted)[SLOT] ?? null;
}

/**
 * Switches the machine collection points on (a sink) or off (null). Whoever owns the switch
 * calls it — at boot and whenever the setting changes; flushes what the SOCKS tally holds
 * before a sink is taken away, so switching off does not lose the last window silently.
 */
export function setTimingsSink(sink: TimingsSink | null): void {
  if (sink === null) flushHandshakes();
  (globalThis as Slotted)[SLOT] = sink;
}

/** Hands a sample to the sink, if there is one; a failing sink never fails the connection. */
export function emit(sample: MachineSample): void {
  const sink = timingsSink();
  if (sink === null) return;
  try {
    sink(sample);
  } catch {
    // Telemetry is an instrument, not a dependency: its failure is not the machine's.
  }
}

/** How long the SOCKS handshakes to one machine are tallied before they are one sample. */
export const HANDSHAKE_WINDOW_MS = 10_000;

/**
 * SOCKS handshakes, tallied per machine. There is one per request the proxy forwards (its
 * agent keeps no socket alive), so one sample each would turn a busy page into most of the
 * buffer; a window per machine says how many, how many failed, and the slowest — which is
 * what "how often and how slow" asks. The timer exists only while a window has something in
 * it, and only while telemetry is on.
 */
const handshakes = new Map<
  string,
  { since: number; n: number; errors: number; totalMs: number; maxMs: number }
>();
let handshakeTimer: ReturnType<typeof setTimeout> | null = null;

/** One SOCKS handshake to `machine` took `durMs`; `ok` false when it failed. */
export function tallyHandshake(machine: string, durMs: number, ok: boolean): void {
  if (timingsSink() === null) return;
  let entry = handshakes.get(machine);
  if (entry === undefined) {
    entry = { since: Date.now(), n: 0, errors: 0, totalMs: 0, maxMs: 0 };
    handshakes.set(machine, entry);
  }
  entry.n += 1;
  if (!ok) entry.errors += 1;
  entry.totalMs += durMs;
  entry.maxMs = Math.max(entry.maxMs, durMs);
  if (handshakeTimer === null) {
    handshakeTimer = setTimeout(flushHandshakes, HANDSHAKE_WINDOW_MS);
    handshakeTimer.unref?.();
  }
}

/** Emits every open window as one `machine.socks.handshake` sample and forgets them. */
export function flushHandshakes(): void {
  if (handshakeTimer !== null) clearTimeout(handshakeTimer);
  handshakeTimer = null;
  for (const [machine, entry] of handshakes) {
    emit({
      ts: Date.now(),
      probe: "machine.socks.handshake",
      durMs: round(entry.maxMs),
      n: entry.n,
      status: entry.errors === 0 ? "ok" : "error",
      keys: { machine },
      attrs: {
        errors: entry.errors,
        totalMs: round(entry.totalMs),
        windowMs: Date.now() - entry.since,
      },
    });
  }
  handshakes.clear();
}

/** Milliseconds to a tenth: a sample is read by a person, and sub-ms digits are noise. */
export function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}

/** A SOCKS dial, tallied into its machine's handshake window; while telemetry is off, just dials. */
export async function timedDial<T>(machine: string, dial: () => Promise<T>): Promise<T> {
  if (timingsSink() === null) return dial();
  const start = performance.now();
  try {
    const socket = await dial();
    tallyHandshake(machine, performance.now() - start, true);
    return socket;
  } catch (err) {
    tallyHandshake(machine, performance.now() - start, false);
    throw err;
  }
}

/** A command's answer when the machine said nothing before its timeout. */
export const NO_ANSWER = "the machine did not answer in time";

/**
 * One command on a machine's session, as a `machine.ssh.command` sample: from the ask to the
 * answer (its wait behind the session's other commands included), its exit code and how much it
 * carried on stdin — never its text, which names paths. While telemetry is off, just runs it.
 */
export function timedCommand<R extends { code: number; output: string }>(
  machine: string,
  inputBytes: number,
  run: () => Promise<R>,
): Promise<R> {
  if (timingsSink() === null) return run();
  const start = performance.now();
  return run().then((result) => {
    emit({
      ts: Date.now(),
      probe: "machine.ssh.command",
      durMs: round(performance.now() - start),
      status:
        result.code === 0
          ? "ok"
          : result.code === 255 && result.output === NO_ANSWER
            ? "timeout"
            : "exit",
      keys: { machine },
      attrs: { code: result.code, inputBytes },
    });
    return result;
  });
}
