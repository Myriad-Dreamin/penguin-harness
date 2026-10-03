/**
 * The page's telemetry (lib/perf): the switch that keeps it all dormant while off, the stream
 * probe's segments, the boot sample read off the browser's own timings, and the sender that
 * picks the intake by kind and stops when the server says telemetry went off.
 *
 * This package's vitest runs in `node`, so the few browser globals the collector touches are
 * stubbed per test.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REPORT_URLS,
  StreamProbe,
  bootSample,
  sendReport,
  startCollector,
} from "../src/lib/perf/collector";
import type { PerfSampleInput } from "../src/lib/perf/collector";
import { perfOn, perfSample, perfStream, setPerfSwitch } from "../src/lib/perf/switch";

afterEach(() => {
  setPerfSwitch(false);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the switch", () => {
  it("is off by default: a hook records nothing and gets no stream probe", async () => {
    expect(perfOn()).toBe(false);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    perfSample({ probe: "web.turn", durMs: 1 });
    expect(await perfStream("s-1", 0)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("StreamProbe", () => {
  const clock = (times: number[]) => {
    let i = 0;
    vi.stubGlobal("performance", { now: () => times[Math.min(i++, times.length - 1)] });
  };

  it("times the open from its start to the first version rendered after the history", () => {
    const out: PerfSampleInput[] = [];
    const probe = new StreamProbe("s-1", 0, (s) => out.push(s));
    probe.fetched(30);
    probe.frame(40, 45);
    clock([160, 175]); // commit at 160, rendered at 175
    probe.commit();
    probe.loaded();
    probe.rendered();
    expect(out).toEqual([
      {
        probe: "web.session.open",
        durMs: 175,
        n: 1,
        session: "s-1",
        attrs: {
          fetchMs: 30,
          commits: 1,
          reduceMs: 5,
          waitMs: 120,
          maxWaitMs: 120,
          renderMs: 15,
          maxRenderMs: 15,
        },
      },
    ]);
  });

  it("reports a turn from its first frame to its last render once it leaves running, and none while the open is pending", () => {
    const out: PerfSampleInput[] = [];
    const pending = new StreamProbe("s-0", 0, (s) => out.push(s));
    pending.taskState("running");
    pending.taskState("idle");
    expect(out).toEqual([]);
    const probe = new StreamProbe("s-1", 0, (s) => out.push(s));
    probe.skipOpen();
    probe.taskState("running");
    probe.frame(1000, 1002);
    probe.frame(1010, 1011);
    clock([1130, 1140, 1300, 1320]);
    probe.commit();
    probe.rendered();
    probe.frame(1200, 1204);
    probe.commit();
    probe.rendered();
    probe.taskState("idle");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      probe: "web.turn",
      durMs: 320,
      n: 3,
      attrs: { commits: 2, reduceMs: 7, waitMs: 230, maxWaitMs: 130, renderMs: 30 },
    });
  });
});

describe("bootSample", () => {
  const paint = (name: string, startTime: number) => ({ name, startTime }) as PerformanceEntry;

  it("waits for the first contentful paint, then reads navigation, the entry script and the paints", () => {
    expect(
      bootSample(
        { navigation: undefined, paints: [], entryScript: undefined },
        { count: 0, blockingMs: 0 },
      ),
    ).toBeNull();
    const sample = bootSample(
      {
        navigation: {
          responseStart: 20,
          domInteractive: 300,
          domContentLoadedEventEnd: 310,
          loadEventEnd: 0,
        } as PerformanceNavigationTiming,
        paints: [paint("first-paint", 400), paint("first-contentful-paint", 850)],
        entryScript: { responseEnd: 250, transferSize: 0 } as PerformanceResourceTiming,
      },
      { count: 2, blockingMs: 90 },
    );
    expect(sample).toEqual({
      probe: "web.boot",
      durMs: 850,
      attrs: {
        fcpMs: 850,
        fpMs: 400,
        longTasks: 2,
        blockingMs: 90,
        ttfbMs: 20,
        domInteractiveMs: 300,
        dclMs: 310,
        entryMs: 250,
        entryToPaintMs: 600,
        entryCached: true,
      },
    });
  });
});

describe("sending", () => {
  it("posts JSON to the intake its kind names, and stops itself, timer and listener, on a 409", async () => {
    vi.useFakeTimers();
    const listeners = new Set<unknown>();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("document", {
      visibilityState: "visible",
      querySelector: () => null,
      addEventListener: (_: string, fn: unknown) => listeners.add(fn),
      removeEventListener: (_: string, fn: unknown) => listeners.delete(fn),
    });
    vi.stubGlobal("performance", { now: () => 0, getEntriesByType: () => [] });
    const fetch = vi.fn(async () => ({ status: 409 }));
    vi.stubGlobal("fetch", fetch);
    expect(await sendReport("sample", { samples: [] })).toBe(409);
    expect(fetch).toHaveBeenCalledWith(
      REPORT_URLS.sample,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ samples: [] }) }),
    );
    fetch.mockClear();
    const onRefused = vi.fn();
    const collector = startCollector({ onRefused });
    expect(listeners.size).toBe(1);
    collector.add({ probe: "web.turn", durMs: 1 });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onRefused).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
    collector.add({ probe: "web.turn", durMs: 1 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
