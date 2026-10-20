/**
 * Running a PenguinHarness server program on a Sys, and getting at the server once it is up.
 *
 * The program is laid into the world with the Sys's own file capability (`sys.fs.copyFile`)
 * rather than by a path the world is asked to reach — a caller hands its build output
 * (a server bundle, a native module, a web dist) over and the provider carries it. It then
 * runs as one argv under the environment the server's entry point reads (see
 * `src/config.ts`): HOST, PORT, PENGUIN_HOME and PENGUIN_PORT_FILE. The port announcement
 * is the last step of that server's startup, so a port read from the file means the App is
 * up; PORT may be 0, and the bound number is then the one the announcement carries.
 *
 * What comes back is the server's shell on that world: one command at a time with the data
 * root as PENGUIN_HOME, and the one install path this story needs — a server plugin,
 * installed by the world's own `penguin` CLI over the server's loopback address. The CLI
 * needs no password there: the server wrote the local API token into the data root at boot
 * (`<root>/api-token`, admin authority for whoever can read the root), which is exactly the
 * credential the CLI already uses on any host. The server's own npm runs in that shell's
 * environment: a world whose HOME is read-only needs `npm_config_cache` (and whatever else
 * npm wants writable) among `opts.env`, and a program that includes the `package.json` and
 * plugin packages a packaged app carries gives the server the library it resolves at boot.
 */
import path from "node:path";
import type { ExecExit, ExecOptions, ExecProcess, Fs, Sys } from "@prismshadow/penguin-core/sys";
import { sysCapabilityError } from "@prismshadow/penguin-core/sys";
import type { InstalledPluginsResponse } from "../api/types.js";

/** One file or directory laid into a Sys before the server starts. */
export interface ServerProgramItem {
  /** The file or directory where the caller has it. */
  source: string;
  /** Where it lands on that Sys. */
  target: string;
}

/** What {@link runServer} needs to lay a server down and start it. */
export interface RunServerOptions {
  /** The server program's entry file on that Sys; node runs it. */
  entry: string;
  /** The data root on that Sys: PENGUIN_HOME, and where the port announcement is written. */
  dataRoot: string;
  /** Files and directories copied into the world before the server starts; directories recurse. */
  program?: readonly ServerProgramItem[];
  /** The node program on that Sys; defaults to the executable running this process. */
  node?: string;
  /** The `penguin` CLI bundle on that Sys — what {@link ServerRun.installPlugin} drives. */
  cli?: string;
  /** Entries laid over the environment runServer composes (HOST/PORT/PENGUIN_HOME/PENGUIN_PORT_FILE). */
  env?: Readonly<Record<string, string>>;
  /** Where the announcement goes; defaults to `<dataRoot>/server-port`. */
  portFile?: string;
  /** How long the announcement may take, in milliseconds. Default 30 seconds. */
  timeoutMs?: number;
  /** One chunk of the server's output as it arrives (the last lines are kept regardless, for errors). */
  log?: (chunk: string, stream: "stdout" | "stderr") => void;
}

/** A running server on one Sys, as its caller reaches it. */
export interface ServerRun {
  /** The port the server announced: the requested one, or the one it picked when asked for 0. */
  readonly port: number;
  /** The server process itself, for a caller that needs its streams or its exit. */
  readonly process: ExecProcess;
  /** One command on that world, with the server's data root as PENGUIN_HOME and default cwd. */
  exec(argv: readonly string[], opts?: ExecOptions): Promise<ExecProcess>;
  /** Installs one plugin through the world's CLI; answers what the server says landed. */
  installPlugin(
    specifier: string,
    opts?: { projectId?: string },
  ): Promise<InstalledPluginsResponse>;
  /** Stops the server: SIGTERM, join its exit, and SIGKILL only after a grace period. Idempotent. */
  stop(): Promise<void>;
}

/** How much of the server's output the handle keeps for its failure messages. */
const TAIL_BYTES = 64 * 1024;

