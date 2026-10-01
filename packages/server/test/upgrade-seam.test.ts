/**
 * The upgrade seam (src/hmr/upgrade-seam.ts): every WebSocket upgrade on a listener is
 * handed, raw, to the current generation of the platform, and the seam itself only answers
 * what no platform took. The terminal handshake behind it is terminal-stream.test.ts's.
 */
import { createServer } from "node:http";
import type { Server } from "node:http";
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { Hmr } from "@prismshadow/penguin-hmr";
import type { PlatformApi } from "../src/hmr/platform.js";
import { platformUpgradeSeam } from "../src/hmr/upgrade-seam.js";

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

/** A control object whose current generation is `api`, or none when `api` is an Error. */
function control(api: object | Error): Hmr<PlatformApi> {
  return {
    current: () =>
      api instanceof Error ? Promise.reject(api) : Promise.resolve({ api } as never),
  } as unknown as Hmr<PlatformApi>;
}

async function listen(hmr: Hmr<PlatformApi>): Promise<number> {
  server = createServer();
  platformUpgradeSeam(server, hmr);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
  return (server!.address() as net.AddressInfo).port;
}

/** Sends a WebSocket upgrade for `path` and returns the status line the server answered. */
function upgrade(port: number, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\n` +
          "Connection: Upgrade\r\nSec-WebSocket-Version: 13\r\n" +
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
      );
    });
    let data = "";
    socket.on("data", (chunk) => (data += chunk.toString()));
    socket.on("close", () => resolve(data.split("\r\n")[0] ?? ""));
    socket.on("error", reject);
  });
}

describe("the upgrade seam", () => {
  it("answers 404 when the platform declines the path", async () => {
    const port = await listen(control({ upgrade: () => false }));
    expect(await upgrade(port, "/anything")).toBe("HTTP/1.1 404 Not Found");
  });

  it("answers 404 for a platform from before the seam, which has no upgrade", async () => {
    const port = await listen(control({}));
    expect(await upgrade(port, "/api/terminals/x/stream")).toBe("HTTP/1.1 404 Not Found");
  });

  it("answers 503 when no generation is current: no platform is not a decline", async () => {
    const port = await listen(control(new Error("no generation")));
    expect(await upgrade(port, "/api/terminals/x/stream")).toBe("HTTP/1.1 503 Service Unavailable");
  });

  it("answers 500 when the platform throws: it claimed the upgrade", async () => {
    const port = await listen(
      control({
        upgrade: () => {
          throw new Error("boom");
        },
      }),
    );
    expect(await upgrade(port, "/x")).toBe("HTTP/1.1 500 Internal Server Error");
  });

  it("leaves the socket to a platform that took it, with the request it was offered", async () => {
    let seen: string | undefined;
    const port = await listen(
      control({
        upgrade: (req: { url?: string }, socket: net.Socket) => {
          seen = req.url;
          socket.end("HTTP/1.1 418 Mine\r\n\r\n");
          return true;
        },
      }),
    );
    expect(await upgrade(port, "/api/whatever?q=1")).toBe("HTTP/1.1 418 Mine");
    expect(seen).toBe("/api/whatever?q=1");
  });
});
