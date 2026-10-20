/**
 * Installing a Penguin server onto a Sys, through the HMR bootstrap.
 *
 * The order is the whole design (see the bootstrap's module doc for why):
 *
 * 0. the Sys is given — a host, or a machine reached over ssh (a provider's job to build);
 * 1. its `exec` starts processes there;
 * 2. its `node` (the installed runtime's, or the host's own) runs what this lays down;
 * 3. the single-file HMR server is copied into the data root;
 * 4. started; it announces a port;
 * 5. `sys.forward` makes that port reachable from here (identity on a host, a tunnel for a
 *    machine — the provider's business, invisible here);
 * 6. an `HmrLink` opens the upgrade stream through that forward;
 * 7. the version is pushed as raw parts (platform, CLI, web dist, assets — plugins and
 *    node-pty among them), deduplicated against what the store already holds;
 * 8. the bootstrap is stopped and the installed server is started; its first boot restores
 *    the version just committed.
 *
 * Nothing about the target's shell, paths or address leaks into this file: steps 0–2 are
 * the caller's (a machine provider knows its layout, a host knows `process.execPath`).
 * What this adds is the one sequence that must not be re-derived: a version lands BEFORE
 * the server that would serve the push ever runs, which is what makes node-pty and the
 * plugin library unnecessary on a first start.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ExecExit, ExecProcess, ForwardedPort, Fs, Sys } from "@prismshadow/penguin-core/sys";
import { sysCapabilityError } from "@prismshadow/penguin-core/sys";
import type { InstallOutcome } from "@prismshadow/penguin-hmr";
import { HMR_STREAM_PATH, HmrLink, versionPartsFromBody } from "../hmr/stream.js";

export interface InstallOverSysOptions {
  /** The world to install onto. */
  sys: Sys;
  /**
   * The Node that runs the bootstrap and then the server, on that Sys: the host's own
   * `process.execPath` there, or the runtime an installed harness carries
   * (`<program>/node/bin/node`).
   */
  nodePath: string;
  /** The installed program's server entry on that Sys (`<program>/lib/dist/server.js`). */
  entry: string;
  /** The data root there (the server's `PENGUIN_HOME`). */
  dataRoot: string;
  /** This side's single-file HMR server (`hmr-server.mjs`). */
  bootstrap: string;
  /** This side's gzipped version body — what `deploy.mjs --out` writes. */
  version: string;
  /** The port the server binds (0 = the OS picks it; its announcement is read back). */
  port?: number;
  /** Extra environment for the server (a profile, a web dist override, …). */
  env?: Record<string, string>;
  /** One line per step, as it happens. */
  log?: (line: string) => void;
  /** How long each wait may take (the bootstrap's port, the push, the server's port). */
  timeoutMs?: number;
}

/** The server this installed, as its caller reaches it. */
export interface InstalledServer {
  /** The server process on that Sys. */
  process: ExecProcess;
  /** The port the server announced. */
  port: number;
  /** The version the push committed. */
  version: InstallOutcome;
  /** Stops the server (SIGTERM, then the provider's own kill path) and waits for it. */
  stop(): Promise<void>;
}

/** What a process's output looked like, kept for the error a failed wait throws. */
interface Tail {
  stdout: string;
  stderr: string;
}

/** A running drain: the tail is filled as output arrives, `done` settles when both streams end. */
interface Drain {
  readonly tail: Tail;
  readonly done: Promise<void>;
}

const MAX_TAIL_LINES = 40;

/** Drains a process's streams into the caller's log, keeping the last lines for errors. */
function drain(process: ExecProcess, log: (line: string) => void): Drain {
  const tail: Tail = { stdout: "", stderr: "" };
  const keep = (current: string, chunk: string): string => {
    const lines = `${current}${chunk}`.split("\n");
    return lines.length > MAX_TAIL_LINES
      ? lines.slice(-MAX_TAIL_LINES).join("\n")
      : lines.join("\n");
  };
  const pump = async (stream: AsyncIterable<Buffer>, which: "stdout" | "stderr"): Promise<void> => {
    try {
      for await (const chunk of stream) {
        const text = chunk.toString("utf8");
        tail[which] = keep(tail[which], text);
        for (const line of text.split("\n")) if (line !== "") log(`[${which}] ${line}`);
      }
    } catch {
      // A stream that ends in an error is still drained; the tail is what matters.
    }
  };
  const done = Promise.all([pump(process.stdout, "stdout"), pump(process.stderr, "stderr")]).then(
    () => undefined,
  );
  return { tail, done };
}

const lastWords = (tail: Tail): string =>
  [...tail.stdout.split("\n"), ...tail.stderr.split("\n")]
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(-12)
    .join(" | ") || "it said nothing";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits until `file` holds a port the program announced. A process that ends first fails
 * the wait with its own last words — a broken install reads as what it printed, not as a
 * timeout.
 */
