/**
 * Where a connect to a machine spends its time (roadmap #4, item `machine`; PRFC-0008).
 *
 * Two layers. The service's: a connect job keeps each stage it ran — probe, start the server,
 * probe again, hold, sync models, sync plugins — and when the connection was held; while
 * telemetry is on each stage is also a sample, and so is a re-hold with no job. The
 * transport's: every command, never its text.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectConfig } from "@prismshadow/penguin-core";
import type { MachineJob } from "../src/api/types.js";
import { openDatabase } from "../src/db/database.js";
import { MachinesRepo } from "../src/db/repos/machines.js";
import { MachinesService } from "../src/machines/service.js";
import type { MachinesEffects } from "../src/machines/service.js";
import {
  closeConnectionTo,
  connectionTo,
  setTimingsSink,
} from "../src/machines/transport/index.js";
import type { MachineSample } from "../src/machines/transport/index.js";
import { makeTempRoot, waitFor } from "./helpers.js";

/** A sink that keeps what it is handed. */
function collect(): MachineSample[] {
  const samples: MachineSample[] = [];
  setTimingsSink((sample) => samples.push(sample));
  return samples;
}

afterEach(() => {
  setTimingsSink(null);
});

describe("a connect, stage by stage", () => {
  let root: string;
  let repo: MachinesRepo;
  /** The machine's API over there: every Project read answers empty, every write succeeds. */
  let far: http.Server;
  let farPort: number;
  const held = new Set<string>();

  beforeEach(async () => {
    root = await makeTempRoot();
    const store = openDatabase(":memory:");
    store
      .prepare(
        "INSERT INTO users (user_id, password_hash, is_admin, created_at) VALUES (?, ?, 1, ?)",
      )
      .run("admin", "x", "2026-09-30T00:00:00.000Z");
    store
      .prepare("INSERT INTO projects (project_id, owner_user_id, created_at) VALUES (?, ?, ?)")
      .run("default_project", "admin", "2026-09-30T00:00:00.000Z");
    repo = new MachinesRepo(store);
    repo.patch("ssh:nas", { version: "9.9.9", installedAt: "2026-09-01T00:00:00.000Z" });
    repo.setMembers("default_project", ["ssh:nas"]);
    held.clear();
    far = http.createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.method === "GET" && req.url === "/api/projects") {
        res.end(JSON.stringify({ projects: [{ projectId: "default_project" }] }));
      } else if (req.method === "GET" && req.url?.endsWith("/plugins") === true) {
        res.end(JSON.stringify({ plugins: [] }));
      } else {
        res.end("{}");
      }
    });
    await new Promise<void>((resolve) => far.listen(0, "127.0.0.1", resolve));
    farPort = (far.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => far.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** A clock that moves a second per reading, so every stage has a width and an order. */
  function ticking(): () => Date {
    let at = Date.parse("2026-09-30T08:00:00.000Z");
    return () => new Date((at += 1000));
  }

  function service(over: Partial<MachinesEffects> = {}): MachinesService {
    let up = false;
    return new MachinesService(root, "TESTlocalID00000", repo, {
      listAliases: () => ["nas"],
      resolvePlan: () => ({ baseVersion: "9.9.9", harness: null, hmrDir: null, version: "9.9.9" }),
      now: ticking(),
      // Down until started: the connect runs every stage there is.
      probe: async () =>
        up
          ? { state: { kind: "running" as const, port: farPort, pid: 4242 }, machineId: null }
          : { state: { kind: "stopped" as const }, machineId: null },
      startServer: async () => {
        up = true;
        return { ok: true };
      },
      hold: async (target) => {
        held.add(`ssh:${target.alias}`);
        return { ok: true, session: { pid: process.pid, socksPort: 1 } };
      },
      session: (address) => (held.has(address) ? { pid: process.pid, socksPort: 1 } : null),
      agent: () => new http.Agent(),
      mintToken: async () => ({ kind: "minted" as const, token: "remote-token" }),
      loadConfig: async () => ({ models: [] }) as unknown as ProjectConfig,
      ...over,
    });
  }

  async function connectJob(machines: MachinesService): Promise<MachineJob> {
    expect(await machines.startConnect("ssh:nas")).toEqual({ ok: true });
    await waitFor(() => machines.job()?.running === false, 5000);
    return machines.job()!;
  }

  const running = async () => ({
    state: { kind: "running" as const, port: farPort, pid: 4242 },
    machineId: null,
  });

  it("keeps every stage the job ran, in order, and when the connection was held — with or without telemetry", async () => {
    const job = await connectJob(service());
    const stages = job.stages ?? [];
    expect(stages.map((s) => [s.stage, s.ok])).toEqual(
      ["probe", "start-server", "reprobe", "hold", "sync-models", "sync-plugins"].map((s) => [
        s,
        true,
      ]),
    );
    for (const [i, s] of stages.entries()) {
      expect(Date.parse(s.endedAt)).toBeGreaterThan(Date.parse(s.startedAt));
      if (i > 0)
        expect(Date.parse(s.startedAt)).toBeGreaterThan(Date.parse(stages[i - 1]!.endedAt));
    }
    // Held after the hold stage, before the syncs: the moment the page can use it.
    const connectedAt = Date.parse((job.result as { connectedAt: string }).connectedAt);
    expect(connectedAt).toBeGreaterThan(Date.parse(stages[3]!.endedAt));
    expect(connectedAt).toBeLessThan(Date.parse(stages[4]!.startedAt));
    // Telemetry was off: switched on only now, nothing was held back to hand over.
    const samples = collect();
    expect(samples).toEqual([]);
    // A server already up is probed once and held: the stages not needed are not recorded.
    const up = await connectJob(service({ probe: running }));
    expect(up.stages?.map((s) => s.stage)).toEqual([
      "probe",
      "hold",
      "sync-models",
      "sync-plugins",
    ]);
  });

  it("with telemetry on, each stage is a sample and the connect is one; a failed hold says so, without its text", async () => {
    const samples = collect();
    const job = await connectJob(
      service({ hold: async () => ({ ok: false, detail: "Permission denied (publickey)." }) }),
    );
    expect(job.result).toMatchObject({ ok: false, step: "connect" });
    const stageSamples = samples.filter((s) => s.probe === "machine.connect.stage");
    expect(stageSamples.map((s) => [s.attrs?.stage, s.status])).toEqual([
      ["probe", "ok"],
      ["start-server", "ok"],
      ["reprobe", "ok"],
      ["hold", "error"],
    ]);
    expect(stageSamples.every((s) => s.keys.machine === "ssh:nas")).toBe(true);
    expect(samples.filter((s) => s.probe === "machine.connect")).toMatchObject([
      { status: "error", attrs: { failedStep: "connect" } },
    ]);
    expect(JSON.stringify(samples)).not.toContain("Permission denied");
  });

  it("a re-hold nobody watches is measured while telemetry is on, and leaves no job", async () => {
    repo.patch("ssh:nas", { sessionPid: 424242 });
    const machines = service({ probe: running });
    const samples = collect();
    await machines.autoConnect();
    expect(machines.jobs()).toEqual([]);
    expect(
      samples.filter((s) => s.probe === "machine.connect.stage").map((s) => s.attrs?.stage),
    ).toEqual(["probe", "hold", "sync-models", "sync-plugins"]);
    expect(samples.find((s) => s.probe === "machine.connect")).toMatchObject({
      status: "ok",
    });
  });
});

