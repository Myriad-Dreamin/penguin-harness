/**
 * The machine connection probes on the Telemetry switch (PRFC-0008): the process-wide slot
 * (machines/transport/timings.ts) holds a sink exactly while the switch is on; what the probes
 * hand it lands in the App's buffer keyed by machine; the machine view lists each machine per
 * probe and connect stage; and a generation that is going does not empty a slot its successor
 * already took.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ServerSettingsResponse, TelemetryResponse } from "../src/api/types.js";
import { bindMachineTimings } from "../src/machines/telemetry-binding.js";
import {
  emit,
  flushHandshakes,
  setTimingsSink,
  timingsSink,
  tallyHandshake,
} from "../src/machines/transport/timings.js";
import type { Telemetry } from "../src/mechanisms/telemetry.js";
import { summarizeMachines } from "../src/telemetry/machine.js";
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
      attrs: { stage: name, trigger: "connect" },
    });

  it("the slot follows the switch: empty while off, a sink while on, empty again once off", async () => {
    expect(timingsSink()).toBeNull();
    stage(LAB, "probe", 10);
    await turn(true);
    expect(timingsSink()).not.toBeNull();
    await turn(false);
    expect(timingsSink()).toBeNull();
    // Nothing recorded while off reaches the buffer once it is on again.
    await turn(true);
    expect((await read("?view=samples")).samples?.some((s) => s.keys.machine !== undefined)).toBe(
      false,
    );
  });

  it("samples land in the buffer keyed by machine, and the machine view lists each machine", async () => {
    await turn(true);
    stage(LAB, "probe", 12);
    stage(LAB, "start-server", 2400);
    stage(LAB, "start-server", 1800, "error");
    stage(EDGE, "hold", 40);
    tallyHandshake(LAB, 3, true);
    tallyHandshake(LAB, 9, false);
    flushHandshakes();

    const samples = (await read("?view=samples&probe=machine.connect.stage")).samples ?? [];
    expect(samples).toHaveLength(4);
    expect(samples[0]).toMatchObject({
      probe: "machine.connect.stage",
      durMs: 12,
      status: "ok",
      keys: { machine: LAB, generation: 1 },
      attrs: { stage: "probe" },
    });

    const { machine } = await read("?view=machine");
    const rows = machine!.machines;
    expect(rows.map((r) => r.machine).sort()).toEqual([EDGE, LAB]);
    const lab = rows.find((r) => r.machine === LAB)!;
    expect(lab.count).toBe(4);
    expect(lab.probes.find((p) => p.stage === "start-server")).toEqual({
      probe: "machine.connect.stage",
      stage: "start-server",
      count: 2,
      errors: 1,
      n: null,
      totalMs: 4200,
      maxMs: 2400,
    });
    expect(lab.probes.find((p) => p.probe === "machine.socks.handshake")).toMatchObject({
      count: 1,
      errors: 1,
      n: 2,
      maxMs: 9,
    });
  });

  it("the App's dispose empties the slot it filled", async () => {
    await turn(true);
    expect(timingsSink()).not.toBeNull();
    await t.cleanup();
    expect(timingsSink()).toBeNull();
    // afterEach cleans up whatever App `t` names.
    t = await createTestApp();
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

  it("the successor's sink survives the outgoing generation's dispose", () => {
    const old = fakeTelemetry(true);
    const disposeOld = bindMachineTimings(old.telemetry);
    const next = fakeTelemetry(true);
    const disposeNext = bindMachineTimings(next.telemetry);
    disposeOld();
    expect(old.listeners.size).toBe(0);
    emit({ ts: 1, probe: "machine.ssh.open", durMs: 5, keys: { machine: LAB } });
    expect(old.recorded).toHaveLength(0);
    // The buffer stamps its own time: the sink hands over the rest.
    expect(next.recorded).toEqual([
      { probe: "machine.ssh.open", durMs: 5, keys: { machine: LAB } },
    ]);
    disposeNext();
    expect(timingsSink()).toBeNull();
  });

  it("a generation switched off does not empty a slot another generation holds", () => {
    const old = fakeTelemetry(true);
    bindMachineTimings(old.telemetry);
    const held = timingsSink();
    const next = fakeTelemetry(false);
    bindMachineTimings(next.telemetry);
    expect(timingsSink()).toBe(held);
    next.set(true);
    next.set(false);
    expect(timingsSink()).toBeNull();
  });
});

describe("summarizeMachines", () => {
  it("skips samples without a machine and orders machines newest first", () => {
    const rows = summarizeMachines([
      { ts: 1, probe: "http.request", durMs: 3, keys: {} },
      { ts: 2, probe: "machine.ssh.open", durMs: 30, status: "ok", keys: { machine: LAB } },
      { ts: 5, probe: "machine.ssh.command", durMs: 4, status: "exit", keys: { machine: EDGE } },
    ]);
    expect(rows.map((r) => r.machine)).toEqual([EDGE, LAB]);
    expect(rows[0]!.probes).toEqual([
      { probe: "machine.ssh.command", count: 1, errors: 1, n: null, totalMs: 4, maxMs: 4 },
    ]);
  });
});
