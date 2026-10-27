/**
 * FuzzerClock — DESIGN.md §4.2's server-side mock, mounted through bootAppDeps's replacements
 * ([SystemClock, { now }]): controllable stepping, controllable jumps (across the 30-day
 * session TTL), and a monotonic guarantee (no rollback inside the run).
 */
export class FuzzerClock {
  private ms: number;
  private readonly floorMs: number;

  constructor(startIso: string) {
    this.ms = Date.parse(startIso);
    this.floorMs = this.ms;
  }

  /** The Clock seam's only member. */
  now(): Date {
    return new Date(this.ms);
  }

  iso(): string {
    return new Date(this.ms).toISOString();
  }

  /** Advance by a bounded step (the "every N calls, 1 second" policy). */
  step(ms: number): void {
    this.ms = Math.max(this.ms + ms, this.ms);
  }

  /** Jump forward across a threshold (the TTL/renewal boundary), never backward. */
  jumpForwardDays(days: number): void {
    this.ms = Math.max(this.ms + days * 86_400_000, this.ms);
  }

  get elapsedMs(): number {
    return this.ms - this.floorMs;
  }
}