// The stub `ssh` is a shell script, which execFile cannot run on Windows (same as
// machines-transport-session.test.ts, whose stub this is).
const posixOnly = process.platform === "win32" ? describe.skip : describe;

posixOnly("the session's own collection points", () => {
  let stubBin: string;
  let originalPath: string | undefined;
  beforeEach(() => {
    stubBin = fs.mkdtempSync(path.join(os.tmpdir(), "penguin-timings-"));
    fs.writeFileSync(
      path.join(stubBin, "ssh"),
      `#!/bin/sh
case "$*" in *" -O "*) exit 0 ;; esac
for a in "$@"; do last=$a; done
[ "$last" = sh ] && exec /bin/sh
exit 1
`,
    );
    fs.chmodSync(path.join(stubBin, "ssh"), 0o755);
    originalPath = process.env.PATH;
    process.env.PATH = `${stubBin}:${process.env.PATH ?? ""}`;
  });
  afterEach(() => {
    closeConnectionTo("ssh:nas");
    process.env.PATH = originalPath;
    fs.rmSync(stubBin, { recursive: true, force: true });
  });

  it("every command is a sample — exit code, a timeout as such, never its text", async () => {
    const conn = connectionTo({ alias: "nas", user: "deploy" });
    await conn.exec("true"); // off: not sampled
    const samples = collect();
    expect(await conn.exec("echo top-secret-words")).toMatchObject({ code: 0 });
    expect((await conn.exec("exit 3")).code).toBe(3);
    await conn.stream("cat >/dev/null", { input: Buffer.from("twelve bytes") });
    await conn.stream("sleep 5", { input: Buffer.alloc(0), timeoutMs: 150 });
    expect(samples.map((s) => [s.probe, s.status, s.attrs?.code])).toEqual([
      ["machine.ssh.command", "ok", 0],
      ["machine.ssh.command", "exit", 3],
      ["machine.ssh.command", "ok", 0],
      ["machine.ssh.command", "timeout", 255],
    ]);
    for (const word of ["top-secret-words", "echo"])
      expect(JSON.stringify(samples)).not.toContain(word);
  });
});
