/**
 * The HMR push as a STREAM: one WebSocket, raw binary parts, a commit as the barrier.
 *
 * Why not `PUT /api/hmr/blobs/:sha` many times: a first install is ~500 files, and every
 * one of those is a request, a handshake and a base64 body. The stream carries the same
 * contents as raw bytes over a single connection — no base64 tax, no per-file round trip —
 * and `ws` frames keep the far side writing while the near side is still sending.
 *
 * The protocol (text frames are control, binary frames are the current part's bytes):
 *
 *   C→S {"t":"probe","shas":[…]}
 *   S→C {"t":"need","shas":[…]}                  only the blobs the store lacks
 *   C→S {"t":"part","kind":"platform|cli|web|asset","path":"…","exec":false,"sha":"…","size":N}
 *   C→S <binary chunks, exactly N bytes>
 *   C→S {"t":"commit","platform":"<sha>","cli":"<sha>","web":{path:sha…},"assets":{"files":{…},"exec":[…]},"source":{…}}
 *   S→C {"t":"ok","result":{…}} | {"t":"error","message":"…"}
 *
 * There is no per-part answer: WebSocket preserves order, so `commit` IS the barrier, and
 * a part that fails to land makes the commit fail. The client only paces itself against the
 * socket's buffered bytes, which is what keeps memory bounded without inventing acks.
 *
 * The server half is attached to a plain `node:http` server (bootstrap.ts); the client half
 * is what the installer runs through a `sys.forward` endpoint (sys/install.ts). Both sides
 * live in the server package: this package is mechanism-only, and `ws` is a product choice.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { parseUpgradeTarget } from "@prismshadow/penguin-hmr";
import type { GitSource, HmrHost, InstallOutcome } from "@prismshadow/penguin-hmr";

/** Where the stream arrives, beside the HTTP channel's own paths. */
export const HMR_STREAM_PATH = "/api/hmr/stream";

/** One chunk of a part on the wire: large enough to amortise framing, small enough to pace. */
const CHUNK_BYTES = 1 << 20;
/** The socket's buffered bytes: stop sending above HIGH, resume below LOW. */
const HIGH_WATER = 8 << 20;
const LOW_WATER = 2 << 20;
/** One push's whole budget (a slow transoceanic link included). */
const STREAM_TIMEOUT_MS = 10 * 60_000;
/** A client frame is one chunk; control frames are tiny. */
const MAX_FRAME = CHUNK_BYTES * 2;

type PartKind = "platform" | "cli" | "web" | "asset";

interface PartHeader {
  t: "part";
  kind: PartKind;
  path?: string;
  exec?: boolean;
  sha: string;
  size: number;
}

interface CommitMessage {
  t: "commit";
  platform: string;
  cli: string;
  web: Record<string, string>;
  assets?: { files: Record<string, string>; exec?: string[] };
  source?: GitSource | null;
}

interface ProbeMessage {
  t: "probe";
  shas: string[];
}

type ClientMessage = PartHeader | CommitMessage | ProbeMessage;

type ServerMessage =
  | { t: "need"; shas: string[] }
  | { t: "ok"; result: InstallOutcome }
  | { t: "error"; message: string };

/** A version as the client holds it: the deploy body, decoded into raw parts. */
export interface VersionParts {
  platform: string;
  cli: string;
  web: Map<string, Buffer>;
  assets: { files: Map<string, Buffer>; exec: string[] } | null;
  source: GitSource | null;
}

/**
 * The `deploy.mjs --out` body as parts. The file is the one artifact a release build
 * already writes (base64 in a gzip); decoding it here keeps one source of truth for what a
 * version contains, and the wire never sees the base64.
 */
export function versionPartsFromBody(body: Buffer): VersionParts {
  const target = parseUpgradeTarget("application/gzip", body);
  return {
    platform: target.platform,
    cli: target.cli,
    web: new Map(Object.entries(target.web).map(([rel, b64]) => [rel, Buffer.from(b64, "base64")])),
    assets:
      target.assets === undefined
        ? null
        : {
            files: new Map(
              Object.entries(target.assets.files).map(([rel, b64]) => [
                rel,
                Buffer.from(b64, "base64"),
              ]),
            ),
            exec: target.assets.exec ?? [],
          },
    source: target.source ?? null,
  };
}

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

