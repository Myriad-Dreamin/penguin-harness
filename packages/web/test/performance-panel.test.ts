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
  PerformanceTable,
  formatDuration,
  orderProbes,
} from "../src/features/usage/performance-panel";
import { S, setActiveStrings, zh } from "../src/lib/strings";
import { en } from "../src/lib/strings-en";

afterEach(() => setActiveStrings(zh));

const render = (data: TelemetryResponse) =>
  renderToStaticMarkup(createElement(PerformanceTable, { data }));

const row = (probe: string, maxMs: number | null = 12) => ({
  probe,
  count: 3,
  p50Ms: 4,
  p95Ms: 10.25,
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

  it("lists count, p50, p95 and max per probe, server probes before the browser's", () => {
    const html = render({
      enabled: true,
      view: "probes",
      buffered: 9,
      probes: [row("web.turn"), row("http.request", null), row("boot.module", 2500)],
    });
    expect(html).toContain("<table");
    const order = ["boot.module", "http.request", "web.turn"].map((p) => html.indexOf(p));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain("10.3 ms");
    expect(html).toContain("2.50 s");
    expect(html).toContain("—");
  });

  it("links a server probe's name to its section of the reference at the read's commit, and leaves an unknown one as text", () => {
    const html = render({
      enabled: true,
      view: "probes",
      buffered: 2,
      probes: [row("http.request"), row("turn.wait"), row("mystery.probe")],
      sites: {
        repo: "https://github.com/Prism-Shadow/penguin-harness",
        commit: "abc1234",
        dirty: false,
        sites: {
          "http.request": "packages/server/src/http/app.ts:257",
          "turn.*": "packages/server/src/telemetry/turn.ts:102",
        },
      },
    });
    expect(html).toContain(S.usage.perfColName);
    expect(html).toContain(
      'href="https://github.com/Prism-Shadow/penguin-harness/blob/abc1234/packages/server/src/telemetry/probes.en.md#httprequest"',
    );
    // A per-segment name opens its family's section.
    expect(html).toContain("/blob/abc1234/packages/server/src/telemetry/probes.en.md#turn");
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

  it("orders without mutating the read", () => {
    const probes = [row("web.boot"), row("trace.read")];
    expect(orderProbes(probes).map((p) => p.probe)).toEqual(["trace.read", "web.boot"]);
    expect(probes[0]?.probe).toBe("web.boot");
  });
});
