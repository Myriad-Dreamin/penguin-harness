/**
 * A machine as a `Sys`, over the one ssh session the transport already holds to it.
 *
 * Provider, not a second transport: every word still leaves through `connection.ts` — `exec`
 * rides the session's stdin, `forward` rides its SOCKS port — so the rules that module states
 * (one connection per machine, nothing outside this directory starts ssh) are unchanged. What
 * this adds is the interface every other world speaks: a caller that works against a `Sys`
 * reaches a machine, a sandbox or the host with one code path.
 *
 * It sits beside the host's own provider (`../host.ts`), not under the machine feature that
 * happens to use it most: `HostSys` is the default world, this is another one, and the caller
 * picks a world before it starts working — after that nothing above speaks ssh.
 *
 * The capabilities are the POSIX ones. A Windows remote has no session to build on
 * (connection.ts: cmd.exe holds no shell), so it gets no Sys at all and every caller fails
 * closed with `SYS_CAPABILITY_ABSENT` — the same answer the transport gives today.
 *
 * Two of the three capabilities are translations rather than mechanisms:
 *
 * - `forward`: a loopback listener whose every accepted connection is one `connection.dial`
 *   — one `direct-tcpip` channel inside the session. A caller dials `127.0.0.1:<port>` and
 *   never learns the machine's address.
 * - `exec`: `Sys.exec` is an exact argv with streams, an awaited exit and a kill; an ssh
 *   session carries a COMMAND, whose output arrives whole. A process is therefore started
 *   detached (`setsid`, its own group where the far side has one), its output and exit code
 *   written to files beside a pid file, and this side reads them back — streams while the
 *   process is young, the code when it ends, and `kill` on its group. That is deliberately a
 *   little lossy: the first 15 s of output are streamed, later output stays on the machine's
 *   file, and a far side without `setsid` (macOS) is stopped by parent+child poking rather
 *   than by one group signal.
 * - `fs`: the `FsPort` surface in POSIX commands (`base64`, `dd`, `stat`, `find`,
 *   `readlink`, `mkdir`), with an atomic `cat > tmp && mv` for writes and `copyFile` carrying
 *   this side's bytes. `fetch` is refused by name: a machine has its own network and this
 *   capability exists for the file tools, not for proxying downloads.
 *
 * Paths are shell-words: `$HOME` expands (the layout spells program and data roots that
 * way), `~` does not (inside quotes), and a path carrying `"`, a backtick or `$(` is refused
 * rather than guessed at.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import type {
  Exec,
  ExecExit,
  ExecOptions,
  ExecProcess,
  Forward,
  ForwardedPort,
  Fs,
  FsDirent,
  FsFetchResult,
  FsStat,
  Sys,
} from "@prismshadow/penguin-core/sys";
import type { ExecResult } from "./spawn.js";
import { shQuote } from "./quote.js";

/**
 * What this provider needs of a machine: the transport's words (a command, a command with
 * input) and its one dial. `SshConnection` is the real one; the shape is separate so a
 * test can hand a scripted transport instead of opening ssh.
 */
export interface SshSysTransport {
  exec(command: string): Promise<ExecResult>;
  stream(
    command: string,
    opts: { input: Buffer; onLine?: (line: string) => void; timeoutMs?: number },
  ): Promise<ExecResult>;
  dial(remotePort: number): Promise<net.Socket>;
}

export interface SshSysOptions {
  /**
   * What shell the machine's sshd hands us: `posix` for Linux and macOS, `cmd` for a default
   * Windows OpenSSH install. Only a POSIX one carries a Sys (see the module doc); the provider
   * cares about the shell, not about the operating system's name.
   */
  shell: "posix" | "cmd";
  /** One line per started process, for the caller's log. */
  log?: (line: string) => void;
}

/**
 * The machine as a Sys. A `cmd` shell answers `{}`: a caller that needs anything then fails
 * closed by name, which is the truth — the transport cannot hold a session there.
 */
export function createSshSys(connection: SshSysTransport, opts: SshSysOptions): Sys {
  if (opts.shell === "cmd") return {};
  const log = opts.log ?? ((): void => undefined);
  return {
    fs: sshFs(connection),
    exec: sshExec(connection, log),
    forward: sshForward(connection),
  };
}

/** One command's whole answer, the shape the transport's `exec` returns. */
interface Run {
  code: number;
  output: string;
}