const asBuffer = (data: RawData): Buffer =>
  Buffer.isBuffer(data)
    ? data
    : Array.isArray(data)
      ? Buffer.concat(data)
      : Buffer.from(data as ArrayBuffer);

function tokenMatches(header: string | undefined, token: string): boolean {
  const match = /^Bearer\s+(.+)$/i.exec((header ?? "").trim());
  if (match === null) return false;
  const presented = Buffer.from(match[1]!.trim());
  const expected = Buffer.from(token);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

/**
 * Attaches the stream to a plain HTTP server. The upgrade is refused before a socket is
 * taken (401) and only on the stream path; everything else on the server is the caller's.
 */
export function attachHmrStream(server: HttpServer, host: HmrHost, token: string): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME });
  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    if (pathname !== HMR_STREAM_PATH) {
      socket.destroy();
      return;
    }
    if (!tokenMatches(request.headers.authorization, token)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });
  wss.on("connection", (ws) => {
    new StreamSession(host, ws).attach();
  });
  return wss;
}

/** One connection's state: the part being received, the two ESM sources, and a serial queue. */
class StreamSession {
  private queue: Promise<void> = Promise.resolve();
  private part: { header: PartHeader; chunks: Buffer[]; received: number } | null = null;
  private platform: string | null = null;
  private cli: string | null = null;
  private ended = false;

  constructor(
    private readonly host: HmrHost,
    private readonly ws: WebSocket,
  ) {}

  attach(): void {
    this.ws.on("message", (data, isBinary) => {
      this.queue = this.queue
        .then(() =>
          isBinary ? this.onBytes(asBuffer(data)) : this.onCommand(asBuffer(data).toString("utf8")),
        )
        .catch((err: unknown) => this.fail(err));
    });
    this.ws.on("close", () => {
      this.ended = true;
      this.part = null;
    });
  }

  private async onCommand(text: string): Promise<void> {
    if (this.ended) return;
    if (this.part !== null) {
      throw new Error("a part was still open when the next command arrived");
    }
    let message: ClientMessage;
    try {
      message = JSON.parse(text) as ClientMessage;
    } catch {
      throw new Error("the stream carries JSON control frames");
    }
    if (message.t === "probe") {
      this.send({ t: "need", shas: this.host.missingBlobs(message.shas) });
      return;
    }
    if (message.t === "part") {
      if (typeof message.sha !== "string" || !Number.isInteger(message.size) || message.size < 0) {
        throw new Error("a part names its sha256 and its size in bytes");
      }
      if (
        message.kind !== "platform" &&
        message.kind !== "cli" &&
        message.kind !== "web" &&
        message.kind !== "asset"
      ) {
        throw new Error(`unknown part kind: ${String(message.kind)}`);
      }
      const part = { header: message, chunks: [] as Buffer[], received: 0 };
      if (message.size === 0) {
        await this.finishPart(part);
        return;
      }
      this.part = part;
      return;
    }
    if (message.t === "commit") {
      await this.commit(message);
      return;
    }
    throw new Error(`unknown stream command: ${String((message as { t?: unknown }).t)}`);
  }

  private async onBytes(data: Buffer): Promise<void> {
    const part = this.part;
    if (part === null) throw new Error("bytes arrived with no part open");
    if (part.received + data.length > part.header.size) {
      throw new Error("a part carried more bytes than its header declared");
    }
    part.chunks.push(data);
    part.received += data.length;
    if (part.received < part.header.size) return;
    this.part = null;
    await this.finishPart(part);
  }

