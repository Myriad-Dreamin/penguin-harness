/**
 * The kind of session behind an API socket (socket/serve.ts), over a real listening server.
 *
 * A call on the socket carries no cookie: the runtime authenticated the handshake's cookie and
 * hands the platform how that session was minted along with the socket. What is pinned: a
 * socket the desktop shell's own window opened is answered as that window — `/api/me` says
 * `desktop` and a shell-only route lets it in — while a socket a password session opened
 * against the same server is answered as a password session and refused there, exactly as
 * each is over HTTP.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serve } from "@hono/node-server";
import type { Server as HttpServer } from "node:http";
import { WebSocket } from "ws";
import { createDesktopApp, desktopLoginCookie, loginAdmin } from "./helpers.js";
import type { TestApp } from "./helpers.js";
import { attachTerminalWebSocket } from "../src/terminal/ws.js";
import { apiSocketPath } from "../src/socket/ref.js";
import type { ErrorBody, MeResponse } from "../src/api/types.js";

let t: TestApp;
let port: number;
let server: ReturnType<typeof serve>;
/** The shell's token redeems once, so both cookies are taken once and shared. */
let desktopCookie: string;
let passwordCookie: string;

beforeAll(async () => {
  t = await createDesktopApp();
  desktopCookie = await desktopLoginCookie(t.app);
  passwordCookie = (await loginAdmin(t.app)).cookie;
  await new Promise<void>((resolve) => {
    server = serve({ fetch: t.app.fetch, hostname: "127.0.0.1", port: 0 }, (info) => {
      port = info.port;
      resolve();
    });
  });
  attachTerminalWebSocket(server as unknown as HttpServer, {
    hmr: t.deps.hmr,
    authService: t.deps.authService,
    log: () => undefined,
  });
});

afterAll(async () => {
  (server as unknown as HttpServer).closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await t.cleanup();
});

interface Answer {
  status: number;
  body: unknown;
}

/** Opens a socket under `cookie`, makes the calls in order, and returns their answers. */
async function callOver(
  cookie: string,
  calls: { method: string; path: string }[],
): Promise<Answer[]> {
  // Canonical App host, as a browser targets it (see api-socket.test.ts).
  const ws = new WebSocket(`ws://127.0.0.1:${port}${apiSocketPath("admin")}`, {
    headers: { host: `localhost:${port}`, cookie },
  });
  try {
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
      ws.once("unexpected-response", (_req, res) => {
        res.resume();
        reject(new Error(`handshake refused: ${res.statusCode}`));
      });
    });
    const answers: Answer[] = [];
    for (const [index, call] of calls.entries()) {
      const answer = new Promise<Answer>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no frame within 5s")), 5000);
        ws.once("message", (data) => {
          clearTimeout(timer);
          resolve(JSON.parse(data.toString()) as Answer);
        });
      });
      ws.send(JSON.stringify({ id: index + 1, call }));
      answers.push(await answer);
    }
    return answers;
  } finally {
    ws.close();
  }
}

const CALLS = [
  { method: "GET", path: "/api/me" },
  { method: "GET", path: "/api/desktop/update" },
];

describe("the session kind behind an API socket", () => {
  it("answers the desktop shell's own window as that window", async () => {
    const [me, update] = await callOver(desktopCookie, CALLS);
    expect(me!.status).toBe(200);
    expect((me!.body as MeResponse).sessionVia).toBe("desktop");
    expect(update!.status).toBe(200);
  });

  it("answers a password session against the same server as a password session", async () => {
    const [me, update] = await callOver(passwordCookie, CALLS);
    expect(me!.status).toBe(200);
    expect((me!.body as MeResponse).sessionVia).toBe("password");
    expect(update!.status).toBe(403);
    expect((update!.body as ErrorBody).error.code).toBe("desktop_shell_only");
  });

  it("answers both as HTTP does", async () => {
    for (const cookie of [desktopCookie, passwordCookie]) {
      const overSocket = await callOver(cookie, CALLS);
      for (const [index, call] of CALLS.entries()) {
        const overHttp = await t.app.request(call.path, { headers: { cookie } });
        expect(overSocket[index]!.status, call.path).toBe(overHttp.status);
      }
    }
  });
});
