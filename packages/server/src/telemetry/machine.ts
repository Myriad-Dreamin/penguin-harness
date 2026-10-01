/**
 * The telemetry machine view (`GET /api/telemetry?view=machine`): this process as it stands
 * at the moment of the read — its memory, the App generations it has created, and what each
 * loaded Session reports it holds, all computed per read (which is why they cost nothing
 * between reads) — and the machines this server connects to, summarized from the connection
 * probes' buffered samples.
 */
import type {
  TelemetryGenerations,
  TelemetryMachineSummary,
  TelemetryMachineView,
  TelemetrySample,
  TelemetrySessionReport,
} from "../api/types.js";

/** A report as the Sessions module registers it: an array of TelemetrySessionReport, or anything else (ignored). */
function asSessionReports(report: unknown): TelemetrySessionReport[] | null {
  return Array.isArray(report) ? (report as TelemetrySessionReport[]) : null;
}

export function machineView(
  generations: TelemetryGenerations,
  sessionsReport: unknown,
  samples: readonly TelemetrySample[],
  memory: NodeJS.MemoryUsage = process.memoryUsage(),
): TelemetryMachineView {
  const sessions = asSessionReports(sessionsReport);
  return {
    process: {
      pid: process.pid,
      uptimeMs: Math.round(process.uptime() * 1000),
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers,
    },
    generation: generations,
    sessions,
    machines: summarizeMachines(samples),
    totals:
      sessions === null
        ? null
        : sessions.reduce(
            (t, s) => ({
              sessions: t.sessions + 1,
              resumedHistory: t.resumedHistory + (s.resumedHistory ?? 0),
              channelBytes: t.channelBytes + (s.channelBytes ?? 0),
              liveBytes: t.liveBytes + (s.liveBytes ?? 0),
              subscribers: t.subscribers + (s.subscribers ?? 0),
            }),
            { sessions: 0, resumedHistory: 0, channelBytes: 0, liveBytes: 0, subscribers: 0 },
          ),
  };
}

/**
 * The samples that name a machine, grouped by it and then by probe — and by stage for
 * `machine.connect.stage` — newest machine first. A machine nobody connected to while the
 * switch was on has no row: there is nothing measured to show for it.
 */
export function summarizeMachines(samples: readonly TelemetrySample[]): TelemetryMachineSummary[] {
  const byMachine = new Map<
    string,
    { lastTs: number; count: number; rows: Map<string, TelemetryMachineSummary["probes"][number]> }
  >();
  for (const s of samples) {
    const machine = s.keys.machine;
    if (machine === undefined) continue;
    let entry = byMachine.get(machine);
    if (entry === undefined) {
      entry = { lastTs: s.ts, count: 0, rows: new Map() };
      byMachine.set(machine, entry);
    }
    entry.count += 1;
    entry.lastTs = Math.max(entry.lastTs, s.ts);
    const stage = typeof s.attrs?.stage === "string" ? s.attrs.stage : undefined;
    const rowKey = stage === undefined ? s.probe : `${s.probe}\u0000${stage}`;
    let row = entry.rows.get(rowKey);
    if (row === undefined) {
      row = {
        probe: s.probe,
        ...(stage !== undefined ? { stage } : {}),
        count: 0,
        errors: 0,
        n: null,
        totalMs: 0,
        maxMs: null,
      };
      entry.rows.set(rowKey, row);
    }
    row.count += 1;
    if (s.status !== undefined && s.status !== "ok") row.errors += 1;
    if (s.n !== undefined) row.n = (row.n ?? 0) + s.n;
    if (s.durMs !== undefined) {
      row.totalMs = Math.round((row.totalMs + s.durMs) * 10) / 10;
      row.maxMs = row.maxMs === null ? s.durMs : Math.max(row.maxMs, s.durMs);
    }
  }
  return [...byMachine]
    .map(([machine, e]) => ({
      machine,
      count: e.count,
      lastTs: e.lastTs,
      probes: [...e.rows.values()],
    }))
    .sort((a, b) => b.lastTs - a.lastTs);
}
