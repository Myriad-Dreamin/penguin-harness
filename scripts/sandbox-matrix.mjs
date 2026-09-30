#!/usr/bin/env node
// One cell of the sandbox channel matrix: against a running PenguinHarness, read the flags a new
// Session reports at the strictest sandbox level, and run one command that writes outside the
// workspace and one that writes inside it — through the real agent loop, so the commands take
// the same exec_command path a model's would.
//
// No model credential is involved. The script serves a scripted Anthropic Messages endpoint
// itself and registers it as the model of a Project it creates for the run: each command is one
// task whose first model turn is a tool_use(exec_command) and whose second turn, once the
// tool_result is back, ends the task. The tool_result the server sends back is the evidence.
//
// Every write lands in that Project (`sandbox_matrix_<nonce>`), which is deleted afterwards:
// no existing Project's models are touched, and the server's sandbox settings are neither read
// nor written — the level is picked on the run's own Session. Enabling a backend is different:
// plugins load per process, so adding one to any Project re-assembles the whole App and stops
// the runs in flight in every Project. The script does that only with --enable-backend (implied
// by --serve), and drops the backend from its Project again before deleting it.
//
// Two ways to point it at the install under test:
//
//   # it starts the installed program itself, on a fresh HOME, and stops it afterwards
//   node scripts/sandbox-matrix.mjs --serve <install>/bin/penguin --home <empty dir> --port 17491 \
//     --backend @penguinharness/sandbox-bwrap --channel cli-bundle --platform linux-x64
//
//   # or it drives a server that is already running — a fresh container, a fresh remote
//   # install, or an instance people are using. Without --enable-backend it measures the
//   # backends the server already runs; pass it only for a target that may be re-assembled
//   # (a container started for the cell, an install made for it).
//   node scripts/sandbox-matrix.mjs --base-url http://localhost:7364 \
//     (--token <api-token> | --password <admin password>) --backend … --channel … --platform … \
//     [--enable-backend] [--mock-host host.docker.internal] [--mock-port <n>]
//
// The server must reach this script's model endpoint. Without --mock-host it listens on
// loopback only, which serves a server on this machine; with it, it listens on every interface
// and registers http://<mock-host>:<port>. For a server on another machine, run the script
// there, or fix --mock-port and carry it with `ssh -R` (`ssh -L` alone does not reach back).
// Before any command runs, the server is asked to test that model itself.
//
// Common options: --out <file> (the result JSON) and --known-gap "<why>" (below).
//
// The result is one JSON object (printed, and written to --out): the flags, the backends in
// use, both commands' outputs, the cleanup and a verdict with its reason. When the script
// started the server it also checks the out-of-bounds path on the host itself, so a write that
// lands but reads as denied still counts as an escape. On any other server that write is a
// marker file under the server's $HOME which the API cannot remove: its path is in the outside
// command's output. Exit status: 0 when the cell passes, 1 when it fails, 2 on a usage error,
// 3 when it was not run — the server cannot reach the model endpoint, does not take a sandbox
// level per Session, or runs no backend and --enable-backend was not given. A failure is a
// finding, not a crash — every step records why it stopped. A Project the script could not
// delete is a failure.
//
// --known-gap marks a cell whose failure is already on record (the text says where): a failure
// is reported with verdict "known-gap" and exit 0, and a pass is reported as a pass with a note
// that the gap no longer reproduces — the cue to drop the flag. It does not apply to a cell that
// was not run, nor to a cleanup that failed.
import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const args = parseArgs(process.argv.slice(2), ["enable-backend"]);
const serving = args.serve !== undefined;
if (
  !args.backend ||
  !args.channel ||
  !args.platform ||
  (serving ? !args.home || !args.port : !args["base-url"])
) {
  console.error(
    "usage: sandbox-matrix.mjs (--serve <penguin> --home <dir> --port <n> | --base-url <url> (--token <t> | --password <p>) [--enable-backend]) --backend <specifier> --channel <name> --platform <os-arch> [--user admin] [--mock-host <host>] [--mock-port <n>] [--known-gap <why>] [--out <file>]",
  );
  process.exit(2);
}
const BASE = serving ? `http://localhost:${args.port}` : args["base-url"].replace(/\/$/, "");
// A server started here exists for this cell alone, so re-assembling it harms nobody.
const MAY_ENABLE = serving || args["enable-backend"] === true;
// The id picks the wire protocol: this one speaks Anthropic Messages, which the mock answers.
const MODEL_ID = "claude-4-8";
const NONCE = randomBytes(4).toString("hex");
// An admin's Project id: lowercase, digits and underscores (a hyphen is the user namespace's).
const PROJECT_ID = `sandbox_matrix_${NONCE}`;
// The strictest level a backend confines to, picked on the run's own Session.
const LEVEL = { mode: "workspace-write", network: "none" };
const OUTSIDE_MARK = `MATRIX_OUTSIDE_WROTE_${NONCE}`;
const INSIDE_MARK = `MATRIX_INSIDE_WROTE_${NONCE}`;
// $HOME is outside every workspace a fresh install creates (they live under the data root),
// and it is the directory a confined command is least expected to write. The path is echoed
// so a caller that can see the server's filesystem can check it independently.
const OUTSIDE_CMD = `f="$HOME/penguin-matrix-escape-${NONCE}"; echo "target=$f"; echo x > "$f" && echo ${OUTSIDE_MARK}`;
const INSIDE_CMD = `echo x > penguin-matrix-${NONCE}.txt && echo ${INSIDE_MARK}`;
// The command rides the task's text between two markers, so whatever the server adds around
// a user message cannot bleed into it.
const OPEN = "<<matrix-run>>";
const CLOSE = "<</matrix-run>>";
const TASK_TIMEOUT_MS = Number(args["timeout-ms"] ?? 120_000);