async function waitForPort(
  files: Fs,
  file: string,
  process: ExecProcess,
  drained: Drain,
  timeoutMs: number,
  what: string,
): Promise<number> {
  // A holder rather than a plain `let`: the process settles inside a callback, and a `let`
  // assigned only there narrows to `never` at the check below.
  const ended: { reason: { exit: ExecExit } | { error: Error } | null } = { reason: null };
  void process.exit.then(
    (exit) => {
      ended.reason = { exit };
    },
    (error: unknown) => {
      ended.reason = { error: error instanceof Error ? error : new Error(String(error)) };
    },
  );
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const reason = ended.reason;
    if (reason !== null) {
      await Promise.race([drained.done, delay(2000)]);
      const how =
        "exit" in reason
          ? `exited before announcing its port (code ${reason.exit.code}, signal ${reason.exit.signal})`
          : `failed to start (${reason.error.message})`;
      throw new Error(`${what} ${how}: ${lastWords(drained.tail)}`);
    }
    try {
      const text = (await files.readFile(file)).toString("utf8").trim();
      const port = Number(text);
      if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
    } catch {
      // Not written yet.
    }
    if (Date.now() >= deadline) {
      process.kill();
      await Promise.race([drained.done, delay(2000)]);
      throw new Error(
        `${what} did not announce a port within ${timeoutMs}ms: ${lastWords(drained.tail)}`,
      );
    }
    await delay(100);
  }
}

/**
 * Runs the whole sequence (see the module doc) and hands back the running server. A failure
 * at any step stops whatever it started — a bootstrap left listening or a server half up is
 * worse than the error, because the next attempt then finds the port and the data root in a
 * state nobody described.
 */
export async function installOverSys(options: InstallOverSysOptions): Promise<InstalledServer> {
  const { sys } = options;
  if (sys.fs === undefined) throw sysCapabilityError("installOverSys", "fs");
  if (sys.exec === undefined) throw sysCapabilityError("installOverSys", "exec");
  if (sys.forward === undefined) throw sysCapabilityError("installOverSys", "forward");
  const files = sys.fs;
  const runner = sys.exec;
  const forwarder = sys.forward;
  const log = options.log ?? ((): void => undefined);
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;

  const hmrDir = path.join(options.dataRoot, "hmr");
  const bootstrapEntry = path.join(hmrDir, "hmr-server.mjs");
  const bootstrapPortFile = path.join(hmrDir, "bootstrap-port");
  const serverPortFile = path.join(options.dataRoot, "server-port");
  const token = randomBytes(32).toString("base64url");

  let bootstrap: ExecProcess | null = null;
  let forward: ForwardedPort | null = null;
  let server: ExecProcess | null = null;
  try {
    await files.mkdir(hmrDir);
    await files.copyFile(options.bootstrap, bootstrapEntry);
    // A previous announcement must never pass for this run's: an empty file reads as none.
    await files.writeFileAtomic(bootstrapPortFile, Buffer.alloc(0), {});
    log(`laid the HMR bootstrap at ${bootstrapEntry}`);

    bootstrap = await runner.exec([options.nodePath, bootstrapEntry], {
      cwd: options.dataRoot,
      env: {
        PENGUIN_HOME: options.dataRoot,
        PENGUIN_HMR_TOKEN: token,
        PENGUIN_HMR_PORT_FILE: bootstrapPortFile,
      },
    });
    const bootstrapTail = drain(bootstrap, log);
    const bootstrapPort = await waitForPort(
      files,
      bootstrapPortFile,
      bootstrap,
      bootstrapTail,
      timeoutMs,
      "the HMR bootstrap",
    );
    log(`the HMR bootstrap listens on ${bootstrapPort}`);

    forward = await forwarder.forwardPort(bootstrapPort);
    log(`forwarded ${forward.host}:${forward.port} to the bootstrap`);
    const link = new HmrLink({
      url: `ws://${forward.host}:${forward.port}${HMR_STREAM_PATH}`,
      token,
      timeoutMs,
    });
    const parts = versionPartsFromBody(await fs.readFile(options.version));
    const version = await link.push(parts, (progress) =>
      log(`pushed ${progress.part} (${progress.done}/${progress.total})`),
    );
    log(
      `the store committed ${version.impl} (web ${version.web.rev}, persisted ${version.persisted})`,
    );

    // The bootstrap's job is done: the version is committed, and the port it held is about
    // to be the server's (the caller asked for it; 0 lets the OS pick again).
    await forward.close();
    forward = null;
    bootstrap.kill();
    await bootstrap.exit.catch(() => undefined);
    bootstrap = null;

    await files.writeFileAtomic(serverPortFile, Buffer.alloc(0), {});
    server = await runner.exec([options.nodePath, options.entry], {
      cwd: options.dataRoot,
      env: {
        PENGUIN_HOME: options.dataRoot,
        PENGUIN_PORT_FILE: serverPortFile,
        HOST: "127.0.0.1",
        PORT: String(options.port ?? 0),
        ...(options.env ?? {}),
      },
    });
    const serverTail = drain(server, log);
    const port = await waitForPort(
      files,
      serverPortFile,
      server,
      serverTail,
      timeoutMs,
      "the server",
    );
    log(`the server listens on ${port}`);
    const running = server;
    return {
      process: running,
      port,
      version,
      stop: async () => {
        running.kill();
        await running.exit.catch(() => undefined);
      },
    };
  } catch (err) {
    if (forward !== null) await forward.close().catch(() => undefined);
    bootstrap?.kill();
    server?.kill();
    throw err;
  }
}
