/**
 * The cost center's performance panel: the per-probe table from one telemetry read, and what
 * it says instead while telemetry is off or empty. The fetching shell around it is not
 * rendered here — this package's vitest runs in `node`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TelemetryResponse } from "@prismshadow/penguin-server/api";
import {
  DEFAULT_PROBE_SORT,
  PerformanceTable,
  formatDuration,
  nextProbeSort,
  sortProbes,
} from "../src/features/usage/performance-panel";
import { S, setActiveStrings, zh } from "../src/lib/strings";
import { en } from "../src/lib/strings-en";

afterEach(() => setActiveStrings(zh));

const render = (data: TelemetryResponse) =>
  renderToStaticMarkup(createElement(PerformanceTable, { data }));

const row = (
  probe: string,
  maxMs: number | null = 12,
  p95Ms: number | null = 10.25,
  count = 3,
) => ({
  probe,
  count,
  p50Ms: 4,
  p95Ms,
  maxMs,
  bytes: null,
});

describe("PerformanceTable", () => {
  it("says telemetry is off rather than showing an empty table", () => {
    setActiveStrings(en);
    const html = render({ enabled: false, view: "probes", buffered: 0, probes: [] });
    // The sentence itself is HTML-escaped in the markup; the place it names is not.
    expect(html).toContain("Telemetry is off.");
    expect(html).toContain("Settings → General");
    expect(html).not.toContain("<table");
  });

  it("lists count, p50, p95 and max per probe, slowest p95 first", () => {
    const html = render({
      enabled: true,
      view: "probes",
      buffered: 9,
      probes: [
        row("web.turn", 12, 3),
        row("http.request", null, 10.25),
        row("boot.module", 2500, 900),
      ],
    });
    expect(html).toContain("<table");
    const order = ["boot.module", "http.request", "web.turn"].map((p) => html.indexOf(p));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain('aria-sort="descending"');
    expect(html).toContain("10.3 ms");
    expect(html).toContain("2.50 s");
    expect(html).toContain("—");
  });

  it("links a server probe's name to its section of the reference at the read's commit, and leaves an unknown one as text", () => {
    setActiveStrings(en);
    const html = render({
      enabled: true,
      view: "probes",
      buffered: 2,
      probes: [row("http.request"), row("mystery.probe")],
      sites: {
        repo: "https://github.com/Prism-Shadow/penguin-harness",
        commit: "abc1234",
        dirty: false,
        sites: {
          "http.request": "packages/server/src/http/app.ts:257",
        },
      },
    });
    expect(html).toContain(S.usage.perfColName);
    expect(html).toContain(
      'href="https://github.com/Prism-Shadow/penguin-harness/blob/abc1234/packages/server/src/telemetry/probes.en.md#httprequest"',
    );
    expect(html).not.toContain(">mystery.probe</a>");
    expect(html).toContain("mystery.probe");
  });

  it("says so when the buffer is on but holds nothing yet", () => {
    const html = render({ enabled: true, view: "probes", buffered: 0, probes: [] });
    expect(html).toContain(S.usage.perfEmpty);
  });
});

describe("formatting", () => {
  it("formats durations by magnitude", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(0.44)).toBe("0.4 ms");
    expect(formatDuration(999.9)).toBe("999.9 ms");
    expect(formatDuration(1234)).toBe("1.23 s");
  });

  it("opens on p95, slowest first, and leaves the read as it was", () => {
    const probes = [row("a", 1, 5), row("b", 1, 50), row("c", 1, null)];
    expect(DEFAULT_PROBE_SORT).toEqual({ key: "p95", dir: "desc" });
    expect(sortProbes(probes, DEFAULT_PROBE_SORT).map((p) => p.probe)).toEqual(["b", "a", "c"]);
    expect(probes[0]?.probe).toBe("a");
  });

  it("sorts every column, a missing duration last either way and ties by name", () => {
    const probes = [row("b", 7, 5, 2), row("a", 7, null, 9), row("c", null, 5, 2)];
    const by = (key: "name" | "count" | "p95" | "max", dir: "asc" | "desc") =>
      sortProbes(probes, { key, dir }).map((p) => p.probe);
    expect(by("name", "asc")).toEqual(["a", "b", "c"]);
    expect(by("name", "desc")).toEqual(["c", "b", "a"]);
    expect(by("count", "desc")).toEqual(["a", "b", "c"]);
    expect(by("p95", "asc")).toEqual(["b", "c", "a"]);
    expect(by("max", "desc")).toEqual(["a", "b", "c"]);
    expect(by("max", "asc")).toEqual(["a", "b", "c"]);
  });

  it("turns the active column around, and starts a new one at its natural end", () => {
    expect(nextProbeSort({ key: "p95", dir: "desc" }, "p95")).toEqual({ key: "p95", dir: "asc" });
    expect(nextProbeSort({ key: "p95", dir: "asc" }, "count")).toEqual({
      key: "count",
      dir: "desc",
    });
    expect(nextProbeSort({ key: "p95", dir: "desc" }, "name")).toEqual({ key: "name", dir: "asc" });
  });
});
