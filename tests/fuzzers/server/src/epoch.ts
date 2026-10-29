/**
 * Bounded state epochs: the rig is replaced before its own history becomes the cost.
 *
 * One rig for a whole run means one data root for a whole run. Every `run` a leg drives without
 * `--session` creates a Session, and Sessions are only half of it: rows, workspace files and the
 * in-memory indexes grow with them, and commands that read the collection (`session ls`, the
 * idle poll, `agents` statistics) pay for the whole history on every call. Measured on the CLI
 * leg before this file existed: `session ls` at 1.4–1.8 s after a few thousand `run` calls,
 * peak RSS 1,726 MB, and an exec/s that fell from 131 to 15 as the run went on — the engine was
 * spending its time paying for state instead of exploring it.
 *
 * So: after `budget` commands the rig is torn down and a fresh one booted, **always between two
 * calls**. What the search learned survives — libFuzzer keeps the corpus and its coverage
 * feedback in the engine, not in the rig; only the accumulated state is dropped. What does not
 * survive is the state a finding might depend on, which is why `finding.ts` saves the database
 * beside the input: a replay is the saved input against the saved rig, not a guess.
 *
 * Rotation must never hide a product regression. The rule a rotation would otherwise break is
 * "cost grows with the number of Sessions" — which is a fact about the product, not about the
 * rig. `growth` keeps that reading: every command's latency is filed under the Session count it
 * ran at, across every epoch, so the run still answers "what does a command cost at 800
 * Sessions" even though no single epoch ever holds 800. `FUZZ_EPOCH_CALLS=0` turns rotation off
 * entirely for the full-curve run.
 */
import fs from "node:fs";
import { realMs, realSleep, type Quiescence } from "./virtual-time.js";

/**
 * Wait until the process has nothing in flight, so a teardown never pulls the floor out from
 * under a task the code under test is still running.
 *
 * A rotation's clock is already uninstalled, so no timer can fire during this wait — what is
 * left is real I/O, and that is what `Quiescence` counts. Two clean readings ten milliseconds
 * apart, not one: a single reading can land between a callback and the read it is about to
 * start, and the first reading of an idle process should not cost half a second to confirm.
 */
export async function settleQuiet(quiet: Quiescence, timeoutMs = 10_000): Promise<boolean> {
  const deadline = realMs() + timeoutMs;
  let clean = 0;
  for (;;) {
    clean = quiet.busy() === "" ? clean + 1 : 0;
    if (clean >= 2) return true;
    if (realMs() >= deadline) return false;
    await realSleep(10);
  }
}

/** The latencies kept per epoch and per state bucket; past it, every `stride`-th sample. */
const LATENCY_CAP = 8_192;
/** How many commands share one state reading (the reading costs a database query). */
const PROBE_EVERY = 25;

/**
 * The rig's on-disk size: SQLite's main file plus the write-ahead log it is actually in. A
 * database that answers 4 KB while holding every row is the WAL, not an empty file.
 */
export function databaseBytes(dbPath: string): number {
  let total = 0;
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      total += fs.statSync(`${dbPath}${suffix}`).size;
    } catch {
      // A file that does not exist yet contributes nothing.
    }
  }
  return total;
}

export interface EpochOptions {
  /** Commands per epoch; 0 or less disables rotation (the growth probe's full run). */
  budget: number;
  /**
   * Boot a fresh rig: a new data root, a new server, and whatever the leg's commands read
   * (`PENGUIN_HOME`, `PENGUIN_API_URL`, the fetch shim, the id pools). The leg owns the order —
   * a rotation calls this with the previous rig already torn down.
   */
  boot: () => Promise<void>;
  /** The premises every command rests on; after every boot, the first one included. */
  setup: () => Promise<void>;
  /** Tear the current rig down; awaited before the next `boot`. */
  teardown: () => Promise<void>;
  /**
   * Let work the last command left in flight finish, so a teardown never pulls the floor out
   * from under a running task. False means it never went quiet within its own bound — recorded,
   * because that is itself a reading (a command leaked something).
   */
  settle: () => Promise<boolean>;
  /** The rig's size right now: `{sessions: 812, dbBytes: 3_100_000}` — at least `sessions`. */
  probe: () => Promise<Record<string, number>>;
  /** How often `probe` is read; defaults to every 25 commands. */
  probeEvery?: number;
}

