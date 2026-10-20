/**
 * The Sys capability implementations on the server (src/sys): the host default — the file
 * tools' in-process port plus a whole-file copy, this process's children, this host's
 * loopback — and `runServer`, which lays a server program onto a Sys, starts it, reads the
 * port it announces, and hands back its shell.
 *
 * The real I/O is the point (temp files, child node processes, loopback sockets); the
 * server program is a stub fixture that does the one thing `runServer` interprets — bind,
 * then write its port into PENGUIN_PORT_FILE.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import { createServer, type AddressInfo, type Socket } from "node:net";
import path from "node:path";
import { createSys, HostSys, parsePortAnnouncement, runServer } from "../src/sys/index.js";
import type { ServerRun } from "../src/sys/index.js";
import { makeTempRoot, removeTempRoot } from "./helpers.js";

const STUB_SERVER = path.join(import.meta.dirname, "fixtures", "sys-stub-server.mjs");
const STUB_CLI = path.join(import.meta.dirname, "fixtures", "sys-stub-cli.mjs");

let root: string;
let data: string;
let srv: string;

beforeEach(async () => {
  root = await makeTempRoot();
  data = path.join(root, "data");
  srv = path.join(root, "srv");
  await fs.mkdir(srv, { recursive: true });
});

afterEach(async () => {
  await removeTempRoot(root);
});

/** Collects an output stream into one buffer. */
async function drain(stream: AsyncIterable<Buffer>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** A raw echo server on this host's loopback: the endpoint these tests reach. */
async function echoUpstream(): Promise<{ port: number; close: () => Promise<void> }> {
  const live = new Set<Socket>();
  const server = createServer((socket) => {
    live.add(socket);
    socket.once("close", () => live.delete(socket));
    socket.pipe(socket);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        // The server ends its own connections first: close() alone would wait each
        // caller out instead.
        for (const socket of live) socket.destroy();
        live.clear();
        server.close(() => resolve());
      }),
  };
}

/** Starts the stub server and guarantees it is stopped when the test ends. */
async function startStub(
  overrides: Partial<Parameters<typeof runServer>[2]> = {},
): Promise<ServerRun> {
  const run = await runServer(createSys(), 0, {
    entry: path.join(srv, "sys-stub-server.mjs"),
    dataRoot: data,
    program: [{ source: STUB_SERVER, target: path.join(srv, "sys-stub-server.mjs") }],
    ...overrides,
  });
  return run;
}

