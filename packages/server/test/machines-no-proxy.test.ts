/**
 * Machine traffic never goes through a proxy.
 *
 * A machine's API is reached over the forward held to it (machines/forwards.ts): a loopback
 * listener whose every connection is a channel inside the ssh session this server holds to
 * that machine. Here an HTTP server on loopback stands in for the machine's server, and its
 * address for the forward's endpoint — the proxy, the API client and the page all talk to it
 * with node:http and no agent of their own.
 *
 * - Given proxy variables that name a proxy nobody runs, and this server's global dispatcher
 *   pinned to a proxy that answers 502 to everything, a call to a machine's API is answered by
 *   the machine, and the proxy sees nothing.
 * - Given the same, a page's request through the `/server/<machineId>/…` forward is answered by
 *   the machine too.
 */
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { afterEach, describe, expect, it, vi } from "vitest";
import { machineApi } from "../src/machines/machine-api.js";
import { machinesProxy } from "../src/machines/proxy.js";
import { buildProxyDispatcher } from "../src/net/proxy.js";

const listen = (server: net.Server): Promise<number> =>
  new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)),
  );

describe("machine traffic and the proxy settings", () => {
  const cleanups: Array<() => void | Promise<void>> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    vi.unstubAllEnvs();
  });

  /**
   * A machine's server on loopback, a proxy that answers 502 to everything (and counts what it
   * saw), the proxy variables pointing at a port nothing listens on, and the global dispatcher
   * pinned to the 502 proxy.
   */
  async function rig() {
    const machine = http.createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ answeredBy: "the machine", path: req.url, host: req.headers.host }));
    });
    const machinePort = await listen(machine);
    const seenByProxy: string[] = [];
    const proxy = http.createServer((req, res) => {
      seenByProxy.push(`${req.method} ${req.url}`);
      res.writeHead(502, { "content-type": "text/html" }).end("<h1>502 Bad Gateway</h1>");
    });
    proxy.on("connect", (req, socket) => {
      seenByProxy.push(`CONNECT ${req.url}`);
      socket.end("HTTP/1.1 502 Bad Gateway\r\ncontent-length: 0\r\n\r\n");
    });
    const proxyPort = await listen(proxy);
    const dead = net.createServer();
    const deadPort = await listen(dead);
    await new Promise<void>((resolve) => dead.close(() => resolve()));

    const nowhere = `http://127.0.0.1:${deadPort}`;
    for (const name of ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"]) {
      vi.stubEnv(name, nowhere);
    }
    vi.stubEnv("all_proxy", `socks5://127.0.0.1:${deadPort}`);
    const previous = getGlobalDispatcher();
    const dispatcher = buildProxyDispatcher({
      proxyForApp: true,
      proxyUrl: `http://127.0.0.1:${proxyPort}`,
    });
    setGlobalDispatcher(dispatcher);
    cleanups.push(
      () => void machine.close(),
      () => void proxy.close(),
      async () => {
        setGlobalDispatcher(previous);
        await dispatcher.close();
      },
    );
    return { machinePort, seenByProxy };
  }

  it("a call to a machine's API is answered by the machine, and the proxy sees nothing", async () => {
    const { machinePort, seenByProxy } = await rig();
    // The forward's endpoint: the machine's own address on this side, and the port its server
    // is on over there — the same here, as a forward to a loopback stand-in's port would be.
    const api = machineApi("127.0.0.1", machinePort, machinePort, "penguin_session=x");

    const answer = await api.request("GET", "/api/version");

    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.text)).toMatchObject({
      answeredBy: "the machine",
      path: "/api/version",
      host: `localhost:${machinePort}`,
    });
    expect(seenByProxy).toEqual([]);
  });

  it("a page's request through the /server/<machineId> forward is answered by the machine", async () => {
    const { machinePort, seenByProxy } = await rig();
    const forward = machinesProxy(async () => ({
      host: "127.0.0.1",
      port: machinePort,
      remotePort: machinePort,
      cookie: "penguin_session=x",
      adoptedAt: null,
    }));

    const res = await forward(
      new Request("http://localhost:7368/server/QS7J4YVgSovi-Z2c/api/projects/p/agents"),
    );

    expect(res?.status).toBe(200);
    expect(await res?.json()).toMatchObject({
      answeredBy: "the machine",
      path: "/api/projects/p/agents",
    });
    expect(seenByProxy).toEqual([]);
  });
});
