/**
 * Where a connect to a machine spends its time (roadmap #4, item `machine`; PRFC-0008).
 *
 * Two layers. The service's: a connect job keeps each stage it ran — probe, start the server,
 * probe again, hold, sync models, sync plugins — with when it began and ended, and the result
 * says when the connection was held; while telemetry is on each stage is also a sample, and so
 * is a re-hold that has no job. The transport's: the ssh session coming up, every command on
 * it and the SOCKS handshakes are samples while telemetry is on — shape only, never a
 * command's text — and while it is off, nothing is recorded, not even a clock read.
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
  flushHandshakes,
  setTimingsSink,
  timingsSink,
} from "../src/machines/transport/index.js";
import type { MachineSample } from "../src/machines/transport/index.js";
import { tallyHandshake } from "../src/machines/transport/timings.js";
import { makeTempRoot, waitFor } from "./helpers.js";

/** A sink that keeps what it is handed. */
function collect(): MachineSample[] {
  const samples: MachineSample[] = [];
  setTimingsSink((sample) => samples.push(sample));
  return samples;
}

afterEach(() => {
  flushHandshakes();
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

  it("keeps every stage the job ran, in order, and says when the connection was held", async () => {
    const job = await connectJob(service());
    expect(job.result).toMatchObject({ ok: true, connected: true });
    const stages = job.stages ?? [];
    expect(stages.map((s) => [s.stage, s.ok])).toEqual([
      ["probe", true],
      ["start-server", true],
      ["reprobe", true],
      ["hold", true],
      ["sync-models", true],
      ["sync-plugins", true],
    ]);
    // Each stage has a width, and the next begins after the last one ended.
    for (const [i, s] of stages.entries()) {
      expect(Date.parse(s.endedAt)).toBeGreaterThan(Date.parse(s.startedAt));
      if (i > 0) {
        expect(Date.parse(s.startedAt)).toBeGreaterThan(Date.parse(stages[i - 1]!.endedAt));
      }
    }
    // Held after the hold stage ended, before the syncs began: the moment the page can use it.
    const connectedAt = Date.parse((job.result as { connectedAt: string }).connectedAt);
    expect(connectedAt).toBeGreaterThan(Date.parse(stages[3]!.endedAt));
    expect(connectedAt).toBeLessThan(Date.parse(stages[4]!.startedAt));
  });

  it("with telemetry off, the job still keeps its stages and no sample is taken", async () => {
    expect(timingsSink()).toBeNull();
    const job = await connectJob(service());
    expect(job.stages).toHaveLength(6);
    // Switched on only now: nothing from the connect above was held back to be handed over.
    const samples = collect();
    flushHandshakes();
    expect(samples).toEqual([]);
  });

  it("a server already up is probed once and held: the stages not needed are not recorded", async () => {
    const job = await connectJob(
      service({
        probe: async () => ({
          state: { kind: "running" as const, port: farPort, pid: 4242 },
          machineId: null,
        }),
      }),
    );
    expect(job.stages?.map((s) => s.stage)).toEqual([
      "probe",
      "hold",
      "sync-models",
      "sync-plugins",
    ]);
  });

  it("with telemetry on, each stage is a sample, and the connect is one; a failed hold says so", async () => {
    const samples = collect();
    const job = await connectJob(
      service({ hold: async () => ({ ok: false, detail: "Permission denied (publickey)." }) }),
    );
    expect(job.result).toMatchObject({ ok: false, step: "connect" });
    expect(job.stages?.map((s) => [s.stage, s.ok])).toEqual([
      ["probe", true],
      ["start-server", true],
      ["reprobe", true],
      ["hold", false],
    ]);
    const stageSamples = samples.filter((s) => s.probe === "machine.connect.stage");
    expect(stageSamples.map((s) => [s.attrs?.stage, s.status])).toEqual([
      ["probe", "ok"],
      ["start-server", "ok"],
      ["reprobe", "ok"],
      ["hold", "error"],
    ]);
    for (const s of stageSamples) {
      expect(s.keys).toEqual({ machine: "ssh:nas" });
      expect(s.attrs?.trigger).toBe("connect");
      expect(typeof s.durMs).toBe("number");
    }
    const whole = samples.filter((s) => s.probe === "machine.connect");
    expect(whole).toHaveLength(1);
    expect(whole[0]).toMatchObject({
      status: "error",
      keys: { machine: "ssh:nas" },
      attrs: { trigger: "connect", failedStep: "connect" },
    });
    // Shape only: the ssh diagnosis stays in the job's log, not in a sample.
    expect(JSON.stringify(samples)).not.toContain("Permission denied");
  });

  it("a re-hold nobody watches is measured while telemetry is on, and leaves no job", async () => {
    repo.patch("ssh:nas", { sessionPid: 424242 });
    const machines = service({
      probe: async () => ({
        state: { kind: "running" as const, port: farPort, pid: 4242 },
        machineId: null,
      }),
    });
    const samples = collect();
    await machines.autoConnect();
    expect(machines.jobs()).toEqual([]);
    expect(
      samples.filter((s) => s.probe === "machine.connect.stage").map((s) => s.attrs?.stage),
    ).toEqual(["probe", "hold", "sync-models", "sync-plugins"]);
    expect(samples.find((s) => s.probe === "machine.connect")).toMatchObject({
      status: "ok",
      attrs: { trigger: "rehold" },
    });
  });
});