export interface EpochSample {
  /** 1 for the first rig. */
  index: number;
  commands: number;
  /** Wall time this epoch spent fuzzing — rotation's own cost is not in here. */
  wallMs: number;
  p50: number;
  p95: number;
  max: number;
  /** Commands at or over the leg's slow threshold. */
  slow: number;
  /** Whether the rig went quiet before teardown. */
  quiet: boolean;
  /** What `probe` said at the epoch's end. */
  state: Record<string, number>;
}

interface Bucket {
  calls: number;
  slow: number;
  latency: number[];
  seen: number;
}

function pushSample(into: number[], ms: number, seen: number): void {
  const stride = seen > LATENCY_CAP ? Math.ceil(seen / LATENCY_CAP) : 1;
  if (seen % stride === 0) into.push(ms);
}

/** The nearest-rank quantile of a small sample, rounded — a reading, not a measurement. */
function quantile(samples: readonly number[], q: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return Math.round(sorted[index]!);
}

/**
 * The Session-count bucket a reading belongs to: 0, 1, 2–3, 4–7, … — powers of two, because
 * "cost at 800 Sessions" is the question and the exact row count is not.
 */
function sessionsBucket(state: Record<string, number>): number {
  const sessions = Math.max(0, Math.floor(state.sessions ?? 0));
  if (sessions < 1) return 0;
  return 2 ** Math.floor(Math.log2(sessions));
}

function bucketLabel(bucket: number): string {
  if (bucket === 0) return "0";
  if (bucket === 1) return "1";
  return `${bucket}–${bucket * 2 - 1}`;
}

export class Epochs {
  readonly samples: EpochSample[] = [];
  private readonly options: EpochOptions;
  /** Latency by Session-count bucket — the state-growth probe, kept across rotations. */
  private readonly growth = new Map<number, Bucket>();
  private state: Record<string, number> = {};
  private index = 0;
  private commands = 0;
  private total = 0;
  private slow = 0;
  private latencies: number[] = [];
  private startedAt = 0;
  private rotations = 0;
  private unsettled = 0;
  /** Wall time rotation itself cost, summed — the price of the bound, stated as a number. */
  private rotationMs = 0;
  private setupMs = 0;

  constructor(options: EpochOptions) {
    this.options = options;
  }

  /** The rig generation a finding happened in. */
  get epoch(): number {
    return this.index;
  }

  /** Commands run in the current epoch (what `budget` counts). */
  get spent(): number {
    return this.commands;
  }

  /** Commands run in every epoch — the denominator for the run's exec/s. */
  get commandsTotal(): number {
    return this.total;
  }

  get rotationsDone(): number {
    return this.rotations;
  }

  /** Whether a rotation is configured at all. */
  get rotates(): boolean {
    return this.options.budget > 0;
  }

  /**
   * The first rig is booted by the leg itself — it decides the environment order (the CLI's
   * module import has to come after `PENGUIN_HOME`), so it cannot be handed to `boot` here.
   * This runs that rig's setup and starts the epoch's clock.
   */
  async start(): Promise<void> {
    this.index = 1;
    const began = performance.now();
    await this.options.setup();
    this.setupMs += performance.now() - began;
    this.startedAt = performance.now();
  }

  /**
   * Count one finished command, and rotate once this epoch's budget is spent.
   *
   * Called between calls and never inside one: the rig is only ever replaced where the previous
   * command has already settled, so no input is ever half-run on one rig and half on the next.
   * Returns true when it rotated — the caller's id pools and state are the new rig's now.
   */
  async afterCall(ms: number, slow: boolean): Promise<boolean> {
    this.commands += 1;
    this.total += 1;
    if (slow) this.slow += 1;
    pushSample(this.latencies, ms, this.commands);

    const every = this.options.probeEvery ?? PROBE_EVERY;
    if (this.commands === 1 || this.commands % every === 0) {
      this.state = await this.readProbe();
    }
    const bucket = this.growth.get(sessionsBucket(this.state));
    if (bucket === undefined) {
      this.growth.set(sessionsBucket(this.state), { calls: 1, slow: slow ? 1 : 0, latency: [ms], seen: 1 });
    } else {
      bucket.calls += 1;
      bucket.seen += 1;
      if (slow) bucket.slow += 1;
      pushSample(bucket.latency, ms, bucket.seen);
    }

    if (!this.rotates || this.commands < this.options.budget) return false;
    await this.rotate();
    return true;
  }