  /** One complete part: verify what it says it is, then keep the text or store the bytes. */
  private async finishPart(part: {
    header: PartHeader;
    chunks: Buffer[];
    received: number;
  }): Promise<void> {
    const bytes = Buffer.concat(part.chunks, part.received);
    const sha = sha256(bytes);
    if (sha !== part.header.sha) {
      throw new Error(
        `part ${part.header.kind}${part.header.path === undefined ? "" : ` ${part.header.path}`} ` +
          `hashed to ${sha.slice(0, 12)}, not the ${part.header.sha.slice(0, 12)} it declared`,
      );
    }
    if (part.header.kind === "platform") {
      this.platform = bytes.toString("utf8");
      return;
    }
    if (part.header.kind === "cli") {
      this.cli = bytes.toString("utf8");
      return;
    }
    if (typeof part.header.path !== "string" || part.header.path === "") {
      throw new Error(`${part.header.kind} parts name their relPath`);
    }
    // Content-addressed as it arrives: a re-push of the same native module or plugin file
    // writes nothing, and the commit only names what is already in the store.
    await this.host.storeBlob(bytes);
  }

  private async commit(message: CommitMessage): Promise<void> {
    if (this.platform === null || this.cli === null) {
      throw new Error("commit arrived before the platform and cli bundles");
    }
    if (sha256(Buffer.from(this.platform, "utf8")) !== message.platform) {
      throw new Error("the commit names a platform bundle the stream did not carry");
    }
    if (sha256(Buffer.from(this.cli, "utf8")) !== message.cli) {
      throw new Error("the commit names a cli bundle the stream did not carry");
    }
    const demand = (what: string, sha: string): void => {
      if (this.host.readBlob(sha) === null) {
        throw new Error(`${what} names a blob this store does not hold (${sha.slice(0, 12)})`);
      }
    };
    for (const [rel, sha] of Object.entries(message.web)) demand(`web ${rel}`, sha);
    for (const [rel, sha] of Object.entries(message.assets?.files ?? {}))
      demand(`asset ${rel}`, sha);
    const result = await this.host.install({
      platform: this.platform,
      cli: this.cli,
      web: message.web,
      ...(message.assets === undefined ? {} : { assets: message.assets }),
      source: message.source ?? null,
    });
    this.platform = null;
    this.cli = null;
    this.send({ t: "ok", result });
  }

  private fail(err: unknown): void {
    if (this.ended) return;
    this.part = null;
    this.platform = null;
    this.cli = null;
    this.send({ t: "error", message: err instanceof Error ? err.message : String(err) });
  }

  private send(message: ServerMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }
}

/** One message awaited from the server, and the failure a `{"t":"error"}` becomes. */
class AnswerQueue {
  private readonly ready: ServerMessage[] = [];
  private readonly waiters: Array<{
    resolve: (message: ServerMessage) => void;
    reject: (err: Error) => void;
  }> = [];
  private failure: Error | null = null;

  push(message: ServerMessage): void {
    if (message.t === "error") {
      this.fail(new Error(message.message));
      return;
    }
    const waiter = this.waiters.shift();
    if (waiter !== undefined) waiter.resolve(message);
    else this.ready.push(message);
  }

  fail(err: Error): void {
    this.failure ??= err;
    for (const waiter of this.waiters.splice(0)) waiter.reject(this.failure);
  }

  next(timeoutMs: number, what: string): Promise<ServerMessage> {
    if (this.failure !== null) return Promise.reject(this.failure);
    const queued = this.ready.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`the server did not answer ${what} within ${timeoutMs}ms`)),
        timeoutMs,
      );
      timer.unref?.();
      this.waiters.push({
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }
}

/**
 * The client half: one connection per push, parts paced by the socket's own buffer. The
 * installer reaches it through a `sys.forward` endpoint, so the same code serves the host
 * (the port is already local) and a machine (the port is tunneled back).
 */
export class HmrLink {
  constructor(
    private readonly options: {
      /** ws://host:port/api/hmr/stream, already forwarded to this side. */
      url: string;
      /** The bootstrap's token (PENGUIN_HMR_TOKEN). */
      token: string;
      timeoutMs?: number;
    },
  ) {}

