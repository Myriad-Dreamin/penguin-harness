/**
 * The kept-alive agent to one machine port (transport/session-agent.ts):
 *
 * - Requests in a row share one channel instead of dialling one each.
 * - A channel of a session that is no longer the one up never carries another request: it is
 *   destroyed, idle or busy, and the next request dials through the current session.
 * - A request given up on takes its channel with it; it is never handed to the next request.
 */
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { closeConnectionTo, connectionTo } from "../src/machines/transport/index.js";
import { SessionAgent } from "../src/machines/transport/session-agent.js";

describe("the session agent", () => {
  let server: http.Server | null = null;
  let pooled: SessionAgent | null = null;

  afterEach(() => {
    pooled?.destroy();
    pooled = null;
    server?.closeAllConnections();
    server?.close();
    server = null;
  });

  /** A machine's API that counts the connections it accepts; `/silent` never answers. */
  const machine = async (): Promise<{ port: number; connections: () => number }> => {
    let accepted = 0;
    server = http.createServer((req, res) => {
      if (req.url === "/silent") return;
      res.end("ok");
    });
    server.on("connection", () => accepted++);
    const port = await new Promise<number>((resolve) =>
      server!.listen(0, "127.0.0.1", () => resolve((server!.address() as AddressInfo).port)),
    );
    return { port, connections: () => accepted };
  };

  /** An agent whose dials are tagged with whatever session `current.pid` names when they are made. */
  const agentTo = (port: number, current: { pid: number }): SessionAgent =>
    new SessionAgent(
      () =>
        new Promise((resolve, reject) => {
          const session = current.pid;
          const socket = net.connect(port, "127.0.0.1", () => resolve({ socket, session }));
          socket.once("error", reject);
        }),
    );

  const get = (agent: http.Agent, port: number, path = "/"): Promise<string> =>
    new Promise((resolve, reject) => {
      const req = http.request({ agent, host: "127.0.0.1", port, path }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => resolve(body));
      });
      req.on("error", reject);
      req.end();
    });

  it("carries requests in a row over one channel", async () => {
    const { port, connections } = await machine();
    pooled = agentTo(port, { pid: 1 });
    expect(await get(pooled.agent, port)).toBe("ok");
    expect(await get(pooled.agent, port)).toBe("ok");
    expect(await get(pooled.agent, port)).toBe("ok");
    expect(connections()).toBe(1);
  });

  it("never reuses a channel of a replaced session", async () => {
    const { port, connections } = await machine();
    const current = { pid: 1 };
    pooled = agentTo(port, current);
    await get(pooled.agent, port);
    const [idle] = Object.values(pooled.agent.freeSockets).flat();
    expect(idle).toBeDefined();

    // The transport reopened the session: the old channel is let go before the next request.
    current.pid = 2;
    pooled.retire(2);
    expect(idle!.destroyed).toBe(true);
    expect(await get(pooled.agent, port)).toBe("ok");
    expect(connections()).toBe(2);

    // The current session's channels are kept.
    pooled.retire(2);
    expect(await get(pooled.agent, port)).toBe("ok");
    expect(connections()).toBe(2);
  });

  it("destroys a busy channel of a session that went away, and keeps nothing when none is up", async () => {
    const { port } = await machine();
    pooled = agentTo(port, { pid: 1 });
    const pending = get(pooled.agent, port, "/silent");
    await new Promise((r) => setTimeout(r, 50));
    pooled.retire(null);
    await expect(pending).rejects.toThrow();
  });

  it("does not hand a cancelled request's channel to the next one", async () => {
    const { port, connections } = await machine();
    pooled = agentTo(port, { pid: 1 });
    const req = http.request({ agent: pooled.agent, host: "127.0.0.1", port, path: "/silent" });
    req.on("error", () => undefined);
    req.end();
    await new Promise((r) => setTimeout(r, 50));
    req.destroy();
    expect(await get(pooled.agent, port)).toBe("ok");
    expect(connections()).toBe(2);
  });
});

describe("the connection's agents", () => {
  it("are one per machine port, shared by every handle, and dropped with the connection", () => {
    const target = { alias: "agent-registry-test", user: "" };
    const first = connectionTo(target).agent(7364);
    expect(connectionTo(target).agent(7364)).toBe(first);
    expect(connectionTo(target).agent(7365)).not.toBe(first);
    closeConnectionTo("ssh:agent-registry-test");
    expect(connectionTo(target).agent(7364)).not.toBe(first);
    closeConnectionTo("ssh:agent-registry-test");
  });
});
