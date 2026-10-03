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

  it("times the open from its start to the first render after the history, with the request's own time", () => {
    const out: PerfSampleInput[] = [];
    const probe = new StreamProbe("s-1", 0, (s) => out.push(s));
    probe.fetched(30);
    clock([175]);
    probe.loaded();
    probe.rendered();
    expect(out).toEqual([
      { probe: "web.session.open", durMs: 175, session: "s-1", attrs: { fetchMs: 30 } },
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
    clock([1000, 1140, 1320]); // the first frame, then two renders
    probe.frame();
    probe.frame();
    probe.rendered();
    probe.rendered();
    probe.taskState("idle");
    expect(out).toEqual([{ probe: "web.turn", durMs: 320, session: "s-1" }]);
  });
});

describe("bootSample", () => {
  const paint = (name: string, startTime: number) => ({ name, startTime }) as PerformanceEntry;

  it("waits for the first contentful paint, then says when it came and when the first byte did", () => {
    expect(bootSample({ navigation: undefined, paints: [] })).toBeNull();
    const navigation = { responseStart: 20 } as PerformanceNavigationTiming;
    const paints = [paint("first-paint", 400), paint("first-contentful-paint", 850)];
    expect(bootSample({ navigation, paints })).toEqual({
      probe: "web.boot",
      durMs: 850,
      attrs: { ttfbMs: 20 },
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
