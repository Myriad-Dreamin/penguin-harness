/**
 * The telemetry mechanism (PRFC-0008): what a node may require, declared apart from what
 * implements it (telemetry/service.ts).
 */
import { Interface } from "@prismshadow/penguin-core/kernel";
import type {
  TelemetryGenerations,
  TelemetryKeys,
  TelemetryQuery,
  TelemetrySample,
  TelemetrySampleInput,
} from "../api/types.js";

/**
 * Telemetry: the switch, the in-memory sample buffer and the scope that carries a request's
 * keys to the samples it causes. Off by default; while off, `on()` is the one check a probe
 * pays and nothing is allocated.
 */
@Interface()
export abstract class Telemetry {
  /** Whether the fixed probes record — one boolean held in memory, never a settings read. */
  abstract on(): boolean;
  /** Stores the switch in the server settings and applies it at once (off drops the buffer). */
  abstract setEnabled(enabled: boolean): void;
  /**
   * Calls `listener` with the switch now and again whenever setEnabled changes it; returns the
   * unsubscribe. For probes that cannot ask `on()` themselves — the machine transport's, whose
   * sessions outlive this App generation and read a process-wide slot (machines/transport/timings.ts).
   */
  abstract watch(listener: (on: boolean) => void): () => void;
  /**
   * Records one sample (a no-op while off) and returns the stored copy, or null. The keys of
   * the enclosing scope (see within) are merged under the sample's own. The caller may still
   * add to the returned sample's `bytes` — a streamed response is counted as it is written.
   */
  abstract record(sample: TelemetrySampleInput): TelemetrySample | null;
  /** The keys of the enclosing scope (the request's id among them), or undefined outside one or while off. */
  abstract keys(): TelemetryKeys | undefined;
  /** Runs `run` with `keys` added to the scope every sample recorded inside it inherits; while off, just runs it. */
  abstract within(keys: TelemetryKeys, run: () => Promise<unknown>): Promise<unknown>;
  /** The buffered samples matching the query, oldest first. */
  abstract samples(query: TelemetryQuery): TelemetrySample[];
  /** Empties the buffer. */
  abstract clear(): void;
  /**
   * Registers a self-report under `name` (the Sessions' is "sessions"): read only when the
   * machine view is asked for, never on a schedule. A later registration replaces it.
   */
  abstract addReport(name: string, read: () => unknown): void;
  /** Reads the report registered under `name`; undefined when none is. */
  abstract report(name: string): unknown;
  /** This App's generation number and how many times each platform bundle has been created in this process. */
  abstract generations(): TelemetryGenerations;
}