/** The port an announcement file names: a decimal port on the first line, or null. */
export function parsePortAnnouncement(content: Buffer): number | null {
  const match = /^(\d{1,5})\s*$/.exec(content.toString("utf8").trim());
  if (match === null) return null;
  const port = Number(match[1]);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The tail kept from one output stream, bounded. */
function keepTail(previous: string, chunk: string): string {
  const next = previous + chunk;
  return next.length > TAIL_BYTES ? next.slice(next.length - TAIL_BYTES) : next;
}

/** The server's last words, for an error nobody else will read. */
function lastWords(tail: { stdout: string; stderr: string }): string {
  const text = (tail.stderr.trim() || tail.stdout.trim()).slice(-2_000);
  return text === "" ? "(no output)" : text;
}

/**
 * Lays `source` down at `target` on `sys`: a file copied, a directory recreated with its
 * entries in a stable order. Anything else (a device, a symlink) is refused rather than
 * silently skipped — a half-copied program would fail later, somewhere less clear.
 */
async function layTree(files: Fs, source: string, target: string): Promise<void> {
  const stat = await files.stat(source);
  if (stat.isFile) {
    await files.mkdir(path.dirname(target));
    await files.copyFile(source, target);
    return;
  }
  if (!stat.isDirectory) throw new Error(`runServer can lay down a file or a directory: ${source}`);
  await files.mkdir(target);
  const entries = await files.readdir(source);
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    await layTree(files, path.join(source, entry.name), path.join(target, entry.name));
  }
}

/** Drains one stream, handing every chunk to `log` and keeping a bounded tail. */
async function drain(
  stream: AsyncIterable<Buffer>,
  name: "stdout" | "stderr",
  tail: { stdout: string; stderr: string },
  log?: RunServerOptions["log"],
): Promise<void> {
  try {
    for await (const chunk of stream) {
      const text = chunk.toString("utf8");
      log?.(text, name);
      tail[name] = keepTail(tail[name], text);
    }
  } catch {
    // A stream torn down by the process's end is that end's business, not a second error.
  }
}

/** Collects one command's output and exit. */
async function collect(
  proc: ExecProcess,
): Promise<{ stdout: string; stderr: string; exit: ExecExit }> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const [exit] = await Promise.all([
    proc.exit,
    (async () => {
      for await (const chunk of proc.stdout) stdout.push(chunk);
    })(),
    (async () => {
      for await (const chunk of proc.stderr) stderr.push(chunk);
    })(),
  ]);
  return {
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
    exit,
  };
}

/**
 * Starts `opts.entry` on `sys` and resolves once the server announces its port (the last
 * step of its startup). `port` is the number to ask for; `0` lets the OS pick, and the
 * returned {@link ServerRun.port} is then the real one. A failed start kills the process
 * and rejects with the server's own last output.
 */
