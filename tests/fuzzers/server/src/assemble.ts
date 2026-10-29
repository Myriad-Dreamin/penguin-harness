/**
 * Demo assembly — DESIGN.md §4.4's channel B, in the repo's own test shape
 * (packages/server/test/helpers.ts's createTestApp):
 *
 *   bootAppDeps(config, replacements) → authService.seedAdmin() → createApp(boot)
 *
 * with the demo's mocks mounted through existing seams only:
 *   - FuzzerClock replaces SystemClock through the replacements array;
 *   - SQLite stays the real engine, redirected to a temp file via config.dbPath (§4.3
 *     option 1), so a second, read-only connection can introspect it (§6.1 R-5);
 *   - the SessionLoader is the production one, so every Session — created or loaded — runs the
 *     real Agent, ContextEngine and Environment. The only mock left is the model client
 *     (stubs/mmsp), which is where a mocked model belongs: one seam, below the whole runtime.
 *
 * The loopback listener is the same @hono/node-server serve() the production entry uses —
 * bound to an ephemeral port in-process. The CLI leg answers its own requests from the app in
 * memory (cli/src/fetch-shim.ts) because a live socket would keep the harness's clock from
 * moving; the listener stays the way in for anything that reaches for a socket instead.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ServerConfig } from "../../../../packages/server/src/config.js";
import { bootAppDeps, createApp } from "../../../../packages/server/src/app.js";
import { ConsoleLog, SystemClock } from "../../../../packages/server/src/hmr/capabilities.js";
import { DefaultTitleGenerators } from "../../../../packages/server/src/runtime/session-manager.js";
import { ShippedBuiltinBenchmarkSeeds } from "../../../../packages/server/src/services/project-service.js";
import { ScryptHasher, hashPassword } from "../../../../packages/server/src/auth/password.js";
import type { ServerBoot } from "../../../../packages/server/src/app.js";
import type { Hono } from "hono";
import type { AppEnv } from "../../../../packages/server/src/auth/middleware.js";
import { FuzzerClock } from "./fuzzer-clock.js";
import { rebaseDatabase } from "./replay.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A finding kit's state, planted into the rig this assembly is about to boot: the database is the
 * authority, the file tree beside it is the Trace and workspace files it refers to.
 */
export interface DemoSeed {
  /** The kit directory: `web.db` (+ `-wal`) and, from kits that carry it, `root/`. */
  dir: string;
  /** The data root the kit was taken from — every absolute path in the database names it. */
  oldRoot: string;
}

/** What a seeded boot actually planted — the reading a replay report states as evidence. */
export interface SeedReading {
  /** Whether the kit carried a file tree and it was copied in. */
  tree: boolean;
  /** The database was copied; `columns`/`rows` say how much of it named the old root. */
  rebased: { columns: number; rows: number };
}

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
  /** Present only when the rig booted out of a finding kit; a fuzzing run's rig has no seed. */
  seed?: SeedReading;
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

export async function assembleDemo(clock: FuzzerClock, seed?: DemoSeed): Promise<DemoApp> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "penguin-fuzzer-demo-"));
  // Same shape as the probe that proved this boot: PENGUIN_HOME points at the temp root
  // before the platform boots, so every path that resolves through it lands inside the
  // demo's own disposable root.
  process.env.PENGUIN_HOME = root;
  const dbPath = path.join(root, "web.db");
  const seedReading = seed === undefined ? undefined : await plantSeed(root, dbPath, seed);
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
    ...(seedReading === undefined ? {} : { seed: seedReading }),
    async cleanup() {
      await listener.close().catch(() => {});
      boot.hmr.dispose();
      boot.db.close();
      await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    },
  };
}

/**
 * Plant a finding kit into a rig's data root before the platform boots: its file tree, then its
 * database, then every path the database holds rebased onto this root.
 *
 * The rebase is what makes the state usable at all. A Session's `workspace` names the root it was
 * created under, and that root was a temp directory that the rig's own teardown removed: without
 * the rewrite the first tool call either writes into a directory nothing will clean up or fails
 * on one that is gone, and a finding that depends on what the call did becomes unreproducible for
 * a reason that has nothing to do with the product.
 *
 * `-shm` is deliberately not copied: it is the shared-memory index of the connection that wrote
 * the log, and SQLite rebuilds it from the `-wal` it finds. Copying a stale one only invites the
 * rebuild to trust it.
 */
async function plantSeed(root: string, dbPath: string, seed: DemoSeed): Promise<SeedReading> {
  const exists = async (file: string): Promise<boolean> => {
    try {
      await fs.stat(file);
      return true;
    } catch {
      return false;
    }
  };
  const tree = path.join(seed.dir, "root");
  const planted = await exists(tree);
  if (planted) await fs.cp(tree, root, { recursive: true, force: true });
  const from = path.join(seed.dir, "web.db");
  if (!(await exists(from))) {
    throw new Error(
      `the kit at ${seed.dir} carries no web.db — its state cannot be replayed ` +
        `(an input-only kit is run with --replay after removing nothing: see replay.ts)`,
    );
  }
  await fs.copyFile(from, dbPath);
  if (await exists(`${from}-wal`)) await fs.copyFile(`${from}-wal`, `${dbPath}-wal`);
  return { tree: planted, rebased: rebaseDatabase(dbPath, seed.oldRoot, root) };
}