const result = {
  channel: args.channel,
  platform: args.platform,
  backend: args.backend,
  baseUrl: BASE,
  at: new Date().toISOString(),
  version: null,
  projectId: PROJECT_ID,
  modelEndpoint: null,
  endpointReached: null,
  mayEnableBackend: MAY_ENABLE,
  // true: enabled by this run; "already-running": a backend was running before it.
  backendEnabled: false,
  backendError: null,
  backendsInUse: null,
  backendFailures: null,
  sandbox: null,
  outside: null,
  inside: null,
  cleanup: null,
  verdict: "fail",
  reason: null,
  note: null,
};

/** A precondition that does not hold: the cell was not run, which is not a failure. */
class NotRun extends Error {}

const mock = await startMock();
result.modelEndpoint = mock.url;
const server = serving ? startServer() : null;
let exitCode = 1;
/** What the run created on the target, for the cleanup to undo. */
const created = { project: false, backend: false };
let api = null;
try {
  if (server) await server.ready;
  api = await authenticate();
  await run(api);
} catch (err) {
  if (err instanceof NotRun) {
    result.verdict = "not-run";
    result.reason = err.message;
  } else {
    result.reason ??= String(err instanceof Error ? err.message : err);
  }
} finally {
  const leftover = api ? await cleanup(api) : [];
  const gap = args["known-gap"];
  if (leftover.length > 0) {
    result.verdict = "fail";
    result.reason = [result.reason, `cleanup: ${leftover.join("; ")}`].filter(Boolean).join("; ");
  } else if (gap && result.verdict === "fail") {
    result.verdict = "known-gap";
    result.note = gap;
  } else if (gap && result.verdict === "pass") {
    result.note = `recorded as a known gap (${gap}), but it no longer reproduces`;
  }
  exitCode = { pass: 0, "known-gap": 0, "not-run": 3 }[result.verdict] ?? 1;
  mock.server.close();
  if (server) await server.stop();
  const text = JSON.stringify(result, null, 2);
  console.log(text);
  if (args.out) writeFileSync(args.out, text + "\n");
  process.exit(exitCode);
}

