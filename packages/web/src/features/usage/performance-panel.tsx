/**
 * The cost center's performance panel: the telemetry buffer (PRFC-0008) as a table — per
 * probe, how many samples and their p50 / p95 / max — narrowed to one Session on request.
 * Server probes (`http.request`, `boot.*`, `session.messages`, `trace.read`, …) and the
 * browser's (`web.*`, sent by lib/perf) sit in the same buffer, so they list side by side.
 * Every column sorts; the table opens on p95, slowest first — the tail is what a slow
 * complaint is about, and a probe that is slow once in twenty does not show in its median.
 *
 * Unlike the rest of the page it is whole-server, not per Project: the buffer is one per
 * process, and its read route is admin only — so the page renders this panel for an admin
 * alone rather than offering a table that can only answer 403. While telemetry is off the
 * buffer does not exist, and the panel says so and where to turn it on (Settings → General);
 * while it is on, Clear empties the buffer.
 */
import { useEffect, useState } from "react";
import type {
  ProbeSites,
  TelemetryProbeSummary,
  TelemetryResponse,
  TelemetrySessionSummary,
} from "@prismshadow/penguin-server/api";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { apiErrorText } from "../../lib/api-error";
import { Button, ChevronDown, ICON_SIZE, InfoPopover, Select } from "@prismshadow/penguin-ui";
import { Empty } from "./usage-charts";
import { toneInk } from "../../lib/tone";
import { pageProbeSites, pageProbeSummaries, probeLink, probeSummary } from "../../lib/perf/sites";

/** A duration as the table shows it: ms to one decimal under a second, seconds past it; a dash when no sample carried one. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms * 10) / 10} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** A column the table sorts by, and which way. */
export type ProbeSortKey = "name" | "count" | "p50" | "p95" | "max";
export interface ProbeSort {
  key: ProbeSortKey;
  dir: "asc" | "desc";
}

/** What the table opens on: p95, slowest first. */
export const DEFAULT_PROBE_SORT: ProbeSort = { key: "p95", dir: "desc" };

const sortValue: Record<
  Exclude<ProbeSortKey, "name">,
  (p: TelemetryProbeSummary) => number | null
> = {
  count: (p) => p.count,
  p50: (p) => p.p50Ms,
  p95: (p) => p.p95Ms,
  max: (p) => p.maxMs,
};

/**
 * The probes in `sort`'s order, ties by name. A probe with no duration (its samples carry
 * none) sorts last either way: a dash is no figure, not a small one.
 */
export function sortProbes(
  probes: readonly TelemetryProbeSummary[],
  sort: ProbeSort,
): TelemetryProbeSummary[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const byName = (a: TelemetryProbeSummary, b: TelemetryProbeSummary) =>
    a.probe.localeCompare(b.probe);
  if (sort.key === "name") return [...probes].sort((a, b) => sign * byName(a, b));
  const value = sortValue[sort.key];
  return [...probes].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null || y === null) return x === y ? byName(a, b) : x === null ? 1 : -1;
    return sign * (x - y) || byName(a, b);
  });
}

/** The sort a header click asks for: the same column turns around, a new one starts at its natural end. */
export function nextProbeSort(current: ProbeSort, key: ProbeSortKey): ProbeSort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "name" ? "asc" : "desc" };
}

