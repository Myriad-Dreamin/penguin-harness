/**
 * API-surface fuzz target — the module Jazzer.js loads and calls.
 *
 * The harness is the same one the hand-driven run used (see `harness.ts`): `bootAppDeps` →
 * `seedAdmin` → `createApp` over a disposable data root, real SQLite, the real Hono app
 * reached through `app.request()`, a scripted LLM behind the product's own seam, a fake
 * SessionLoader and a controllable clock. What changed is who picks the requests: libFuzzer
 * does, from the bytes it hands `fuzz()`, and coverage feedback from the instrumented product
 * code decides which of them survive.
 *
 * One call is one request, decoded by `decodeApiControls`. After it:
 *
 *  - an exception escaping a handler is rethrown here (invariant 1);
 *  - a read-only snapshot of SQLite is compared against the boot baseline (invariants 2-3,
 *    see `invariants.ts`), and any violation is thrown — Jazzer.js records that as a crash
 *    and writes the input down;
 *  - a non-loopback network attempt is thrown as well.
 *
 * Beside the fuzzing loop the module also boots: it seeds the three session rows the fake
 * loader serves, drives them once (so the scripted LLM rotation — text, tool call, one
 * contract-visible failure — always plays, whatever the fuzzer hits), and samples the
 * loopback SSE stream once with a bounded read. Those three are setup, not findings.
 *
 * Run it through `run.mjs server`, or replay the corpus without Jazzer.js:
 *
 *   node --import ./resolve-hook.mjs build/tests/fuzzers/server/src/fuzz.js --self-check
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { openExistingDatabase } from "../../../../packages/server/src/db/database.js";
import { ByteChoices } from "./choices.js";
import { permitLoopback } from "./bug-detectors.js";
import { apiCorpus, fillPath, type ApiGenCtx, type Pools } from "./corpus.js";
import { installOutboundGuard } from "./guards.js";
import { bootHarness } from "./harness.js";
import { decodeApiControls, payloadText, withPayload, type ApiControls } from "./input.js";
import { invariantViolations, readSnapshot } from "./invariants.js";
import { withSoftTimeout } from "./timeout.js";

const PROJECT_ID = "default_project";
const AGENT_ID = "default_agent";
const NEW_ADMIN_PASSWORD = "penguin-0000-changed";
/** Per-call soft timeout: a request that outlives it is a finding, not a hang. */
const STEP_TIMEOUT_MS = 5_000;
/** Crossing the 30-day auth-session TTL is one of the inputs the fuzzer can pick. */
const CLOCK_JUMP_DAYS = 31;
const SSE_READ_CAP_MS = 250;
const SSE_READ_CAP_BYTES = 32_768;
const RESUME_SESSION_IDS = [
  "session-2026-10-26-00-00-00-fuzzresume1",
  "session-2026-10-26-00-00-00-fuzzresume2",
  "session-2026-10-26-00-00-00-fuzzresume3",
];

const OUT_DIR = process.env.FUZZ_OUT_DIR ?? path.join(process.cwd(), "out");
const CORPUS_DIR = process.env.FUZZ_CORPUS_DIR ?? path.join(OUT_DIR, "corpus");
const startedAt = performance.now();

const stats = {
  calls: 0,
  status: {} as Record<string, number>,
  auth: {} as Record<string, number>,
  specHits: new Set<string>(),
  signatures: new Set<string>(),
};

const guard = installOutboundGuard();
const harness = await bootHarness();
// The SSRF bug detector would otherwise report the harness's own loopback traffic.
await permitLoopback(harness.app.listener.port);
const specs = apiCorpus(PROJECT_ID, AGENT_ID);
const pools: Pools = { projects: [], agents: [], sessions: [], schedules: [], users: [] };

/** Inserts the resume-path rows (the shape a restart finds in the index) and returns them. */
function seedResumeSessions(): void {
  const db = openExistingDatabase(harness.app.dbPath);
  try {
    const insert = db.prepare(
      `INSERT OR REPLACE INTO sessions
       (session_id, project_id, agent_id, provider, model_id, workspace, approval_mode, created_at, last_active_at, has_trace)
       VALUES (?, ?, ?, 'fuzz-group', 'fuzz-model', ?, 'allow-all', ?, ?, 0)`,
    );
    for (const id of RESUME_SESSION_IDS) {
      insert.run(
        id,
        PROJECT_ID,
        AGENT_ID,
        harness.app.root,
        harness.clock.iso(),
        harness.clock.iso(),
      );
    }
  } finally {
    db.close();
  }
  pools.sessions.push(...RESUME_SESSION_IDS);
}