describe("the SOCKS handshakes, tallied", () => {
  it("are one sample per machine per window: how many, how many failed, the slowest", () => {
    const samples = collect();
    tallyHandshake("ssh:nas", 4, true);
    tallyHandshake("ssh:nas", 9, false);
    tallyHandshake("ssh:build-box", 2, true);
    flushHandshakes();
    expect(samples).toHaveLength(2);
    expect(samples.find((s) => s.keys.machine === "ssh:nas")).toMatchObject({
      probe: "machine.socks.handshake",
      n: 2,
      durMs: 9,
      status: "error",
      attrs: { errors: 1, totalMs: 13 },
    });
    expect(samples.find((s) => s.keys.machine === "ssh:build-box")).toMatchObject({
      n: 1,
      status: "ok",
    });
    // A flush empties the tally: the next window starts from nothing.
    flushHandshakes();
    expect(samples).toHaveLength(2);
  });

  it("count nothing while telemetry is off", () => {
    tallyHandshake("ssh:nas", 4, true);
    const samples = collect();
    flushHandshakes();
    expect(samples).toEqual([]);
  });

  it("switching off hands over what the open window holds", () => {
    const samples = collect();
    tallyHandshake("ssh:nas", 4, true);
    setTimingsSink(null);
    expect(samples.map((s) => [s.probe, s.n])).toEqual([["machine.socks.handshake", 1]]);
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
case "$*" in *refused*) echo "deploy@refused: Permission denied (publickey)." >&2; exit 255 ;; esac
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
    for (const address of ["ssh:nas", "ssh:refused"]) closeConnectionTo(address);
    process.env.PATH = originalPath;
    fs.rmSync(stubBin, { recursive: true, force: true });
  });

  it("the session coming up is one sample, and every command one more — never its text", async () => {
    const samples = collect();
    const conn = connectionTo({ alias: "nas", user: "deploy" });
    expect(await conn.exec("echo top-secret-words")).toMatchObject({ code: 0 });
    expect((await conn.exec("exit 3")).code).toBe(3);
    await conn.stream("cat >/dev/null", { input: Buffer.from("twelve bytes") });

    const opens = samples.filter((s) => s.probe === "machine.ssh.open");
    expect(opens).toHaveLength(1);
    expect(opens[0]).toMatchObject({
      status: "ok",
      keys: { machine: "ssh:nas" },
      attrs: { held: false },
    });
    const commands = samples.filter((s) => s.probe === "machine.ssh.command");
    expect(commands.map((s) => [s.status, s.attrs?.code, s.attrs?.opening])).toEqual([
      ["ok", 0, true],
      ["exit", 3, false],
      ["ok", 0, false],
    ]);
    expect(commands[2]?.attrs?.inputBytes).toBe(12);
    for (const s of commands) {
      expect(typeof s.durMs).toBe("number");
      expect(typeof s.attrs?.waitMs).toBe("number");
    }
    expect(JSON.stringify(samples)).not.toContain("top-secret-words");
    expect(JSON.stringify(samples)).not.toContain("echo");
  });

  it("a session that dies before it answers is a failed open", async () => {
    const samples = collect();
    const opened = await connectionTo({ alias: "refused", user: "deploy" }).open();
    expect(opened.ok).toBe(false);
    expect(samples.find((s) => s.probe === "machine.ssh.open")).toMatchObject({
      status: "error",
      keys: { machine: "ssh:refused" },
    });
    expect(samples.find((s) => s.probe === "machine.ssh.command")).toMatchObject({
      status: "exit",
      attrs: { code: 255, opening: true },
    });
  });

  it("a command that outlasts its timeout says so", async () => {
    const samples = collect();
    const conn = connectionTo({ alias: "nas", user: "deploy" });
    await conn.stream("sleep 5", { input: Buffer.alloc(0), timeoutMs: 150 });
    expect(samples.filter((s) => s.probe === "machine.ssh.command").map((s) => s.status)).toEqual([
      "timeout",
    ]);
  });

  it("with telemetry off, a session opened then is never sampled — only what is asked after", async () => {
    const conn = connectionTo({ alias: "nas", user: "deploy" });
    await conn.exec("true");
    const samples = collect();
    await conn.exec("true");
    expect(samples.map((s) => [s.probe, s.attrs?.opening])).toEqual([
      ["machine.ssh.command", false],
    ]);
  });

  it("a SOCKS dial through the session is tallied, failure included", async () => {
    const samples = collect();
    const conn = connectionTo({ alias: "nas", user: "deploy" });
    // The stub's session has no SOCKS listener behind its port: the handshake is refused.
    await expect(conn.dial(7364)).rejects.toThrow();
    await expect(conn.dial(7364)).rejects.toThrow();
    flushHandshakes();
    expect(samples.find((s) => s.probe === "machine.socks.handshake")).toMatchObject({
      keys: { machine: "ssh:nas" },
      n: 2,
      status: "error",
      attrs: { errors: 2 },
    });
  });
});