async function run(api) {
  result.version = (await api("GET", "/api/version")).body?.version ?? null;

  if (serving) {
    // A first boot seeds its default Project a moment after the server starts answering;
    // wait for it, so the run's own Project is not created in the middle of that.
    let projects;
    for (let i = 0; i < 30; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1000));
      projects = await api("GET", "/api/projects");
      if (projects.body?.projects?.length) break;
    }
    if (!projects.body?.projects?.length) {
      throw new Error(`no Project on a fresh install: ${describeError(projects)}`);
    }
  }

  const project = await api("POST", "/api/projects", {
    projectId: PROJECT_ID,
    name: `Sandbox matrix ${NONCE}`,
  });
  if (!project.ok) throw new Error(`creating the run's Project answered ${describeError(project)}`);
  created.project = true;
  const P = `/api/projects/${PROJECT_ID}`;

  const models = await api("PUT", `${P}/models`, {
    defaultModel: { provider: "custom", modelId: MODEL_ID },
    models: [
      {
        provider: "custom",
        modelId: MODEL_ID,
        apiKey: "sk-matrix",
        baseUrl: mock.url,
        contextWindow: 200000,
      },
    ],
  });
  if (!models.ok) throw new Error(`registering the scripted model answered ${models.status}`);

  // The server calls the endpoint back, not this script: ask it to try once before any task.
  const probe = await api("POST", `${P}/models/test`, { provider: "custom", modelId: MODEL_ID });
  result.endpointReached = probe.ok && probe.body?.ok === true;
  if (!result.endpointReached) {
    const why = probe.ok ? (probe.body?.message ?? "no reason given") : describeError(probe);
    throw new NotRun(`the target cannot reach the model endpoint at ${mock.url}: ${why}`);
  }

  // Enabling a shipped backend is a list edit; one that is not shipped goes through npm, and
  // the refusal it comes back with is this cell's reason. Either way it re-assembles the App.
  if (MAY_ENABLE) {
    const enabled = await api("POST", `${P}/plugins/installed`, { specifier: args.backend });
    const bare = args.backend.replace(/(.)@.*$/, "$1");
    const row = enabled.body?.plugins?.find?.((p) => p.specifier === bare);
    if (enabled.ok) created.backend = bare;
    if (!enabled.ok) {
      result.backendError = describeError(enabled);
    } else if (!row?.active) {
      result.backendError = row?.error ?? "listed but not active after the edit";
    } else {
      result.backendEnabled = true;
    }
  }

  const session = await api("POST", `${P}/agents/default_agent/sessions`, {
    provider: "custom",
    modelId: MODEL_ID,
    approvalMode: "allow-all",
    sandbox: LEVEL,
  });
  if (!session.ok) throw new Error(`creating a Session answered ${describeError(session)}`);
  const sessionId = session.body.session.sessionId;
  result.sandbox = session.body.session.sandbox ?? null;
  // A server that does not take a level per Session answers with its own settings; falling
  // back to writing those settings is exactly what this script must not do.
  if (result.sandbox?.mode !== LEVEL.mode || result.sandbox?.network !== LEVEL.network) {
    throw new NotRun(
      `the target does not take a sandbox level per Session: asked ${LEVEL.mode}/${LEVEL.network}, the Session has ${result.sandbox?.mode}/${result.sandbox?.network}`,
    );
  }

  readBackends(await api("GET", "/api/admin/plugin-config"));
  if (!MAY_ENABLE) {
    const running = result.backendsInUse?.length > 0 || result.sandbox.confinementSupported;
    if (!running) {
      throw new NotRun(
        `no sandbox backend is running on the target, and enabling ${args.backend} re-assembles the whole App (every Project) — pass --enable-backend only for a target that may be re-assembled`,
      );
    }
    result.backendEnabled = "already-running";
  }

  result.outside = await command(api, sessionId, OUTSIDE_CMD, OUTSIDE_MARK);
  result.inside = await command(api, sessionId, INSIDE_CMD, INSIDE_MARK);
  judge();
}

/**
 * The backends in use, read from the Sandbox card's status: "Backends: <name> (<dimensions>) ·
 * …", and "<name> is not in use: <reason>" for each that failed to load. Read-only, and the
 * card's values are not looked at.
 */
function readBackends(res) {
  const group = res.body?.plugins?.find?.((g) => g.name === "sandbox");
  if (!group) return;
  const notices = (group.notices ?? []).map((n) => n.text);
  const listed = notices.find((t) => t.startsWith("Backends: "));
  result.backendsInUse = listed
    ? listed
        .slice("Backends: ".length)
        .split(" · ")
        .map((b) => b.match(/^(.*) \((.*)\)$/))
        .filter(Boolean)
        .map(([, name, dims]) => ({ name, dimensions: dims ? dims.split(", ") : [] }))
    : [];
  result.backendFailures = notices.filter((t) => / is not in use: /.test(t));
}

/**
 * Undoes what the run created: the backend leaves the run's Project first — deleting a Project
 * does not unload what the process runs, the re-assembly this removal asks for does — then the
 * Project goes, and with it the workspace the inside write landed in. Returns what is left.
 */
