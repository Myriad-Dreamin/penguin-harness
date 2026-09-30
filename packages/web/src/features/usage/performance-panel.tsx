/**
 * The cost center's performance panel: the telemetry buffer (PRFC-0008) as a table — per
 * probe, how many samples and their p50 / p95 / max — narrowed to one Session on request.
 * Server probes (`http.request`, `boot.*`, `session.messages`, `trace.read`, …) and the
 * browser's (`web.*`, sent by lib/perf) sit in the same buffer, so they list side by side.
 *
 * Unlike the rest of the page it is whole-server, not per Project: the buffer is one per
 * process, and its read route is admin only — so the page renders this panel for an admin
 * alone rather than offering a table that can only answer 403. While telemetry is off the
 * buffer does not exist, and the panel says so and how to turn it on.
 */
import { useEffect, useState } from "react";
import type {
  TelemetryProbeSummary,
  TelemetryResponse,
  TelemetrySessionSummary,
} from "@prismshadow/penguin-server/api";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { apiErrorText } from "../../lib/api-error";
import { Button, Select } from "@prismshadow/penguin-ui";
import { Empty } from "./usage-charts";
import { toneInk } from "../../lib/tone";

/** A duration as the table shows it: ms to one decimal under a second, seconds past it; a dash when no sample carried one. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms * 10) / 10} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Browser probes after the server's, each side alphabetical: the two halves read as two blocks. */
export function orderProbes(probes: readonly TelemetryProbeSummary[]): TelemetryProbeSummary[] {
  const side = (p: TelemetryProbeSummary) => (p.probe.startsWith("web.") ? 1 : 0);
  return [...probes].sort((a, b) => side(a) - side(b) || a.probe.localeCompare(b.probe));
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`py-1.5 pr-2 font-medium ${className}`}>{children}</th>;
}

/** The table itself, from one read: pure so it renders in a test without a fetch. */
export function PerformanceTable({ data }: { data: TelemetryResponse }) {
  if (!data.enabled) return <Empty text={S.usage.perfOff} />;
  const probes = orderProbes(data.probes ?? []);
  if (probes.length === 0) return <Empty text={S.usage.perfEmpty} />;
  return (
    <div className="overflow-x-auto overflow-y-clip border-t border-gray-200 dark:border-gray-800">
      <table className="w-full min-w-[560px] table-fixed text-xs">
        <thead className="text-left text-gray-400 dark:text-gray-500">
          <tr>
            <Th>{S.usage.perfColProbe}</Th>
            <Th className="w-20 text-right">{S.usage.perfColCount}</Th>
            <Th className="w-24 text-right">p50</Th>
            <Th className="w-24 text-right">p95</Th>
            <Th className="w-24 text-right">{S.usage.perfColMax}</Th>
          </tr>
        </thead>
        <tbody>
          {probes.map((p) => (
            <tr key={p.probe} className="border-t border-gray-100 dark:border-gray-800/60">
              <td className="truncate py-1.5 pr-2 font-mono text-gray-600 dark:text-gray-300">
                {p.probe}
              </td>
              <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{p.count}</td>
              <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                {formatDuration(p.p50Ms)}
              </td>
              <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                {formatDuration(p.p95Ms)}
              </td>
              <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                {formatDuration(p.maxMs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The panel: a Session filter and a refresh above the table. Mounted for an admin only (see the file header). */
export function PerformancePanel() {
  const [session, setSession] = useState("");
  const [tick, setTick] = useState(0);
  const [data, setData] = useState<TelemetryResponse | null>(null);
  const [sessions, setSessions] = useState<TelemetrySessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void Promise.all([
      api.getTelemetry({ view: "probes", ...(session ? { session } : {}) }),
      api.getTelemetry({ view: "sessions" }),
    ])
      .then(([probes, bySession]) => {
        if (cancelled) return;
        setData(probes);
        setSessions([...(bySession.sessions ?? [])].sort((a, b) => b.lastTs - a.lastTs));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(apiErrorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [session, tick]);

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <div className="w-64 max-w-full">
          <Select
            size="sm"
            value={session}
            aria-label={S.usage.perfSessionFilter}
            onChange={(e) => setSession(e.target.value)}
          >
            <option value="">{S.usage.perfAllSessions}</option>
            {/* A filter still selected after its Session aged out of the buffer stays listed. */}
            {session && !sessions.some((s) => s.session === session) && (
              <option value={session}>{session}</option>
            )}
            {sessions.map((s) => (
              <option key={s.session} value={s.session}>
                {s.session}
              </option>
            ))}
          </Select>
        </div>
        <Button size="sm" onClick={() => setTick((t) => t + 1)}>
          {S.usage.perfRefresh}
        </Button>
        {data?.enabled && (
          <span className="text-xs text-gray-400">{S.usage.perfBuffered(data.buffered)}</span>
        )}
      </div>
      {error ? (
        <p className={`text-xs ${toneInk.danger}`}>{error}</p>
      ) : data ? (
        <PerformanceTable data={data} />
      ) : null}
    </div>
  );
}