/** A sortable header: the label is the button, `aria-sort` says the current order. */
function SortTh({
  label,
  column,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  column: ProbeSortKey;
  sort: ProbeSort;
  onSort: (sort: ProbeSort) => void;
  className?: string;
}) {
  const active = sort.key === column;
  const numeric = column !== "name";
  return (
    <th
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`py-1.5 pr-2 font-medium ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(nextProbeSort(sort, column))}
        className={`inline-flex items-center gap-1 hover:text-gray-600 dark:hover:text-gray-300 ${
          numeric ? "flex-row-reverse" : ""
        } ${active ? "text-gray-600 dark:text-gray-300" : ""}`}
      >
        {label}
        <ChevronDown
          size={ICON_SIZE.chevronDense}
          className={`${active ? "" : "invisible"} ${sort.dir === "asc" && active ? "rotate-180" : ""}`}
        />
      </button>
    </th>
  );
}

/**
 * A probe's name, linked to its section of the probe reference when its table locates it, and
 * its one-sentence summary behind a "?" beside it. The reference's language follows the UI's.
 */
function ProbeName({
  probe,
  table,
  summaries,
}: {
  probe: string;
  table: ProbeSites | null;
  summaries: ReturnType<typeof pageProbeSummaries>;
}) {
  const lang = S.usage.perfDocLang;
  const link = probeLink(probe, table, lang);
  const summary = probeSummary(probe, summaries, lang);
  const name =
    link === null ? (
      <span className="truncate">{probe}</span>
    ) : (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        data-tooltip={
          link.dirty ? S.usage.perfSiteDirtyTitle(link.site) : S.usage.perfSiteTitle(link.site)
        }
        className="truncate underline-offset-2 hover:underline"
      >
        {probe}
      </a>
    );
  return (
    <div className="flex min-w-0 items-center gap-1">
      {name}
      {summary !== null && <InfoPopover label={probe}>{summary}</InfoPopover>}
    </div>
  );
}

/** The table itself, from one read: pure so it renders in a test without a fetch. */
export function PerformanceTable({
  data,
  sort = DEFAULT_PROBE_SORT,
  onSort = () => {},
}: {
  data: TelemetryResponse;
  sort?: ProbeSort;
  onSort?: (sort: ProbeSort) => void;
}) {
  if (!data.enabled) return <Empty text={S.usage.perfOff} />;
  const probes = sortProbes(data.probes ?? [], sort);
  if (probes.length === 0) return <Empty text={S.usage.perfEmpty} />;
  // A `web.*` probe is recorded by this page, so it is found in the page's own table, at the
  // page's commit; every other probe in the server's, which comes with the read.
  const pageSites = pageProbeSites();
  const serverSites = data.sites ?? null;
  const summaries = pageProbeSummaries();
  return (
    <div className="overflow-x-auto overflow-y-clip border-t border-gray-200 dark:border-gray-800">
      <table className="w-full min-w-[560px] table-fixed text-xs">
        <thead className="text-left text-gray-400 dark:text-gray-500">
          <tr>
            <SortTh label={S.usage.perfColName} column="name" sort={sort} onSort={onSort} />
            {(
              [
                ["count", S.usage.perfColCount, "w-20"],
                ["p50", "p50", "w-24"],
                ["p95", "p95", "w-24"],
                ["max", S.usage.perfColMax, "w-24"],
              ] as const
            ).map(([column, label, width]) => (
              <SortTh
                key={column}
                label={label}
                column={column}
                sort={sort}
                onSort={onSort}
                className={`${width} text-right`}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {probes.map((p) => (
            <tr key={p.probe} className="border-t border-gray-100 dark:border-gray-800/60">
              <td className="py-1.5 pr-2 font-mono text-gray-600 dark:text-gray-300">
                <ProbeName
                  probe={p.probe}
                  table={p.probe.startsWith("web.") ? pageSites : serverSites}
                  summaries={summaries}
                />
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
  const [sort, setSort] = useState<ProbeSort>(DEFAULT_PROBE_SORT);
  const [tick, setTick] = useState(0);
  const [data, setData] = useState<TelemetryResponse | null>(null);
  const [sessions, setSessions] = useState<TelemetrySessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const clear = async () => {
    setClearing(true);
    try {
      await api.clearTelemetry();
      setTick((t) => t + 1);
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setClearing(false);
    }
  };

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
        {/* Clearing empties the buffer and leaves the switch on; there is nothing to clear while it is off. */}
        {data?.enabled && (
          <Button size="sm" disabled={clearing} onClick={() => void clear()}>
            {S.usage.perfClear}
          </Button>
        )}
        {data?.enabled && (
          <span className="text-xs text-gray-400">{S.usage.perfBuffered(data.buffered)}</span>
        )}
      </div>
      {error ? (
        <p className={`text-xs ${toneInk.danger}`}>{error}</p>
      ) : data ? (
        <PerformanceTable data={data} sort={sort} onSort={setSort} />
      ) : null}
    </div>
  );
}
