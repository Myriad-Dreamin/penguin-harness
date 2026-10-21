/**
 * A machine as a Sys (src/sys/ssh/sys.ts): one capability, `forward`, driven through a
 * transport that dials THIS host instead of one reached over ssh.
 *
 * What is under test is the shape, not ssh: a machine carries `forward` only — its server owns
 * that machine's files and processes, and this side reaches it over its APIs — so the test also
 * pins the absence of `fs` and `exec` rather than leaving it to a comment. The real session is
 * the end-to-end run's business; here the fake dial answers as a machine's loopback would.
 *
 * POSIX only: a Windows runner has no loopback server the fake machine can answer with.
 */
import net from "node:net";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { SshConnection, createSshSys } from "../src/sys/ssh/index.js";
import type { SshSysTransport } from "../src/sys/ssh/index.js";

const describePosix = describe.skipIf(process.platform === "win32");

/** A transport whose far side is this host. */
function localTransport(): SshSysTransport {
  return {
    dial: async (port) => net.connect({ host: "127.0.0.1", port }),
  };
}

it("a machine carries forward, and deliberately nothing else", () => {
  const sys = createSshSys(localTransport(), { shell: "posix" });
  expect(sys.forward).toBeDefined();
  // Absent by design: a process started from here would not be the machine server's, and a
  // file written here would bypass the server that owns that data root. Callers fail closed.
  expect(sys.fs).toBeUndefined();
  expect(sys.exec).toBeUndefined();
  expect(sys.listen).toBeUndefined();
});

it("a cmd shell carries no Sys at all", () => {
  expect(createSshSys(localTransport(), { shell: "cmd" })).toEqual({});
});

it("the real connection is one of these", () => {
  // Compile-time pin: the transport the product hands this provider must stay assignable.
  const real: SshSysTransport = new SshConnection({ alias: "machine", user: "test" });
  expect(typeof real.dial).toBe("function");
});

describePosix("a machine's forward", () => {
  it("reaches a port through the transport's dial", async () => {
    const server = net.createServer((socket) => socket.end("answered-through-the-dial\n"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const behind = (server.address() as AddressInfo).port;
    try {
      const forward = createSshSys(localTransport(), { shell: "posix" }).forward;
      expect(forward).toBeDefined();
      const forwarded = await forward!.forwardPort(behind);
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