describe("HostSys", () => {
  it("createSys() returns the host default carrying its capabilities", () => {
    const sys = createSys();
    expect(sys).toBeInstanceOf(HostSys);
    expect(sys.fs?.sandboxed).toBe(false);
    expect(sys.exec).toBeDefined();
    expect(sys.listen).toBeDefined();
    expect(sys.forward).toBeDefined();
  });

  it("fs is the file tools' port plus a whole-file copy", async () => {
    const sys = createSys();
    const file = path.join(root, "host-fs.txt");
    await sys.fs!.writeFileAtomic(file, Buffer.from("contents"), {});
    expect((await sys.fs!.readFile(file)).toString("utf8")).toBe("contents");
    expect((await sys.fs!.readRange(file, 0, 4)).toString("utf8")).toBe("cont");
    expect((await sys.fs!.stat(file)).size).toBe(8);

    const binary = Buffer.from([0, 1, 2, 255, 254]);
    const source = path.join(root, "binary.bin");
    const target = path.join(root, "copied.bin");
    await sys.fs!.writeFileAtomic(source, binary, {});
    await sys.fs!.copyFile(source, target);
    expect((await sys.fs!.readFile(target)).equals(binary)).toBe(true);

    // A copy replaces what was there, whole.
    await sys.fs!.writeFileAtomic(target, Buffer.from("old"), {});
    await sys.fs!.copyFile(source, target);
    expect((await sys.fs!.readFile(target)).equals(binary)).toBe(true);
  });

  it("copyFile does not create the target's directory: laying a tree makes it first", async () => {
    const sys = createSys();
    const source = path.join(root, "one.txt");
    await sys.fs!.writeFileAtomic(source, Buffer.from("x"), {});
    await expect(sys.fs!.copyFile(source, path.join(root, "missing", "one.txt"))).rejects.toThrow(
      /ENOENT/,
    );
  });

  it("exec runs the exact argv and streams its output", async () => {
    const sys = createSys();
    const proc = await sys.exec!.exec([process.execPath, "-e", "process.stdout.write('hi')"]);
    expect((await drain(proc.stdout)).toString("utf8")).toBe("hi");
    await expect(proc.exit).resolves.toEqual({ code: 0, signal: null });
  });

  it("exec keeps one argument with spaces as one argument", async () => {
    const sys = createSys();
    const proc = await sys.exec!.exec([
      process.execPath,
      "-e",
      "process.stdout.write(process.argv[1])",
      "a b",
    ]);
    expect((await drain(proc.stdout)).toString("utf8")).toBe("a b");
    await expect(proc.exit).resolves.toEqual({ code: 0, signal: null });
  });

  it("exec collects stderr and settles a failing exit code", async () => {
    const sys = createSys();
    const proc = await sys.exec!.exec([
      process.execPath,
      "-e",
      "process.stderr.write('bad'); process.exit(3)",
    ]);
    expect((await drain(proc.stderr)).toString("utf8")).toBe("bad");
    await expect(proc.exit).resolves.toEqual({ code: 3, signal: null });
  });

  it("exec kill settles the exit with the signal", async () => {
    const sys = createSys();
    const proc = await sys.exec!.exec([process.execPath, "-e", "setInterval(() => {}, 1000)"]);
    proc.kill();
    const exit = await proc.exit;
    expect(exit.code).toBeNull();
    expect(exit.signal).not.toBeNull();
  });

  it("exec rejects the exit when the program does not exist", async () => {
    const sys = createSys();
    const proc = await sys.exec!.exec(["/nonexistent/penguin-sys-test-program"]);
    await expect(proc.exit).rejects.toThrow();
  });

  it("exec refuses an empty argv", async () => {
    const sys = createSys();
    await expect(sys.exec!.exec([])).rejects.toThrow(/argv/);
  });

  it("exec honors cwd and environment entries", async () => {
    const sys = createSys();
    const workdir = path.join(root, "workdir");
    await fs.mkdir(workdir);
    const proc = await sys.exec!.exec(
      [
        process.execPath,
        "-e",
        "process.stdout.write(process.cwd() + '|' + (process.env.PENGUIN_SYS_TEST || ''))",
      ],
      { cwd: workdir, env: { PENGUIN_SYS_TEST: "carried" } },
    );
    const out = (await drain(proc.stdout)).toString("utf8");
    expect(out).toBe(`${workdir}|carried`);
    await expect(proc.exit).resolves.toEqual({ code: 0, signal: null });
  });

  it("listen binds a picked port and round-trips a connection both ways", async () => {
    const sys = createSys();
    const listener = await sys.listen!.listen(0);
    expect(listener.port).toBeGreaterThan(0);
    const accepted = listener.accept();
    const client = await sys.listen!.connect("127.0.0.1", listener.port);
    const serverSide = await accepted;
    await client.write(Buffer.from("ping"));
    expect((await serverSide.read())?.toString("utf8")).toBe("ping");
    await serverSide.write(Buffer.from("pong"));
    expect((await client.read())?.toString("utf8")).toBe("pong");
    await listener.close();
    // The accepted connection ended with the endpoint: the client's next read sees the end.
    await expect(client.read()).resolves.toBeNull();
    await expect(listener.accept()).rejects.toThrow(/closed/);
  });

  it("an abort signal closes the listener and rejects its pending accepts", async () => {
    const sys = createSys();
    const controller = new AbortController();
    const listener = await sys.listen!.listen(0, { signal: controller.signal });
    const pending = listener.accept();
    const port = listener.port;
    controller.abort();
    await expect(pending).rejects.toThrow(/closed/);
    await listener.close();
    await expect(sys.listen!.connect("127.0.0.1", port)).rejects.toThrow();
  });

  it("connect to a port nothing listens on rejects", async () => {
    const sys = createSys();
    const dead = await echoUpstream();
    const port = dead.port;
    await dead.close();
    await expect(sys.listen!.connect("127.0.0.1", port)).rejects.toThrow();
  });
});