export async function runServer(
  sys: Sys,
  port: number,
  opts: RunServerOptions,
): Promise<ServerRun> {
  const files = sys.fs;
  if (files === undefined) throw sysCapabilityError("runServer", "fs");
  const runner = sys.exec;
  if (runner === undefined) throw sysCapabilityError("runServer", "exec");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`bad port ${port}`);
  if (opts.entry.trim() === "") throw new Error("runServer needs the server program's entry");
  if (opts.dataRoot.trim() === "") throw new Error("runServer needs the server's data root");
  const node = opts.node ?? process.execPath;
  const dataRoot = opts.dataRoot;
  const portFile = opts.portFile ?? path.join(dataRoot, "server-port");
  await files.mkdir(dataRoot);
  await files.mkdir(path.dirname(portFile));
  for (const item of opts.program ?? []) await layTree(files, item.source, item.target);
  // A previous announcement on this root must never pass for this run's: the file starts
  // empty, and only a port written into it (the server's own atomic replacement) counts.
  await files.writeFileAtomic(portFile, Buffer.alloc(0), {});

  const serverEnv: Record<string, string> = {
    HOST: "127.0.0.1",
    PORT: String(port),
    PENGUIN_HOME: dataRoot,
    PENGUIN_PORT_FILE: portFile,
    ...opts.env,
  };
  let server: ExecProcess;
  try {
    server = await runner.exec([node, opts.entry], { cwd: dataRoot, env: serverEnv });
  } catch (err) {
    throw new Error(
      `runServer could not start ${opts.entry}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const tail = { stdout: "", stderr: "" };
  const drained = Promise.all([
    drain(server.stdout, "stdout", tail, opts.log),
    drain(server.stderr, "stderr", tail, opts.log),
  ]);
  /** How the server ended on its own, once it has. */
  const ending: { value: { exit: ExecExit } | { error: Error } | null } = { value: null };
  void server.exit.then(
    (exit) => {
      ending.value = { exit };
    },
    (error: unknown) => {
      ending.value = { error: error instanceof Error ? error : new Error(String(error)) };
    },
  );

  const timeoutMs = opts.timeoutMs ?? 30_000;
  const deadline = Date.now() + timeoutMs;
  let bound: number | null = null;
  for (;;) {
    if (ending.value !== null) {
      await drained;
      const how =
        "exit" in ending.value
          ? `exited before announcing its port (code ${ending.value.exit.code}, signal ${ending.value.exit.signal})`
          : `failed to start before announcing its port (${ending.value.error.message})`;
      throw new Error(`the server ${how}: ${lastWords(tail)}`);
    }
    try {
      bound = parsePortAnnouncement(await files.readFile(portFile));
    } catch {
      // Not written yet.
    }
    if (bound !== null) break;
    if (Date.now() >= deadline) {
      server.kill();
      await Promise.race([drained, delay(2_000)]);
      throw new Error(
        `the server did not announce a port within ${timeoutMs}ms: ${lastWords(tail)}`,
      );
    }
    await delay(100);
  }

  // The server's shell: the same world, its data root as home, and none of the server's own
  // PORT/HOST announcement variables leaking into commands that are not the server.
  const shellEnv: Record<string, string> = { PENGUIN_HOME: dataRoot, ...opts.env };
  const execOnWorld = (argv: readonly string[], execOpts: ExecOptions = {}): Promise<ExecProcess> =>
    runner.exec(argv, {
      cwd: dataRoot,
      ...execOpts,
      env: { ...shellEnv, ...execOpts.env },
    });

  let stopping: Promise<void> | null = null;
  return {
    port: bound,
    process: server,
    exec: execOnWorld,
    async installPlugin(
      specifier: string,
      installOpts: { projectId?: string } = {},
    ): Promise<InstalledPluginsResponse> {
      if (opts.cli === undefined) {
        throw new Error(
          "installPlugin needs the world's penguin CLI: pass `cli` to runServer when the handle is created",
        );
      }
      if (specifier.trim() === "") throw new Error("installPlugin needs a plugin specifier");
      const answer = await collect(
        await execOnWorld([
          node,
          opts.cli,
          "plugin",
          "install",
          specifier,
          "--json",
          "--server",
          `http://localhost:${bound}`,
          ...(installOpts.projectId !== undefined ? ["--project-id", installOpts.projectId] : []),
        ]),
      );
      if (answer.exit.code !== 0) {
        throw new Error(
          `installing ${specifier} exited ${answer.exit.code ?? answer.exit.signal}: ${answer.stderr.trim().slice(-2_000)}`,
        );
      }
      try {
        return JSON.parse(answer.stdout) as InstalledPluginsResponse;
      } catch {
        throw new Error(
          `installing ${specifier} printed no JSON: ${answer.stdout.trim().slice(0, 500)}`,
        );
      }
    },
    stop(): Promise<void> {
      stopping ??= (async (): Promise<void> => {
        server.kill("SIGTERM");
        const exited = await Promise.race([
          server.exit.then(
            () => true,
            () => true,
          ),
          delay(5_000).then(() => false),
        ]);
        if (!exited) {
          server.kill("SIGKILL");
          await Promise.race([
            server.exit.then(
              () => undefined,
              () => undefined,
            ),
            delay(2_000),
          ]);
        }
        await Promise.race([drained, delay(2_000)]);
      })();
      return stopping;
    },
  };
}
