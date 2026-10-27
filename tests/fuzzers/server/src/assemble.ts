/**
 * Demo assembly — DESIGN.md §4.4's channel B, in the repo's own test shape
 * (packages/server/test/helpers.ts's createTestApp):
 *
 *   bootAppDeps(config, replacements) → authService.seedAdmin() → createApp(boot)
 *
 * with the demo's three mocks mounted through existing seams only:
 *   - FuzzerClock replaces SystemClock through the replacements array;
 *   - the FuzzerSessionLoader replaces CoreSessionLoaders the same way (its create() is the
 *     documented "tests inject" point);
 *   - SQLite stays the real engine, redirected to a temp file via config.dbPath (§4.3
 *     option 1), so a second, read-only connection can introspect it (§6.1 R-5).
 *
 * The loopback listener is the same @hono/node-server serve() the production entry uses —
 * bound to an ephemeral port in-process, so the CLI section exercises the real HTTP
 * serialization path (fetch → loopback → Hono) without any external listener.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ServerConfig } from "../../../../packages/server/src/config.js";
import { bootAppDeps, createApp } from "../../../../packages/server/src/app.js";
import { ConsoleLog, SystemClock } from "../../../../packages/server/src/hmr/capabilities.js";
import {
  CoreSessionLoaders,
  DefaultTitleGenerators,
} from "../../../../packages/server/src/runtime/session-manager.js";
import { ShippedBuiltinBenchmarkSeeds } from "../../../../packages/server/src/services/project-service.js";
import { ScryptHasher, hashPassword } from "../../../../packages/server/src/auth/password.js";
import type { ServerBoot } from "../../../../packages/server/src/app.js";
import type { Hono } from "hono";
import type { AppEnv } from "../../../../packages/server/src/auth/middleware.js";
import type { SessionLoader } from "../../../../packages/server/src/runtime/session-manager.js";
import { FuzzerClock } from "./fuzzer-clock.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DemoApp {
  boot: ServerBoot;
  app: Hono<AppEnv>;
  root: string;
  dbPath: string;
  clock: FuzzerClock;
  apiToken: string;
  adminPassword: string;
  lines: string[];
  /** The in-process loopback listener serving the same app the API section drives directly. */
  listener: { port: number; close(): Promise<void> };
  cleanup(): Promise<void>;
}

export function demoConfig(root: string, dbPath: string): ServerConfig {
  return {
    root,
    // "localhost", NOT "127.0.0.1": the canonical-host guard (app.ts) hardcodes the loopback
    // App host as "localhost" and treats the other name as the preview host — /api requests
    // arriving addressed to 127.0.0.1 are refused with 401 "not served on the preview host".
    // Every demo client (CLI, SSE fetch) therefore speaks http://localhost:<port>.
    host: "localhost",
    // PORT=0: nothing of the demo listens on a well-known port; the loopback listener below
    // asks the OS for an ephemeral one on its own.
    port: 0,
    dbPath,
    previewOrigin: null,
    penguinGoOrigin: undefined,
    modelscopeBridgeUrl: undefined,
    // Points at a nonexistent directory: static hosting stays disabled.
    webDist: path.join(root, "__no_web_dist__"),
    seedAdminPassword: "penguin-0000",
    authSessionTtlMs: 30 * DAY_MS,
    authSessionRenewMs: 29 * DAY_MS,
    desktopToken: null,
    portFile: null,
    trustProxy: false,
    cliEntry: null,
    // Off: no plugin index fetch (the server's own network line, closed for the demo).
    pluginIndexUrl: null,
  };
}

export async function assembleDemo(loader: SessionLoader, clock: FuzzerClock): Promise<DemoApp> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "penguin-fuzzer-demo-"));
  // Same shape as the probe that proved this boot: PENGUIN_HOME points at the temp root
  // before the platform boots, so every path that resolves through it lands inside the
  // demo's own disposable root.
  process.env.PENGUIN_HOME = root;
  const dbPath = path.join(root, "web.db");
  const config = demoConfig(root, dbPath);
  const lines: string[] = [];
  const log = (line: string): void => {
    lines.push(line);
  };

  const boot = await bootAppDeps(config, [
    [ConsoleLog, { line: log }],
    [SystemClock, { now: () => clock.now() }],
    [ShippedBuiltinBenchmarkSeeds, { benchmarks: [] }],
    [ScryptHasher, { hash: (password: string) => hashPassword(password, 2) }],
    [CoreSessionLoaders, { create: () => loader }],
    [DefaultTitleGenerators, { create: () => ({ maybeGenerate: () => {} }) }],
  ]);

  const auth = boot.tree.api("IdentityModule", "Auth") as {
    seedAdmin(): Promise<void>;
  };
  await auth.seedAdmin();

  const app = createApp(boot);

  // The same @hono/node-server serve() the production entry uses, resolved relative from
  // this file (the stale root node_modules does not carry the package; the server's own does).
  const { serve } =
    await import("../../../../packages/server/node_modules/@hono/node-server/dist/index.mjs");
  const listener = await new Promise<{ port: number; close(): Promise<void> }>((resolve) => {
    const server = serve(
      {
        // `env` carries the Node request: app.ts sets an event stream's idle timeout on its socket.
        fetch: (request: Request, env: unknown) =>
          app.fetch(request, env as never) ?? Promise.resolve(new Response(null)),
        hostname: "localhost",
        port: 0,
      },
      (info: { port: number }) => {
        resolve({
          port: info.port,
          close: () =>
            new Promise<void>((done, fail) => {
              server.close(() => done());
              (server as { closeAllConnections?: () => void }).closeAllConnections?.();
              setTimeout(() => fail(new Error("listener close timed out")), 2000).unref?.();
            }),
        });
      },
    );
  });

  const apiToken = (await fs.readFile(path.join(root, "api-token"), "utf8")).trim();

  return {
    boot,
    app,
    root,
    dbPath,
    clock,
    apiToken,
    adminPassword: "penguin-0000",
    lines,
    listener,
    async cleanup() {
      await listener.close().catch(() => {});
      boot.hmr.dispose();
      boot.db.close();
      await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    },
  };
}