function llmFailurePlays(): number {
  return harness.loader.loaded.reduce((total, entry) => total + entry.llm.failurePlays, 0);
}

async function login(): Promise<void> {
  const res = await harness.app.app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "admin", password: adminPassword }),
  });
  if (res.status === 200) {
    cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? null;
  }
}

/** One bounded read of the loopback event stream — the SSE route's subscribe/abort path. */
async function sampleEventStream(): Promise<{
  status: number | null;
  chunks: number;
  bytes: number;
}> {
  const controller = new AbortController();
  const cap = setTimeout(() => controller.abort(), SSE_READ_CAP_MS);
  let status: number | null = null;
  let chunks = 0;
  let bytes = 0;
  try {
    // localhost, not 127.0.0.1: the canonical-host guard treats 127.0.0.1 as the preview host.
    const res = await fetch(`http://localhost:${harness.app.listener.port}/api/events`, {
      headers: { authorization: `Bearer ${harness.app.apiToken}`, accept: "text/event-stream" },
      signal: controller.signal,
    });
    status = res.status;
    if (res.body !== null) {
      const reader = res.body.getReader();
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        chunks += 1;
        bytes += next.value.byteLength;
        if (bytes > SSE_READ_CAP_BYTES) break;
      }
      reader.cancel().catch(() => {});
    }
  } catch (err) {
    // The cap firing IS the bounded read working: a live stream only ends when the client stops.
    if (!(err instanceof Error && err.name === "AbortError")) throw err;
  } finally {
    clearTimeout(cap);
    controller.abort();
  }
  return { status, chunks, bytes };
}

// ── Boot: the harness, the resume rows, one drive of each, one SSE sample ──────────────────
let cookie: string | null = null;
let adminPassword = harness.app.adminPassword;
const bootBaseline = readSnapshot(harness.app.dbPath);
seedResumeSessions();
for (const sessionId of RESUME_SESSION_IDS) {
  const res = await harness.app.app.request(
    `/api/sessions/${encodeURIComponent(sessionId)}/tasks`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${harness.app.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: [{ type: "text", text: "fuzz boot drive" }],
        queueIfBusy: true,
      }),
    },
  );
  harness.clock.step(1_000);
  if (res.status >= 500) throw new Error(`[api] boot drive on ${sessionId} answered ${res.status}`);
}
const sseSample = await sampleEventStream();
const bootSnapshot = readSnapshot(harness.app.dbPath);
const bootViolations = invariantViolations({
  snapshot: bootSnapshot,
  baseline: bootBaseline,
  llmFailurePlays: llmFailurePlays(),
});
if (bootViolations.length > 0) {
  throw new Error(`[api] the boot smoke itself broke an invariant: ${bootViolations.join("; ")}`);
}
/** Everything the fuzzing loop is measured against. */
const baseline = bootSnapshot;

function describeCall(controls: ApiControls, specId: string, request: string): string {
  const flags = [
    `auth=${controls.auth}`,
    `variant=${controls.variant}`,
    controls.jump ? "clock-jump" : "clock-step",
    controls.rawBody ? "raw-body" : "json-body",
  ].join(" ");
  return `[api] ${specId} ${request} (${flags}, payload ${controls.rest.length}B)`;
}

/**
 * One fuzz call: decode, send, check. A throw is the finding — Jazzer.js turns it into a
 * crash file and stops, so a report always names the input that broke the invariant.
 */