  async push(
    parts: VersionParts,
    onProgress?: (progress: { part: string; done: number; total: number }) => void,
  ): Promise<InstallOutcome> {
    const timeoutMs = this.options.timeoutMs ?? STREAM_TIMEOUT_MS;
    const ws = new WebSocket(this.options.url, {
      headers: { authorization: `Bearer ${this.options.token}` },
    });
    const answers = new AnswerQueue();
    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      try {
        answers.push(JSON.parse(asBuffer(data).toString("utf8")) as ServerMessage);
      } catch {
        answers.fail(new Error("the server answered something that is not a stream message"));
      }
    });
    ws.on("close", () => answers.fail(new Error("the stream closed before the push finished")));
    ws.on("error", (err) => answers.fail(err));
    ws.on("unexpected-response", (_request, response) => {
      answers.fail(
        new Error(`the HMR stream refused the connection (HTTP ${response.statusCode ?? "?"})`),
      );
    });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
      ws.once("unexpected-response", (_request, response) =>
        reject(new Error(`the HMR stream refused the connection (HTTP ${response.statusCode})`)),
      );
    });
    try {
      // What the store already holds crosses nowhere: a re-install is mostly a probe.
      const webShas = new Map([...parts.web].map(([rel, bytes]) => [rel, sha256(bytes)] as const));
      const assetShas = new Map(
        parts.assets === null
          ? []
          : [...parts.assets.files].map(([rel, bytes]) => [rel, sha256(bytes)] as const),
      );
      const platformSha = sha256(Buffer.from(parts.platform, "utf8"));
      const cliSha = sha256(Buffer.from(parts.cli, "utf8"));
      const every = [platformSha, cliSha, ...webShas.values(), ...assetShas.values()];
      ws.send(JSON.stringify({ t: "probe", shas: every }));
      const probed = await answers.next(timeoutMs, "the probe");
      if (probed.t !== "need") throw new Error("the store answered the probe with something else");
      const needed = new Set(probed.shas);
      let done = 0;
      const total = 2 + parts.web.size + (parts.assets?.files.size ?? 0);
      const send = async (part: PartHeader, bytes: Buffer): Promise<void> => {
        ws.send(JSON.stringify(part));
        for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
          ws.send(bytes.subarray(offset, Math.min(offset + CHUNK_BYTES, bytes.length)));
          await this.drain(ws, timeoutMs);
        }
        done += 1;
        onProgress?.({
          part: `${part.kind}${part.path === undefined ? "" : ` ${part.path}`}`,
          done,
          total,
        });
      };
      await send(
        { t: "part", kind: "platform", sha: platformSha, size: Buffer.byteLength(parts.platform) },
        Buffer.from(parts.platform, "utf8"),
      );
      await send(
        { t: "part", kind: "cli", sha: cliSha, size: Buffer.byteLength(parts.cli) },
        Buffer.from(parts.cli, "utf8"),
      );
      for (const [rel, bytes] of parts.web) {
        const sha = webShas.get(rel)!;
        if (needed.has(sha))
          await send({ t: "part", kind: "web", path: rel, sha, size: bytes.length }, bytes);
      }
      if (parts.assets !== null) {
        const exec = new Set(parts.assets.exec);
        for (const [rel, bytes] of parts.assets.files) {
          const sha = assetShas.get(rel)!;
          if (needed.has(sha)) {
            await send(
              { t: "part", kind: "asset", path: rel, exec: exec.has(rel), sha, size: bytes.length },
              bytes,
            );
          }
        }
      }
      ws.send(
        JSON.stringify({
          t: "commit",
          platform: platformSha,
          cli: cliSha,
          web: Object.fromEntries(webShas),
          ...(parts.assets === null
            ? {}
            : {
                assets: {
                  files: Object.fromEntries(assetShas),
                  exec: parts.assets.exec,
                },
              }),
          source: parts.source,
        }),
      );
      const answer = await answers.next(timeoutMs, "the commit");
      if (answer.t !== "ok") throw new Error("the server answered the commit with something else");
      return answer.result;
    } finally {
      ws.close();
    }
  }

  /** Blocks while the socket has more than its high-water mark queued (then until below low). */
  private async drain(ws: WebSocket, timeoutMs: number): Promise<void> {
    if (ws.bufferedAmount <= HIGH_WATER) return;
    const deadline = Date.now() + timeoutMs;
    while (ws.bufferedAmount > LOW_WATER) {
      if (Date.now() > deadline) throw new Error("the stream stalled: the socket never drained");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}
