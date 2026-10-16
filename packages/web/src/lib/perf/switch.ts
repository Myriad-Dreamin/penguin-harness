/**
 * The page's telemetry switch (PRFC-0008, browser half) — the only part of the collector in the
 * entry bundle. `/api/me` carries the server's switch (`telemetry`); while it is off, every hook
 * below is one boolean check and nothing else happens: no import, no observer, no listener, no
 * request, no mark. Turning it on loads ./collector with a dynamic import; samples a hook
 * records before that chunk arrives are held in a short queue and handed over.
 */
import type { PerfCollector, PerfSampleInput, StreamProbe } from "./collector";

export type { PerfSampleInput, StreamProbe };

/** Samples held while the collector chunk loads; past this, the early ones are all we keep. */
const PENDING_MAX = 50;

let on = false;
let collector: PerfCollector | null = null;
let loading: Promise<PerfCollector | null> | null = null;
let pending: PerfSampleInput[] = [];

/** Whether telemetry is on for this page — what a hook checks before it measures anything. */
export function perfOn(): boolean {
  return on;
}

/** Applies the switch as `/api/me` reported it (absent — an older server — reads as off). */
export function setPerfSwitch(next: boolean): void {
  if (next === on) return;
  on = next;
  if (!next) {
    collector?.stop();
    collector = null;
    loading = null;
    pending = [];
    return;
  }
  const load: Promise<PerfCollector | null> = import("./collector").then(
    (m) => {
      if (loading !== load) return null;
      collector = m.startCollector({ onRefused: () => setPerfSwitch(false) });
      for (const sample of pending) collector.add(sample);
      pending = [];
      return collector;
    },
    () => {
      // The chunk did not load (a deploy replaced it, the network went): stay off.
      if (loading === load) setPerfSwitch(false);
      return null;
    },
  );
  loading = load;
}

/** Records one sample (dropped while off). */
export function perfSample(sample: PerfSampleInput): void {
  if (!on) return;
  if (collector !== null) collector.add(sample);
  else if (pending.length < PENDING_MAX) pending.push(sample);
}

/**
 * A session's stream probe, once the collector is there; null while off. `openedAt` is taken
 * by the caller before it asks, so a probe that arrives a moment later still times the open
 * from its start.
 */
export function perfStream(sessionId: string, openedAt: number): Promise<StreamProbe | null> {
  if (!on) return Promise.resolve(null);
  if (collector !== null) return Promise.resolve(collector.stream(sessionId, openedAt));
  return (loading ?? Promise.resolve(null)).then((c) => c?.stream(sessionId, openedAt) ?? null);
}