export async function fuzz(data: Buffer): Promise<void> {
  const controls = decodeApiControls(data, specs.length);
  const spec = specs[controls.specIndex]!;
  const call = stats.calls + 1;
  stats.calls = call;
  stats.specHits.add(spec.id);
  stats.auth[controls.auth] = (stats.auth[controls.auth] ?? 0) + 1;
  if (controls.jump) harness.clock.jumpForwardDays(CLOCK_JUMP_DAYS);
  else harness.clock.step(1_000);

  const ctx: ApiGenCtx = {
    rng: new ByteChoices(controls.rest),
    pools,
    step: call,
    password: adminPassword,
  };
  const filled = fillPath(spec, ctx, PROJECT_ID, AGENT_ID);
  const headers: Record<string, string> = {};
  if (controls.auth === "bearer") headers.authorization = `Bearer ${harness.app.apiToken}`;
  if (controls.auth === "cookie") {
    if (cookie === null) await login();
    if (cookie !== null) headers.cookie = cookie;
  }

  let body: string | undefined;
  if (spec.body !== undefined) {
    headers["content-type"] = "application/json";
    body = controls.rawBody
      ? payloadText(controls.rest, 512)
      : JSON.stringify(withPayload(spec.body(controls.variant, ctx), payloadText(controls.rest)));
  }

  const where = describeCall(controls, spec.id, `${spec.method} ${filled}`);
  const raced = await withSoftTimeout(
    // Hono's `request()` is typed `Response | Promise<Response>`; the race needs a promise.
    Promise.resolve(
      harness.app.app.request(filled, {
        method: spec.method,
        headers,
        ...(body === undefined ? {} : { body }),
      }),
    ),
    STEP_TIMEOUT_MS,
  );
  if (!raced.ok) {
    if (raced.threw !== null) {
      throw new Error(
        `${where} threw out of the handler: ${raced.threw.stack ?? raced.threw.message}`,
      );
    }
    throw new Error(`${where} exceeded the ${STEP_TIMEOUT_MS}ms soft timeout`);
  }

  const res = raced.value;
  stats.status[String(res.status)] = (stats.status[String(res.status)] ?? 0) + 1;
  if (controls.auth === "cookie" && res.status === 401) {
    // The TTL jump expired the auth session; the next cookie call logs in again.
    cookie = null;
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      throw new Error(
        `${where} answered ${res.status} as JSON but its body did not parse: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    spec.capture?.(json, pools);
  }
  // The stateful feed: a successful password change moves the credential the driver uses.
  if (
    spec.id === "me.password.put" &&
    controls.variant === "ok" &&
    res.status >= 200 &&
    res.status < 300
  ) {
    adminPassword = NEW_ADMIN_PASSWORD;
  }

  const snapshot = readSnapshot(harness.app.dbPath);
  const violations = invariantViolations({
    snapshot,
    baseline,
    llmFailurePlays: llmFailurePlays(),
  });
  if (violations.length > 0) {
    throw new Error(
      `${where} answered ${res.status} and broke an invariant: ${violations.join("; ")}`,
    );
  }
  if (guard.attempts.length > 0) {
    const attempts = guard.attempts
      .slice(0, 5)
      .map((attempt) => `${attempt.kind}→${attempt.target}`)
      .join("; ");
    throw new Error(`${where} attempted a non-loopback connection: ${attempts}`);
  }
  stats.signatures.add(
    `p${snapshot.projects}|a${snapshot.agents}|s${snapshot.sessions}|h${snapshot.scheduleState}|u${snapshot.usage}|e${snapshot.errTotal}|d=${harness.clock.iso().slice(0, 10)}`,
  );
}

/** Replay every corpus input once, in order — the reading a machine without Jazzer.js can take. */
async function selfCheck(): Promise<void> {
  const files = fs
    .readdirSync(CORPUS_DIR)
    .filter((name) => !name.startsWith("."))
    .sort();
  let failed = 0;
  for (const [index, name] of files.entries()) {
    const bytes = fs.readFileSync(path.join(CORPUS_DIR, name));
    try {
      await fuzz(bytes);
    } catch (err) {
      failed += 1;
      console.error(`[self-check] ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if ((index + 1) % 50 === 0) console.log(`[self-check] ${index + 1}/${files.length}`);
  }
  console.log(`[self-check] ${files.length} inputs, ${failed} failures`);
  // The harness would hold the loop open; close it and give the exit code.
  await shutdown();
  process.exit(failed > 0 ? 1 : 0);
}

process.on("exit", () => {
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const summary = [
      "# API fuzz run",
      "",
      `- Requests: ${stats.calls}`,
      `- Status buckets: ${JSON.stringify(stats.status)}`,
      `- Auth rotation: ${JSON.stringify(stats.auth)}`,
      `- Distinct state signatures: ${stats.signatures.size}`,
      `- Endpoint specs hit: ${stats.specHits.size}/${specs.length}`,
      `- Outbound attempts (non-loopback): ${guard.attempts.length}`,
      `- Boot SSE sample: status ${sseSample.status}, ${sseSample.chunks} chunks / ${sseSample.bytes}B`,
      `- Elapsed: ${Math.round(performance.now() - startedAt)}ms`,
      "",
    ];
    fs.writeFileSync(path.join(OUT_DIR, "summary.md"), summary.join("\n"), "utf8");
  } catch {
    // An exit handler has nobody left to tell; the fuzzer's own console output stands.
  }
});

/** Close the harness — the runner calls this once the fuzzer has stopped (see fuzz-runner.mjs). */
export async function shutdown(): Promise<void> {
  await harness.app.cleanup().catch(() => {});
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await selfCheck();
}