  /** Rotate between calls. Public so a leg can force one (the self-check's own cadence). */
  async rotate(): Promise<void> {
    const fuzzMs = performance.now() - this.startedAt;
    const state = await this.readProbe();
    const quiet = await this.options.settle();
    if (!quiet) this.unsettled += 1;
    const began = performance.now();
    await this.options.teardown();
    await this.options.boot();
    await this.options.setup();
    this.rotationMs += performance.now() - began;

    this.samples.push({
      index: this.index,
      commands: this.commands,
      wallMs: Math.round(fuzzMs),
      p50: quantile(this.latencies, 0.5),
      p95: quantile(this.latencies, 0.95),
      max: quantile(this.latencies, 1),
      slow: this.slow,
      quiet,
      state,
    });
    this.rotations += 1;
    this.index += 1;
    this.commands = 0;
    this.slow = 0;
    this.latencies = [];
    this.startedAt = performance.now();
  }

  /** The run summary's epoch section: what each rig cost and how big it got. */
  report(): string[] {
    const lines: string[] = [];
    const budget = this.options.budget;
    // Rotation's share is of the whole run: the epochs already closed plus the one running.
    const fuzzMs =
      this.samples.reduce((sum, sample) => sum + sample.wallMs, 0) +
      Math.max(0, performance.now() - this.startedAt);
    const totalMs = fuzzMs + this.rotationMs;
    lines.push(
      `- State epochs: ${this.rotations + 1} rig(s), rotation ` +
        (this.rotates ? `every ${budget} commands` : "disabled (FUZZ_EPOCH_CALLS=0)") +
        (this.rotationMs === 0
          ? ""
          : `, ${Math.round(this.rotationMs)}ms rotating (${((this.rotationMs / Math.max(1, totalMs)) * 100).toFixed(1)}% of ${Math.round(totalMs / 1000)}s)`),
    );
    if (this.unsettled > 0) {
      lines.push(`- Rotations taken while the rig was still busy: ${this.unsettled}`);
    }
    if (this.samples.length > 0) {
      lines.push("");
      lines.push("| epoch | commands | wall ms | p50 ms | p95 ms | max ms | slow | quiet | state at end |");
      lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
      for (const sample of this.samples.slice(-40)) {
        const state = Object.entries(sample.state)
          .map(([key, value]) => `${key} ${value}`)
          .join(", ");
        lines.push(
          `| ${sample.index} | ${sample.commands} | ${sample.wallMs} | ${sample.p50} | ${sample.p95} | ${sample.max} | ${sample.slow} | ${sample.quiet ? "yes" : "no"} | ${state} |`,
        );
      }
    }
    lines.push("");
    lines.push(...this.growthReport());
    return lines;
  }

  /**
   * Latency against the rig's size, over every command of every epoch.
   *
   * This is the reading a rotation must not take away: if a command gets slower as Sessions
   * accumulate, the table shows it at every size the run actually reached — and with
   * `FUZZ_EPOCH_CALLS=0` it shows the whole curve, which is the product's own growth.
   */
  growthReport(): string[] {
    if (this.growth.size === 0) return [];
    const rows = [...this.growth.entries()].sort((a, b) => a[0] - b[0]);
    const lines = [
      "### Latency against state size",
      "",
      "Every command of every epoch, filed under the Session count it ran at. The right column",
      "is commands at or over the leg's slow threshold, not a percentile: one slow command in a",
      "bucket of twenty is not a p95.",
      "",
      "| Sessions | commands | p50 ms | p95 ms | max ms | slow |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    for (const [bucket, sample] of rows) {
      lines.push(
        `| ${bucketLabel(bucket)} | ${sample.calls} | ${quantile(sample.latency, 0.5)} | ` +
          `${quantile(sample.latency, 0.95)} | ${quantile(sample.latency, 1)} | ${sample.slow} |`,
      );
    }
    lines.push("");
    return lines;
  }

  /** The epoch that just closed, for the leg's own console line. */
  get lastRotation(): EpochSample | null {
    return this.samples[this.samples.length - 1] ?? null;
  }

  private async readProbe(): Promise<Record<string, number>> {
    try {
      const state = await this.options.probe();
      return { sessions: 0, ...state };
    } catch {
      // A probe that cannot read the rig says nothing; the previous reading stands.
      return this.state;
    }
  }
}
