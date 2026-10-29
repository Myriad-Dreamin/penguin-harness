/**
 * FuzzerClock — DESIGN.md §4.2's server-side mock, mounted through bootAppDeps's replacements
 * ([SystemClock, { now }]): controllable stepping, controllable jumps (across the 30-day
 * session TTL), and a monotonic guarantee (no rollback inside the run).
 *
 * `source`, when given, is the harness's own clock: the server's clock then starts at the same
 * instant it always does and follows the source's *advance*, so a clock the CLI leg moves (see
 * virtual-time.ts) is the same "now" the server reads — one bubble, one calendar.
 */
export class FuzzerClock {
  private readonly startMs: number;
  private readonly source: (() => number) | null;
  private readonly sourceOrigin: number;
  private offset = 0;

  constructor(startIso: string, source?: () => number) {
    this.startMs = Date.parse(startIso);
    this.source = source ?? null;
    this.sourceOrigin = source?.() ?? 0;
  }

  private readMs(): number {
    return this.source === null
      ? this.startMs + this.offset
      : this.startMs + (this.source() - this.sourceOrigin) + this.offset;
  }

  /** The Clock seam's only member. */
  now(): Date {
    return new Date(this.readMs());
  }

  iso(): string {
    return new Date(this.readMs()).toISOString();
  }

  /** Advance by a bounded step (the "every N calls, 1 second" policy). */
  step(ms: number): void {
    this.offset += Math.max(0, ms);
  }

  /** Jump forward across a threshold (the TTL/renewal boundary), never backward. */
  jumpForwardDays(days: number): void {
    this.offset += Math.max(0, days * 86_400_000);
  }

  get elapsedMs(): number {
    return this.readMs() - this.startMs;
  }
}
