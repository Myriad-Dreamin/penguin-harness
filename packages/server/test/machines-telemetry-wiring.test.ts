/**
 * The machine connection probes on the Telemetry switch (PRFC-0008): the process-wide slot
 * (machines/transport/timings.ts) holds a sink exactly while the switch is on; what the probes
 * hand it lands in the App's buffer keyed by machine; and a generation that is going does not
 * empty a slot its successor already took.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ServerSettingsResponse, TelemetryResponse } from "../src/api/types.js";
import { bindMachineTimings } from "../src/machines/telemetry-binding.js";
import { emit, setTimingsSink, timingsSink } from "../src/machines/transport/timings.js";
import type { Telemetry } from "../src/mechanisms/telemetry.js";
import { apiClient, createTestApp, loginAdmin } from "./helpers.js";
import type { TestApp } from "./helpers.js";

const LAB = "ssh:lab";
const EDGE = "ssh:edge";

describe("machine probes on a test App", () => {
  let t: TestApp;
  let admin: ReturnType<typeof apiClient>;

  beforeEach(async () => {
    setTimingsSink(null);
    t = await createTestApp();
    admin = apiClient(t.app, (await loginAdmin(t.app)).cookie);
  });
  afterEach(async () => {
    await t.cleanup();
    setTimingsSink(null);
  });

  const turn = async (on: boolean) => {
    const res = await admin.put("/api/admin/settings", { telemetry: on });
    expect(res.status).toBe(200);
    expect(((await res.json()) as ServerSettingsResponse).settings.telemetry).toBe(on);
  };
  const read = async (query: string) => {
    const res = await admin.get(`/api/telemetry${query}`);
    expect(res.status).toBe(200);
    return (await res.json()) as TelemetryResponse;
  };
  const stage = (machine: string, name: string, durMs: number, status = "ok") =>
    emit({
      ts: Date.now(),
      probe: "machine.connect.stage",
      durMs,
      status,
      keys: { machine },
      attrs: { stage: name },
    });

  it("the slot holds a sink exactly while the switch is on, and the App's dispose empties it", async () => {
    expect(timingsSink()).toBeNull();
    stage(LAB, "probe", 10);
    await turn(true);
    expect(timingsSink()).not.toBeNull();
    // Nothing recorded while off reaches the buffer once it is on.
    expect((await read("?view=samples")).samples?.some((s) => s.keys.machine !== undefined)).toBe(
      false,
    );
    await turn(false);
    expect(timingsSink()).toBeNull();
    await turn(true);
    await t.cleanup();
    expect(timingsSink()).toBeNull();
    t = await createTestApp(); // afterEach cleans up whatever App `t` names
  });

  it("samples land in the buffer keyed by machine and generation", async () => {
    await turn(true);
    stage(LAB, "probe", 12);
    stage(EDGE, "hold", 40);
    const samples = (await read("?view=samples&probe=machine.connect.stage")).samples ?? [];
    expect(samples).toMatchObject([
      { durMs: 12, status: "ok", keys: { machine: LAB, generation: 1 }, attrs: { stage: "probe" } },
      { durMs: 40, keys: { machine: EDGE }, attrs: { stage: "hold" } },
    ]);
  });
});

/** A switch with a buffer of its own: the part of Telemetry the binding uses. */
function fakeTelemetry(initially: boolean) {
  let on = initially;
  const listeners = new Set<(on: boolean) => void>();
  const recorded: unknown[] = [];
  const telemetry = {
    watch(listener: (on: boolean) => void) {
      listeners.add(listener);
      listener(on);
      return () => void listeners.delete(listener);
    },
    record(sample: unknown) {
      recorded.push(sample);
      return null;
    },
  } as unknown as Telemetry;
  const set = (next: boolean) => {
    on = next;
    for (const l of listeners) l(on);
  };
  return { telemetry, recorded, set, listeners };
}

describe("bindMachineTimings across a hand-over", () => {
  beforeEach(() => setTimingsSink(null));
  afterEach(() => setTimingsSink(null));

  it("the successor's sink survives the outgoing generation's dispose, and one switched off leaves another's slot", () => {
    const old = fakeTelemetry(true);
    const disposeOld = bindMachineTimings(old.telemetry);
    const next = fakeTelemetry(true);
    const disposeNext = bindMachineTimings(next.telemetry);
    disposeOld();
    expect(old.listeners.size).toBe(0);
    emit({ ts: 1, probe: "machine.ssh.command", durMs: 5, keys: { machine: LAB } });
    // The buffer stamps its own time: the sink hands over the rest.
    expect(old.recorded).toHaveLength(0);
    expect(next.recorded).toEqual([
      { probe: "machine.ssh.command", durMs: 5, keys: { machine: LAB } },
    ]);
    const held = timingsSink();
    const third = fakeTelemetry(false);
    bindMachineTimings(third.telemetry);
    expect(timingsSink()).toBe(held);
    disposeNext();
    expect(timingsSink()).toBeNull();
  });
});