async function run(connection: SshSysTransport, command: string, input?: Buffer): Promise<Run> {
  const result =
    input === undefined
      ? await connection.exec(command)
      : await connection.stream(command, { input });
  return { code: result.code, output: result.stdout };
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A path as a shell word: `$HOME` expands, quotes and substitutions are refused. */
function q(target: string): string {
  if (/["`]/.test(target) || target.includes("$(")) {
    throw new Error(`a remote path this provider will not quote: ${target}`);
  }
  return `"${target}"`;
}

/** The code a file-tool call maps from a failed command, so callers diagnose as on a host. */
function remoteError(what: string, result: Run): Error {
  const said = result.output.trim();
  const error = new Error(`${what}: ${said === "" ? `exit ${result.code}` : said}`) as Error & {
    code?: string;
  };
  error.code = /no such file|not found|cannot access|does not exist/i.test(said)
    ? "ENOENT"
    : /permission denied/i.test(said)
      ? "EACCES"
      : /is a directory/i.test(said)
        ? "EISDIR"
        : "EIO";
  return error;
}

/** A file's text, or null when it is not there. */
async function readText(connection: SshSysTransport, target: string): Promise<string | null> {
  const result = await run(connection, `cat ${q(target)} 2>/dev/null`);
  return result.code === 0 ? result.output : null;
}

function decode(bytes: string): Buffer {
  return Buffer.from(bytes.replace(/\s+/g, ""), "base64");
}

/** Bytes from `offset` to the end; empty when the file is shorter or absent. */
async function readFrom(
  connection: SshSysTransport,
  target: string,
  offset: number,
): Promise<Buffer> {
  const result = await run(
    connection,
    `dd if=${q(target)} bs=1 skip=${offset} 2>/dev/null | base64`,
  );
  return result.code === 0 ? decode(result.output) : Buffer.alloc(0);
}

/**
 * Writes one file atomically (`cat` into a sibling, then rename). `$$` in the temporary name
 * is the far shell's pid — the double quotes `q` adds still expand it.
 */
async function writeBytes(
  connection: SshSysTransport,
  target: string,
  content: Buffer,
  mode?: number,
): Promise<void> {
  const tmp = `${target}.penguin-tmp.$$`;
  let command = `cat > ${q(tmp)} && mv -f ${q(tmp)} ${q(target)}`;
  if (mode !== undefined) command += ` && chmod ${mode.toString(8)} ${q(target)}`;
  const result = await run(connection, command, content);
  if (result.code !== 0) throw remoteError(`write ${target}`, result);
}

/** One path's stat, in GNU or BSD spelling (the far side picks). */
async function statOne(connection: SshSysTransport, target: string): Promise<FsStat> {
  const result = await run(
    connection,
    `if stat -c %s ${q(target)} >/dev/null 2>&1; then stat -c '%s|%a|%F' ${q(target)}; ` +
      `else stat -f '%z|%Lp|%HT' ${q(target)}; fi`,
  );
  if (result.code !== 0) throw remoteError(`stat ${target}`, result);
  const [size, mode, kind] = result.output.trim().split("|");
  const directory = /directory/i.test(kind ?? "");
  return {
    isFile: !directory && /regular|file/i.test(kind ?? ""),
    isDirectory: directory,
    size: Number(size ?? "0"),
    mode: Number.parseInt(mode ?? "", 8) || 0,
  };
}

function sshFs(connection: SshSysTransport): Fs {
  return {
    sandboxed: false,
    async stat(target: string): Promise<FsStat> {
      return statOne(connection, target);
    },
    async readFile(target: string): Promise<Buffer> {
      const result = await run(connection, `base64 < ${q(target)} 2>/dev/null`);
      if (result.code !== 0) throw remoteError(`read ${target}`, result);
      return decode(result.output);
    },
    async readRange(target: string, position: number, length: number): Promise<Buffer> {
      const result = await run(
        connection,
        `dd if=${q(target)} bs=1 skip=${position} count=${length} 2>/dev/null | base64`,
      );
      if (result.code !== 0) throw remoteError(`read ${target}`, result);
      return decode(result.output);
    },
    async readdir(target: string): Promise<FsDirent[]> {
      const result = await run(
        connection,
        `if stat -c %s ${q(target)} >/dev/null 2>&1; ` +
          `then find ${q(target)} -mindepth 1 -maxdepth 1 -exec stat -c '%n|%F' {} +; ` +
          `else find ${q(target)} -mindepth 1 -maxdepth 1 -exec stat -f '%N|%HT' {} +; fi`,
      );
      if (result.code !== 0) throw remoteError(`readdir ${target}`, result);
      return result.output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
        .map((line) => {
          const [name, kind] = line.split("|");
          const directory = /directory/i.test(kind ?? "");
          return {
            name: path.basename(name ?? ""),
            isFile: !directory && /regular|file/i.test(kind ?? ""),
            isDirectory: directory,
          };
        });
    },
    async realpath(target: string): Promise<string> {
      // GNU's `readlink -f`, then BSD `realpath`, then the parent's physical path: macOS
      // ships neither of the first two on every release, and a file's real path there is
      // still its parent's real path plus its name.
      const result = await run(
        connection,
        `if readlink -f ${q(target)} 2>/dev/null; then :; ` +
          `elif realpath ${q(target)} 2>/dev/null; then :; ` +
          `elif [ -e ${q(target)} ]; then ` +
          `printf '%s/%s\\n' "$(cd "$(dirname ${q(target)})" && pwd -P)" "$(basename ${q(target)})"; ` +
          `else echo "no such file or directory: ${target}" >&2; exit 1; fi`,
      );
      if (result.code !== 0) throw remoteError(`realpath ${target}`, result);
      return result.output.trim();
    },
    async readlink(target: string): Promise<string> {
      const result = await run(connection, `readlink ${q(target)}`);
      if (result.code !== 0) throw remoteError(`readlink ${target}`, result);
      return result.output.trim();
    },
    async mkdir(target: string): Promise<void> {
      const result = await run(connection, `mkdir -p ${q(target)}`);
      if (result.code !== 0) throw remoteError(`mkdir ${target}`, result);
    },
    async writeFileAtomic(
      target: string,
      content: Buffer,
      opts: { mode?: number; followSymlinks?: boolean },
    ): Promise<void> {
      // followSymlinks is not honoured: the rename lands on the name, not through a link.
      await writeBytes(connection, target, content, opts.mode);
    },
    async fetch(): Promise<FsFetchResult> {
      const error = new Error(
        "a machine Sys does not fetch URLs: the machine has its own network, and this capability is the file tools'",
      ) as Error & { code?: string };
      error.code = "ENOTSUP";
      throw error;
    },
    async copyFile(source: string, target: string): Promise<void> {
      const bytes = await fs.readFile(source);
      await writeBytes(connection, target, bytes);
    },
  };
}

/** The longest a new process's output is streamed here; after that it stays on the machine. */
const STREAM_WINDOW_MS = 15_000;
/** How many pid/mode reads a start may take before it is declared pid-less. */
const PID_WAIT_MS = 3_000;

function sshExec(connection: SshSysTransport, log: (line: string) => void): Exec {
  return {
    async exec(argv: readonly string[], options: ExecOptions = {}): Promise<ExecProcess> {
      if (argv.length === 0) throw new Error("exec needs a program and its argv");
      const dir = `\${TMPDIR:-/tmp}/penguin-sys-${randomBytes(8).toString("hex")}`;
      // The environment is exported INSIDE the inner script: a `K=V` prefix in front of the
      // `if` below would be a shell assignment before a reserved word, which is a syntax
      // error rather than an environment.
      const inner = [
        `echo $$ > "${dir}/pid"`,
        ...Object.entries(options.env ?? {}).map(
          ([key, value]) => `export ${key}=${shQuote(value)}`,
        ),
        `${argv.map(shQuote).join(" ")} > "${dir}/out" 2>&1`,
        `printf '%s' $? > "${dir}/code"`,
      ].join("; ");
      const cd = options.cwd === undefined ? "" : `cd ${q(options.cwd)} && `;
      const start = [
        `mkdir -p "${dir}" &&`,
        cd,
        `if command -v setsid >/dev/null 2>&1; then`,
        `echo setsid > "${dir}/mode";`,
        `setsid sh -c ${shQuote(inner)} >/dev/null 2>&1 < /dev/null &`,
        `else`,
        `echo plain > "${dir}/mode";`,
        `sh -c ${shQuote(inner)} >/dev/null 2>&1 < /dev/null &`,
        `fi;`,
        `echo $!`,
      ].join(" ");
      const started = await run(connection, start);
      if (started.code !== 0) {
        throw new Error(
          `the machine could not start ${argv[0]}: ${started.output.trim() || `exit ${started.code}`}`,
        );
      }
      const pid = await waitForPid(connection, dir);
      if (pid === null) {
        throw new Error(
          `the machine started ${argv[0]} without a pid: ${started.output.trim() || "no output"}`,
        );
      }
      const grouped = (await readText(connection, `${dir}/mode`))?.trim() === "setsid";
      log(`[ssh-sys] started ${argv[0]} (pid ${pid}${grouped ? "" : ", without setsid"})`);
      const process = new SshProcess(connection, pid, dir, grouped);
      // `ExecOptions.signal`: an aborted run is killed, and its exit settles as any kill's
      // does. The listener goes when the process does, so a long-lived caller's signal does
      // not accumulate one per run.
      if (options.signal !== undefined) {
        const signal = options.signal;
        if (signal.aborted) process.kill();
        else {
          const onAbort = (): void => process.kill();
          signal.addEventListener("abort", onAbort, { once: true });
          void process.exit.finally(() => signal.removeEventListener("abort", onAbort));
        }
      }
      return process;
    },
  };
}

async function waitForPid(connection: SshSysTransport, dir: string): Promise<number | null> {
  const deadline = Date.now() + PID_WAIT_MS;
  for (;;) {
    const text = (await readText(connection, `${dir}/pid`))?.trim();
    if (text !== undefined && /^\d+$/.test(text)) return Number(text);
    if (Date.now() >= deadline) return null;
    await delay(100);
  }
}

/** One detached process: output read back while young, exit from its code file. */
class SshProcess implements ExecProcess {
  readonly stdout: AsyncIterable<Buffer>;
  readonly stderr: AsyncIterable<Buffer> = (async function* () {
    // The one session merges both streams into the file stdout reads back.
  })();
  readonly exit: Promise<ExecExit>;
  #ended = false;
  #signal: string | null = null;

  constructor(
    private readonly connection: SshSysTransport,
    readonly pid: number,
    private readonly dir: string,
    private readonly grouped: boolean,
  ) {
    this.exit = this.#wait();
    this.stdout = this.#stream();
  }

  async #wait(): Promise<ExecExit> {
    const started = Date.now();
    for (;;) {
      const code = (await readText(this.connection, `${this.dir}/code`))?.trim();
      if (code !== undefined && /^\d+$/.test(code)) {
        this.#ended = true;
        return { code: Number(code), signal: null };
      }
      const alive = await this.#alive();
      if (!alive) {
        this.#ended = true;
        return { code: null, signal: this.#signal ?? "TERM" };
      }
      const age = Date.now() - started;
      await delay(age < 15_000 ? 250 : age < 300_000 ? 2_000 : 10_000);
    }
  }

  async #alive(): Promise<boolean> {
    const result = await run(
      this.connection,
      `kill -0 ${this.pid} 2>/dev/null && echo alive || true`,
    );
    return result.output.trim() === "alive";
  }

  async *#stream(): AsyncIterable<Buffer> {
    let offset = 0;
    const started = Date.now();
    while (!this.#ended && Date.now() - started < STREAM_WINDOW_MS) {
      const chunk = await readFrom(this.connection, `${this.dir}/out`, offset);
      if (chunk.length > 0) {
        offset += chunk.length;
        yield chunk;
      }
      await delay(250);
    }
  }

  kill(signal = "TERM"): void {
    const name = /^[A-Z]+$/.test(signal) ? signal : "TERM";
    this.#signal = name;
    const command = this.grouped
      ? `kill -${name} -${this.pid} 2>/dev/null || kill -${name} ${this.pid} 2>/dev/null || true`
      : `pkill -${name} -P ${this.pid} 2>/dev/null; kill -${name} ${this.pid} 2>/dev/null || true`;
    void run(this.connection, command);
  }
}

function sshForward(connection: SshSysTransport): Forward {
  return {
    async forwardPort(port: number): Promise<ForwardedPort> {
      const live = new Set<net.Socket>();
      const server = net.createServer((socket) => {
        live.add(socket);
        socket.once("close", () => live.delete(socket));
        socket.on("error", () => socket.destroy());
        connection.dial(port).then(
          (remote) => {
            // The listener may have closed while the dial was in flight: that connection
            // belongs to a forward nobody can use any more, so it is dropped rather than
            // left open with no reader on either end.
            if (socket.destroyed) {
              remote.destroy();
              return;
            }
            remote.on("error", () => socket.destroy());
            remote.once("close", () => socket.destroy());
            socket.once("close", () => remote.destroy());
            socket.pipe(remote);
            remote.pipe(socket);
          },
          () => socket.destroy(),
        );
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("the forward did not bind a loopback port");
      }
      return {
        host: "127.0.0.1",
        port: address.port,
        close: async (): Promise<void> => {
          for (const socket of live) socket.destroy();
          await new Promise<void>((resolve) => server.close(() => resolve()));
        },
      };
    },
  };
}
