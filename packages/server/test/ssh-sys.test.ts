/**
 * A machine as a Sys (src/machines/ssh-sys.ts): the translations the provider states, driven
 * through a transport that runs each command on THIS host instead of over ssh.
 *
 * What is under test is the translation, not ssh: the exact command strings (`base64`, `dd`,
 * `stat`, `find`, `cat > tmp && mv`), the detached start with its pid/code files, the quoting
 * of argv and environment, and the loopback listener that dials through the transport. The
 * real session is the end-to-end run's business; here the fake answers the same vocabulary a
 * machine does, so a command that only works by accident (an assignment in front of `if`, a
 * heredoc that eats its input) fails here rather than on a user's machine.
 *
 * POSIX only: the provider's whole surface is POSIX commands, and a Windows CI runner has no
 * `sh` to answer them with.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Sys } from "@prismshadow/penguin-core/sys";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SshConnection } from "../src/ssh/index.js";
import type { ExecResult } from "../src/ssh/index.js";
import { createSshSys } from "../src/machines/ssh-sys.js";
import type { SshSysTransport } from "../src/machines/ssh-sys.js";
import { makeTempRoot, removeTempRoot } from "./helpers.js";

const describePosix = describe.skipIf(process.platform === "win32");

/** Runs one command with this host's `sh` — what a machine does with it, minus the ssh. */
function localRun(command: string, input?: Buffer): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("close", (code) =>
      resolve({
        code: code ?? 255,
        stdout: Buffer.concat(chunks).toString("utf8"),
        stderr: "",
        timedOut: false,
      }),
    );
    // A command that kills itself — or its whole process group — takes the read end of this
    // pipe with it: `end` then raises EPIPE on the NEXT tick, with no listener to catch it,
    // and vitest counts an unhandled error even though the test itself passed.
    child.stdin.on("error", () => {});
    child.stdin.end(input ?? Buffer.alloc(0));
  });
}

/** A transport whose far side is this host. */
function localTransport(): SshSysTransport {
  return {
    exec: (command) => localRun(command),
    stream: (command, opts) => localRun(command, opts.input),
    dial: async (port) => net.connect({ host: "127.0.0.1", port }),
  };
}

/** A POSIX machine on this host, with the three capabilities known present. */
function machine(): Required<Sys> {
  return createSshSys(localTransport(), { platform: "linux" }) as Required<Sys>;
}

/** Collects a process's stdout to its end. */
async function drain(stream: AsyncIterable<Buffer>): Promise<string> {
  let text = "";
  for await (const chunk of stream) text += chunk.toString("utf8");
  return text;
}

let root: string;
let savedTmpdir: string | undefined;

beforeEach(async () => {
  root = await makeTempRoot();
  // The provider writes into `${TMPDIR:-/tmp}/penguin-sys-*` on the far side; the fake far
  // side is this process, so pointing TMPDIR at the test root is what keeps those here.
  savedTmpdir = process.env.TMPDIR;
  process.env.TMPDIR = root;
});

afterEach(async () => {
  if (savedTmpdir === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = savedTmpdir;
  await removeTempRoot(root);
});

it("a win32 machine carries no Sys at all", () => {
  expect(createSshSys(localTransport(), { platform: "win32" })).toEqual({});
});

it("the real connection is one of these", () => {
  // Compile-time pin: the transport the product hands this provider must stay assignable.
  const real: SshSysTransport = new SshConnection({ alias: "machine", user: "test" });
  expect(typeof real.dial).toBe("function");
});

describePosix("a machine's file capability", () => {
  it("round-trips the file tools' primitives", async () => {
    const files = machine().fs;
    const dir = path.join(root, "files", "deep");
    await files.mkdir(dir);
    expect((await files.stat(dir)).isDirectory).toBe(true);

    const target = path.join(dir, "note.txt");
    const content = Buffer.from("one line\nand another\n");
    await files.writeFileAtomic(target, content, { mode: 0o640 });
    expect((await files.readFile(target)).equals(content)).toBe(true);
    expect((await files.readRange(target, 9, 3)).toString("utf8")).toBe("and");

    const stat = await files.stat(target);
    expect(stat.isFile).toBe(true);
    expect(stat.size).toBe(content.length);
    expect(stat.mode & 0o777).toBe(0o640);

    const names = (await files.readdir(path.join(root, "files"))).map((entry) => entry.name);
    expect(names).toContain("deep");
    const resolved = await files.realpath(path.join(dir, "..", "deep", ".", "note.txt"));
    expect(resolved).toBe(target);
  });

  it("copies this side's bytes over", async () => {
    const source = path.join(root, "source.bin");
    const target = path.join(root, "copy.bin");
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 10]);
    await fs.writeFile(source, bytes);
    await machine().fs.copyFile(source, target);
    expect((await machine().fs.readFile(target)).equals(bytes)).toBe(true);
  });

  it("refuses a path it cannot quote rather than guessing", async () => {
    await expect(machine().fs.readFile(path.join(root, 'has"quote'))).rejects.toThrow(
      /will not quote/,
    );
  });
});

describePosix("a machine's execution capability", () => {
  it("streams output and settles the exit code", async () => {
    const started = await machine().exec.exec(["/bin/sh", "-c", "echo out; echo err 1>&2; exit 7"]);
    const out = await drain(started.stdout);
    expect(out).toContain("out");
    expect(out).toContain("err");
    expect(await started.exit).toEqual({ code: 7, signal: null });
  });

  it("honours cwd and environment", async () => {
    const sys = machine();
    const dir = path.join(root, "work");
    await sys.fs.mkdir(dir);
    const started = await sys.exec.exec(["/bin/sh", "-c", 'pwd; printf %s "$PROBE"'], {
      cwd: dir,
      env: { PROBE: "a value with spaces" },
    });
    const out = await drain(started.stdout);
    await started.exit;
    expect(out).toBe(`${dir}\na value with spaces`);
  });

  it("kills a process and still settles its exit", async () => {
    const started = await machine().exec.exec(["sleep", "60"]);
    started.kill();
    const exit = await started.exit;
    expect(exit.code).toBeNull();
    expect(typeof exit.signal).toBe("string");
  });

  it("aborts a run through the options' signal", async () => {
    const controller = new AbortController();
    const started = await machine().exec.exec(["sleep", "60"], { signal: controller.signal });
    controller.abort();
    expect((await started.exit).code).toBeNull();
  });
});

describePosix("a machine's forward", () => {
  it("reaches a port through the transport's dial", async () => {
    const server = net.createServer((socket) => socket.end("answered-through-the-dial\n"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const behind = (server.address() as AddressInfo).port;
    try {
      const forwarded = await machine().forward.forwardPort(behind);
      expect(forwarded.host).toBe("127.0.0.1");
      const answer = await new Promise<string>((resolve, reject) => {
        let text = "";
        const socket = net.connect({ host: forwarded.host, port: forwarded.port }, () => {
          socket.on("data", (chunk: Buffer) => (text += chunk.toString("utf8")));
          socket.on("end", () => resolve(text));
        });
        socket.on("error", reject);
      });
      expect(answer).toContain("answered-through-the-dial");
      await forwarded.close();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