async function cleanup(api) {
  const left = [];
  result.cleanup = {};
  const P = `/api/projects/${PROJECT_ID}`;
  if (created.backend) {
    const res = await api(
      "DELETE",
      `${P}/plugins/installed?specifier=${encodeURIComponent(created.backend)}`,
    );
    result.cleanup.backendRemoved = res.ok ? res.status : describeError(res);
    if (!res.ok) left.push(`${created.backend} is still listed in ${PROJECT_ID}`);
  }
  if (created.project) {
    const res = await api("DELETE", P);
    result.cleanup.projectDeleted = res.ok ? res.status : describeError(res);
    if (!res.ok) left.push(`Project ${PROJECT_ID} was not deleted`);
  }
  return left;
}

/** Runs one command as one task and returns what its tool_result said. */
async function command(api, sessionId, cmd, mark) {
  const done = mock.expect(cmd);
  const started = await api("POST", `/api/sessions/${sessionId}/tasks`, {
    input: [{ type: "text", text: `${OPEN}${cmd}${CLOSE}` }],
  });
  if (!started.ok) return { cmd, error: describeError(started), output: null, wrote: false };
  const output = await Promise.race([
    done,
    new Promise((resolve) => setTimeout(() => resolve(null), TASK_TIMEOUT_MS)),
  ]);
  if (output === null)
    return { cmd, error: "no tool_result within the timeout", output, wrote: false };
  await waitIdle(api, sessionId);
  return { cmd, output, wrote: output.includes(mark) };
}

function judge() {
  const s = result.sandbox ?? {};
  const reasons = [];
  if (!result.backendEnabled) reasons.push(`backend not running: ${result.backendError}`);
  if (s.confinementSupported !== true)
    reasons.push(`confinementSupported=${s.confinementSupported}`);
  if (s.noNetworkSupported !== true) reasons.push(`noNetworkSupported=${s.noNetworkSupported}`);
  // With the server started here it shares this filesystem: the path the command printed is
  // checked on the host as well, so an escape cannot hide behind a misleading output.
  const target = result.outside?.output?.match(/^target=(.*)$/m)?.[1];
  if (serving && target && existsSync(target)) {
    result.outside.wrote = true;
    result.outside.onHost = target;
  }
  if (result.outside?.error) reasons.push(`outside command: ${result.outside.error}`);
  else if (result.outside?.wrote) reasons.push("the write outside the workspace succeeded");
  if (result.inside?.error) reasons.push(`inside command: ${result.inside.error}`);
  else if (!result.inside?.wrote) reasons.push("the write inside the workspace was refused");
  result.verdict = reasons.length === 0 ? "pass" : "fail";
  result.reason = reasons.length === 0 ? null : reasons.join("; ");
}

/**
 * Starts the installed program the way its own next-steps line says to — `penguin web` — on a
 * HOME of its own, so the data root is fresh and nothing of the caller's is read or written.
 */
function startServer() {
  const home = args.home;
  const child = spawn(args.serve, ["web", "--no-open", "--port", String(args.port)], {
    env: { ...process.env, HOME: home, USERPROFILE: home, PENGUIN_PLUGIN_INDEX: "off" },
    stdio: ["ignore", "pipe", "pipe"],
    // penguin.cmd is a batch file, which only a shell starts.
    shell: process.platform === "win32",
  });
  let log = "";
  child.stdout.on("data", (c) => (log += c));
  child.stderr.on("data", (c) => (log += c));
  const tokenFile = join(home, ".penguin", "data", "api-token");
  const ready = (async () => {
    for (let i = 0; i < 120; i++) {
      if (child.exitCode !== null) {
        throw new Error(`the server exited with ${child.exitCode}: ${log.slice(-500)}`);
      }
      const up =
        existsSync(tokenFile) &&
        (await fetch(`${BASE}/api/install`).then(
          (r) => r.ok,
          () => false,
        ));
      if (up) {
        args.token = readFileSync(tokenFile, "utf8").trim();
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`the server did not come up within 120s: ${log.slice(-500)}`);
  })();
  const stop = async () => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((r) => child.once("exit", r)),
      new Promise((r) => setTimeout(r, 15_000)),
    ]);
  };
  return { ready, stop };
}