describe("runServer", () => {
  it("lays a program tree down, starts it and reads the announced port", async () => {
    const assets = path.join(root, "assets");
    await fs.mkdir(path.join(assets, "nested"), { recursive: true });
    await fs.writeFile(path.join(assets, "index.html"), "<!doctype html>");
    await fs.writeFile(path.join(assets, "nested", "app.js"), "export {};");

    const run = await startStub({
      program: [
        { source: STUB_SERVER, target: path.join(srv, "sys-stub-server.mjs") },
        { source: assets, target: path.join(srv, "web-dist") },
      ],
    });
    try {
      expect(run.port).toBeGreaterThan(0);
      const answered = await fetch(`http://127.0.0.1:${run.port}/`);
      expect(await answered.text()).toBe("stub");
      expect(await fs.readFile(path.join(srv, "web-dist", "index.html"), "utf8")).toBe(
        "<!doctype html>",
      );
      expect(await fs.readFile(path.join(srv, "web-dist", "nested", "app.js"), "utf8")).toBe(
        "export {};",
      );
      expect((await fs.readFile(path.join(data, "server-port"), "utf8")).trim()).toBe(
        String(run.port),
      );
    } finally {
      await run.stop();
    }
    await expect(run.process.exit).resolves.toBeDefined();
  });

  it("does not mistake a stale announcement for this run's", async () => {
    // A dead port left on the same root: the file is emptied before the start, and only a
    // written port counts.
    await fs.mkdir(data, { recursive: true });
    await fs.writeFile(path.join(data, "server-port"), "1\n");
    const run = await startStub();
    try {
      expect(run.port).not.toBe(1);
    } finally {
      await run.stop();
    }
  });

  it("rejects with the program's own last words when it dies before announcing", async () => {
    await expect(
      runServer(createSys(), 0, { entry: path.join(srv, "gone.mjs"), dataRoot: data }),
    ).rejects.toThrow(/exited before announcing its port[\s\S]*(Cannot find module|ERR_MODULE)/);
  });

  it("turns a bad port into a plain refusal", async () => {
    await expect(
      runServer(createSys(), 70_000, { entry: path.join(srv, "x.mjs"), dataRoot: data }),
    ).rejects.toThrow(/bad port/);
  });

  it("installPlugin refuses when the world carries no CLI", async () => {
    const run = await startStub();
    try {
      await expect(run.installPlugin("@penguinharness/a2ui")).rejects.toThrow(/penguin CLI/);
    } finally {
      await run.stop();
    }
  });

  it("installPlugin drives the world's CLI against the server's own address", async () => {
    const log = path.join(root, "cli-log.json");
    const run = await startStub({ cli: STUB_CLI, env: { SYS_TEST_CLI_LOG: log } });
    try {
      const answer = await run.installPlugin("@penguinharness/a2ui");
      expect(answer.installed).toEqual({
        name: "@penguinharness/a2ui",
        version: "0.2.16",
        library: true,
        modules: false,
      });
      const seen = JSON.parse(await fs.readFile(log, "utf8")) as {
        argv: string[];
        home: string | null;
      };
      expect(seen.argv).toEqual([
        "plugin",
        "install",
        "@penguinharness/a2ui",
        "--json",
        "--server",
        `http://localhost:${run.port}`,
      ]);
      expect(seen.home).toBe(data);
    } finally {
      await run.stop();
    }
  });

  it("installPlugin reports what the CLI refused with", async () => {
    const run = await startStub({ cli: STUB_CLI, env: { SYS_TEST_CLI_FAIL: "1" } });
    try {
      await expect(run.installPlugin("@penguinharness/a2ui")).rejects.toThrow(
        /exited 4[\s\S]*registry refused/,
      );
    } finally {
      await run.stop();
    }
  });

  it("parsePortAnnouncement reads a decimal port and nothing else", () => {
    expect(parsePortAnnouncement(Buffer.from("53187\n"))).toBe(53187);
    expect(parsePortAnnouncement(Buffer.from(" 53187 \n"))).toBe(53187);
    expect(parsePortAnnouncement(Buffer.from(""))).toBeNull();
    expect(parsePortAnnouncement(Buffer.from("0\n"))).toBeNull();
    expect(parsePortAnnouncement(Buffer.from("port=53187\n"))).toBeNull();
    expect(parsePortAnnouncement(Buffer.from("70000\n"))).toBeNull();
  });
});