async function authenticate() {
  let auth = {};
  if (args.token) {
    auth = { authorization: `Bearer ${args.token}` };
  } else if (args.password) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: args.user ?? "admin", password: args.password }),
    });
    if (!res.ok) throw new Error(`login answered ${res.status}`);
    const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
    auth = { cookie: cookies.join("; ") };
  } else {
    throw new Error("pass --token or --password");
  }
  return async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...auth,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        // The server refuses a cross-origin write; a same-origin one names its own base.
        origin: BASE,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {}
    return { ok: res.ok, status: res.status, body: parsed, text };
  };
}

async function waitIdle(api, sessionId) {
  for (let i = 0; i < 60; i++) {
    const s = (await api("GET", `/api/sessions/${sessionId}`)).body?.session;
    if (!s || !["running", "queued"].includes(s.status)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}

function describeError(res) {
  const e = res.body?.error;
  return e ? `${res.status} ${e.code}: ${e.message}` : `${res.status} ${res.text.slice(0, 300)}`;
}

/**
 * The scripted model. A request whose last message is the task's own text answers with one
 * exec_command call carrying the command between the markers; a request that already carries that
 * call's tool_result hands the result to whoever waits for it and ends the turn. Anything else
 * (a title request) gets a short text.
 */
async function startMock() {
  const waiting = new Map();
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let messages = [];
      try {
        messages = JSON.parse(raw).messages ?? [];
      } catch {}
      const last = messages.at(-1);
      const parts = Array.isArray(last?.content)
        ? last.content
        : [{ type: "text", text: last?.content ?? "" }];
      const toolResult = parts.find((p) => p.type === "tool_result");
      const asked = parts
        .filter((p) => p.type === "text")
        .map((p) => p.text.match(/<<matrix-run>>([\s\S]*?)<<\/matrix-run>>/)?.[1])
        .find((c) => c !== undefined);
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      if (toolResult) {
        const text = flatten(toolResult.content);
        for (const [cmd, resolve] of waiting) {
          if (JSON.stringify(messages).includes(JSON.stringify(cmd).slice(1, -1))) {
            waiting.delete(cmd);
            resolve(text);
            break;
          }
        }
        return reply(res, [{ type: "text", text: "done" }], "end_turn");
      }
      if (asked) {
        const cmd = asked;
        return reply(
          res,
          [
            {
              type: "tool_use",
              id: `toolu_${randomBytes(6).toString("hex")}`,
              name: "exec_command",
              input: { cmd },
            },
          ],
          "tool_use",
        );
      }
      return reply(res, [{ type: "text", text: "Sandbox matrix" }], "end_turn");
    });
  });
  // Loopback unless the server has to come from elsewhere, which --mock-host says.
  const bind = args["mock-host"] ? "0.0.0.0" : "127.0.0.1";
  await new Promise((r) => server.listen(Number(args["mock-port"] ?? 0), bind, r));
  const port = server.address().port;
  return {
    server,
    url: `http://${args["mock-host"] ?? "127.0.0.1"}:${port}`,
    expect: (cmd) => new Promise((resolve) => waiting.set(cmd, resolve)),
  };
}

function flatten(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content.map((c) => (typeof c === "string" ? c : (c.text ?? ""))).join("\n");
  return JSON.stringify(content);
}

function reply(res, blocks, stopReason) {
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send("message_start", {
    type: "message_start",
    message: {
      id: "msg_matrix",
      type: "message",
      role: "assistant",
      model: MODEL_ID,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 0 },
    },
  });
  blocks.forEach((b, index) => {
    if (b.type === "text") {
      send("content_block_start", {
        type: "content_block_start",
        index,
        content_block: { type: "text", text: "" },
      });
      send("content_block_delta", {
        type: "content_block_delta",
        index,
        delta: { type: "text_delta", text: b.text },
      });
    } else {
      send("content_block_start", {
        type: "content_block_start",
        index,
        content_block: { type: "tool_use", id: b.id, name: b.name, input: {} },
      });
      send("content_block_delta", {
        type: "content_block_delta",
        index,
        delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) },
      });
    }
    send("content_block_stop", { type: "content_block_stop", index });
  });
  send("message_delta", {
    type: "message_delta",
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: 1 },
  });
  send("message_stop", { type: "message_stop" });
  res.end();
}

function parseArgs(argv, flags) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    if (flags.includes(key)) {
      out[key] = true;
      continue;
    }
    out[key] = argv[i + 1];
    i++;
  }
  return out;
}
