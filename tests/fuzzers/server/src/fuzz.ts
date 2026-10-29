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
 * One input is a sequence of calls, cut at every newline byte (`splitRecords`), and each call
 * is one request decoded by `decodeApiControls`. State bugs need more than one call — create
 * then read, read then delete — so the sequence, not the single call, is the unit a mutation
 * adds to and the unit a finding is saved as. After every call:
 *
 *  - an exception escaping a handler is rethrown here (invariant 1);
 *  - a read-only snapshot of SQLite is compared against the boot baseline (invariants 2-3,
 *    see `invariants.ts`), and any violation is thrown — Jazzer.js records that as a crash
 *    and writes the input down;
 *  - a non-loopback network attempt is thrown as well.
 *
 * Beside the fuzzing loop the module also boots: it seeds the three session rows a restart
 * finds, drives them once with a plan that carries a tool call and a provider failure (so those
 * two paths always play, whatever the fuzzer hits), and samples the loopback SSE stream once
 * with a bounded read. Those three are setup, not findings.
 *
 * Run it through `run.mjs server`, or replay the corpus without Jazzer.js:
 *
 *   node --import ./resolve-hook.mjs build/tests/fuzzers/server/src/fuzz.js --self-check
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { openExistingDatabase } from "../../../../packages/server/src/db/database.js";
import {
  addModel,
  loadProjectConfig,
} from "../../../../packages/core/src/state/project-config.js";
import { captureIds, splitRecords, type Pools } from "../../specs/decode.js";
import { httpSpecs } from "../../specs/server/main.js";
import { ByteChoices } from "./choices.js";
import { permitLoopback } from "./bug-detectors.js";
import { Epochs, databaseBytes, settleQuiet } from "./epoch.js";
import { writeFindingKit } from "./finding.js";
import { installOutboundGuard } from "./guards.js";
import { bootHarness } from "./harness.js";
import { decodeApiControls, payloadText, withPayload, type ApiControls } from "./input.js";
import { invariantViolations, readSnapshot, type DbSnapshot } from "./invariants.js";
import { modelScriptFor } from "./model-script.js";
import { plays as modelPlays, resetModelPlan, setModelPlan } from "./stubs/mmsp/index.js";
import { withSoftTimeout } from "./timeout.js";
import { Quiescence } from "./virtual-time.js";

const PROJECT_ID = "default_project";
/** The (provider, modelId) pair every fuzz-made Session names; the model stub serves it. */
const MODEL_PROVIDER = "fuzz-group";
const MODEL_ID = "fuzz-model";
const AGENT_ID = "default_agent";
const NEW_ADMIN_PASSWORD = "penguin-0000-changed";
/** The route whose success moves the credential the driver logs in with. */
const PASSWORD_ROUTE = "PUT /api/me/password";
/** Per-call soft timeout: a request that outlives it is a finding, not a hang. */
const STEP_TIMEOUT_MS = 5_000;
/**
 * How many calls one input may run. A sequence of eight reaches the shapes that matter — create,
 * read, update, list, delete, read again — while keeping one input cheap enough that the
 * engine's exec/s stays a useful search rate. An input with more calls is cut here, not
 * rejected: the earlier calls are still a sequence worth running.
 */
const MAX_CALLS = 8;
/**
 * No new call once this much of the input has been used. libFuzzer's own watchdog (30 s) aborts
 * the process, while a cut sequence is merely a shorter input; eight slow-but-legal calls can
 * otherwise add up past it.
 */
const SEQUENCE_BUDGET_MS = 6_000;
/**
 * A call worth naming in the run's account: under coverage instrumentation the first load of a
 * heavy dependency (the TypeScript compiler, behind a workbench's own compile) costs seconds
 * once per process, and a reader of a run needs to see that cost as a number rather than as a
 * soft-timeout finding it has to explain.
 */
const SLOW_CALL_MS = 1_000;
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
  inputs: 0,
  /** How many calls each input asked for, after the cap: `{1: 120, 2: 34, …}`. */
  lengths: {} as Record<number, number>,
  capped: 0,
  budgetCuts: 0,
  /** Calls at or over `SLOW_CALL_MS`, and the five slowest of them. */
  slow: 0,
  slowest: [] as { specId: string; ms: number }[],
  status: {} as Record<string, number>,
  auth: {} as Record<string, number>,
  specHits: new Set<string>(),
  signatures: new Set<string>(),
  repairs: 0,
};

const guard = installOutboundGuard();

type Rig = Awaited<ReturnType<typeof bootHarness>>;
/**
 * The rig the loop is driving — replaced by `epoch.ts` whenever its state has grown. Definite
 * assignment (`!`) because `bootRig` below is the only writer and runs before the first read;
 * TypeScript cannot see through an awaited call it is told to trust.
 */
let harness!: Rig;
/**
 * The ids the run has seen, by the key the contract gives them. Filled from every answer
 * (`captureIds`) and from the boot rows below, so a create → read sequence reaches a handler
 * with an id that names a real row.
 */
const pools: Pools = {};
const specs = httpSpecs();
/** The cookie the last login issued; a new rig has no auth session yet. */
let cookie: string | null = null;
/** The password in force — a successful `PUT /api/me/password` moves it (see `runOneCall`). */
let adminPassword = "";
/** What an idle rig looks like — one per rig, re-taken right after every boot. */
let quiet = new Quiescence();

/**
 * Boot one rig and put its premises in place: the resume rows a restart finds, the project and
 * agent every spec's contract names, and the model row a loaded Session's rebuild resolves.
 *
 * The first call is the run's first rig; `epoch.ts` calls it again whenever a rig's own history
 * has grown past the budget. A new rig means new rows: the ids the old rig answered with name
 * nothing, so the pools are emptied here.
 */
async function bootRig(): Promise<void> {
  harness = await bootHarness();
  // The SSRF bug detector would otherwise report the harness's own loopback traffic.
  await permitLoopback(harness.app.listener.port);
  cookie = null;
  adminPassword = harness.app.adminPassword;
  for (const key of Object.keys(pools)) delete pools[key as keyof Pools];
  seedResumeSessions();
  await ensureFixture();
  await ensureModelConfig();
  quiet = new Quiescence();
}
await bootRig();

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
  pools.sessionId = [...(pools.sessionId ?? []), ...RESUME_SESSION_IDS];
}

/** Provider failures the scripted model played so far (the invariant's own denominator). */
function llmFailurePlays(): number {
  return modelPlays.fail;
}

/**
 * The model every fuzz-made Session names: `fuzz-group` / `fuzz-model`. The stub serves it
 * without a key, but a Session's rebuild reads the Project config to resolve it, so the config
 * must carry the row before a loaded session can be rebuilt with the production loader.
 */
async function ensureModelConfig(): Promise<void> {
  try {
    const config = await loadProjectConfig(harness.app.root, PROJECT_ID);
    if (config.models.some((m) => m.provider === MODEL_PROVIDER && m.model_id === MODEL_ID)) return;
    await addModel(harness.app.root, PROJECT_ID, {
      provider: MODEL_PROVIDER,
      model_id: MODEL_ID,
    });
    stats.repairs += 1;
  } catch {
    // Best effort, like the fixture: a rebuild that still cannot resolve the model answers 409.
  }
}

/**
 * Re-create the project and agent every spec's premise is: one project, one agent. A DELETE
 * route that removes them is a call worth fuzzing, but a run without them is 404s, so the
 * target repairs its own fixture and counts the repair. Best effort by design — a repair that
 * fails is the target's bookkeeping, not a finding.
 */
async function ensureFixture(): Promise<void> {
  const snapshot = readSnapshot(harness.app.dbPath);
  if (snapshot.fixtureProject > 0 && snapshot.fixtureAgent > 0) return;
  const headers = {
    authorization: `Bearer ${harness.app.apiToken}`,
    "content-type": "application/json",
  };
  try {
    if (snapshot.fixtureProject === 0) {
      await harness.app.app.request("/api/projects", {
        method: "POST",
        headers,
        body: JSON.stringify({ projectId: PROJECT_ID, name: PROJECT_ID }),
      });
    }
    if (snapshot.fixtureAgent === 0) {
      await harness.app.app.request(`/api/projects/${PROJECT_ID}/agents`, {
        method: "POST",
        headers,
        body: JSON.stringify({ agentId: AGENT_ID, name: AGENT_ID }),
      });
    }
    stats.repairs += 1;
  } catch {
    // Nothing to do: the next call sees the same missing row and tries again.
  }
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

// ── Boot: one drive of each resume row, one SSE sample, and the epoch's baseline ───────────
/** The snapshot the loop is compared against: re-taken after every boot drive and the sweep. */
let baseline: DbSnapshot = readSnapshot(harness.app.dbPath);
/** The boot SSE sample, for the summary. */
let sseSample: { status: number | null; chunks: number; bytes: number } = {
  status: null,
  chunks: 0,
  bytes: 0,
};

/**
 * One rig's boot drive: the three sessions a restart finds, each driven once with a plan that
 * carries a tool call and a provider failure — the two paths the model's own bytes drive, so a
 * run that never rolls them is still honest — and one bounded read of the event stream.
 *
 * Every rig pays this: it is the premise every call's contract rests on, and it is what proves
 * a fresh rig works at all, not only the one the process booted.
 */
async function bootDrive(): Promise<void> {
  const bootBaseline = readSnapshot(harness.app.dbPath);
  // One tool call and one provider failure before the loop: the two paths the model's own bytes
  // drive are ones the boot must prove reachable, so a run that never rolls them is still honest.
  setModelPlan([
    { kind: "tool", name: "exec_command", args: { cmd: "true" } },
    { kind: "fail", error: "fuzzer boot: scripted provider failure" },
    { kind: "text", text: "fuzz boot drive" },
  ]);
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
    if (res.status >= 500) {
      throw new Error(`[api] boot drive on ${sessionId} answered ${res.status}`);
    }
  }
  resetModelPlan();
  sseSample = await sampleEventStream();
  const bootSnapshot = readSnapshot(harness.app.dbPath);
  const bootViolations = invariantViolations({
    snapshot: bootSnapshot,
    baseline: bootBaseline,
    llmFailurePlays: llmFailurePlays(),
  });
  if (bootViolations.length > 0) {
    throw new Error(`[api] the boot smoke itself broke an invariant: ${bootViolations.join("; ")}`);
  }
  // The sweep that runs on the first rig writes rows of its own; taking the baseline here keeps
  // a rotation's own drive out of the loop's account, and the first rig's is re-taken below.
  baseline = readSnapshot(harness.app.dbPath);
}

/** Commands per rig; 0 runs the whole curve on one rig (the state-growth probe's own run). */
const EPOCH_CALLS = (() => {
  const raw = Number(process.env.FUZZ_EPOCH_CALLS ?? 3_000);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 3_000;
})();

/** The rig's size, for the growth probe: Session rows are what the calls pay for. */
async function probeRig(): Promise<Record<string, number>> {
  const snapshot = readSnapshot(harness.app.dbPath);
  return { sessions: snapshot.sessions, dbBytes: databaseBytes(harness.app.dbPath) };
}

const epochs = new Epochs({
  budget: EPOCH_CALLS,
  boot: bootRig,
  setup: bootDrive,
  teardown: async () => {
    await harness.app.cleanup().catch(() => {});
  },
  settle: () => settleQuiet(quiet),
  probe: probeRig,
});
await epochs.start();

interface SweepResult {
  answered: number;
  slowest: { id: string; ms: number } | null;
  timeouts: string[];
  serverErrors: string[];
  threw: string[];
}

/** Reads first: they are what fills the id pools the writes then use. */
const SWEEP_ORDER = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/**
 * One quiet, deterministic pass over every spec, before the fuzzing loop starts.
 *
 * It pays each route's first-call cost once — a cold `GET …/workbenches` loads the workbench
 * runtime and costs more than a second, which inside the loop would read as a soft-timeout
 * finding every cycle — and it turns the spec list into a reachability reading: how many
 * specs answered, which ones refused to finish, which ones answered ≥500. Damage is recorded
 * here rather than thrown; the loop is what reports findings.
 */
async function sweepSpecs(): Promise<SweepResult> {
  const result: SweepResult = {
    answered: 0,
    slowest: null,
    timeouts: [],
    serverErrors: [],
    threw: [],
  };
  const queue = [...specs].sort(
    (a, b) => SWEEP_ORDER.indexOf(a.method) - SWEEP_ORDER.indexOf(b.method),
  );
  for (const spec of queue) {
    // No payload: this pass warms the route, it does not explore it.
    const rng = new ByteChoices(Buffer.alloc(0));
    const url = spec.url("ok", rng, "", pools);
    const headers: Record<string, string> = {
      authorization: `Bearer ${harness.app.apiToken}`,
    };
    let body: string | undefined;
    if (spec.method !== "GET" && spec.method !== "HEAD" && spec.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(spec.body("ok", rng, "", pools));
    }
    const startedAt = performance.now();
    const raced = await withSoftTimeout(
      Promise.resolve(
        harness.app.app.request(url, {
          method: spec.method,
          headers,
          ...(body === undefined ? {} : { body }),
        }),
      ),
      STEP_TIMEOUT_MS,
    );
    const ms = Math.round(performance.now() - startedAt);
    if (result.slowest === null || ms > result.slowest.ms) result.slowest = { id: spec.id, ms };
    if (!raced.ok) {
      if (raced.threw !== null) result.threw.push(`${spec.id}: ${raced.threw.message}`);
      else result.timeouts.push(`${spec.id} (${ms}ms)`);
      if (spec.method !== "GET") await ensureFixture();
      continue;
    }
    result.answered += 1;
    if (raced.value.status >= 500) result.serverErrors.push(`${spec.id} ${raced.value.status}`);
    const contentType = raced.value.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        captureIds(await raced.value.json(), pools);
      } catch {
        // A 5xx body need not parse; the status line above is the reading that matters.
      }
    }
    if (spec.method !== "GET") await ensureFixture();
  }
  return result;
}

const sweep = await sweepSpecs();
/** Everything the fuzzing loop is measured against — taken after the sweep, so the sweep's own
 * rows are the premise rather than a violation the loop would report on its first call. */
baseline = readSnapshot(harness.app.dbPath);
/** The calls that led to whatever this leg throws next — the finding kit's own record. */
const recent: { spec: string; request: string; status: number; ms: number }[] = [];
const RECENT_CALLS = 16;

/** Keep the slow calls visible: a count for the summary, the five slowest by name. */
function recordSlowCall(specId: string, ms: number): void {
  if (ms < SLOW_CALL_MS) return;
  stats.slow += 1;
  stats.slowest.push({ specId, ms });
  stats.slowest.sort((a, b) => b.ms - a.ms);
  stats.slowest.length = Math.min(stats.slowest.length, 5);
  console.log(`[api] slow call ${specId} took ${ms}ms`);
}

function describeCall(
  controls: ApiControls,
  position: number,
  total: number,
  specId: string,
  request: string,
): string {
  const flags = [
    `auth=${controls.auth}`,
    `variant=${controls.variant}`,
    controls.jump ? "clock-jump" : "clock-step",
    controls.rawBody ? "raw-body" : "json-body",
  ].join(" ");
  return `[api] call ${position}/${total} ${specId} ${request} (${flags}, payload ${controls.rest.length}B)`;
}

/**
 * One call of a sequence: decode its record, send it, check the invariants. A throw is the
 * finding — Jazzer.js turns it into a crash file and stops, so a report always names the whole
 * input (every call that led here) that broke the invariant.
 */
async function runOneCall(record: Buffer, position: number, total: number): Promise<void> {
  const controls = decodeApiControls(record, specs.length);
  const spec = specs[controls.specIndex]!;
  const call = stats.calls + 1;
  stats.calls = call;
  stats.specHits.add(spec.id);
  stats.auth[controls.auth] = (stats.auth[controls.auth] ?? 0) + 1;
  if (controls.jump) harness.clock.jumpForwardDays(CLOCK_JUMP_DAYS);
  else harness.clock.step(1_000);

  // The mocked model's turns come from the same bytes the request does (model-script.ts), so
  // a mutation that changes a request changes what the model answers.
  setModelPlan(modelScriptFor(record));
  const rng = new ByteChoices(controls.rest);
  const text = payloadText(controls.rest, 512);
  const filled = spec.url(controls.variant, rng, text, pools);
  const headers: Record<string, string> = {};
  if (controls.auth === "bearer") headers.authorization = `Bearer ${harness.app.apiToken}`;
  if (controls.auth === "cookie") {
    if (cookie === null) await login();
    if (cookie !== null) headers.cookie = cookie;
  }

  // A GET/HEAD request cannot carry a body at all (`new Request(...)` throws), so the raw-body
  // flag only applies to methods that can: it stays the way a body-parsing failure is reached
  // on a route whose contract declares no DTO.
  const canCarryBody = spec.method !== "GET" && spec.method !== "HEAD";
  let body: string | undefined;
  if (canCarryBody && (spec.body !== undefined || controls.rawBody)) {
    headers["content-type"] = "application/json";
    if (controls.rawBody) {
      // Verbatim payload: the parse-error path of readJson.
      body = text;
    } else if (spec.id === PASSWORD_ROUTE && controls.variant === "ok") {
      // The one body whose valid value is a state the driver itself holds: a password change
      // only succeeds with the password currently in force, and the success is what moves it.
      body = JSON.stringify({ oldPassword: adminPassword, newPassword: NEW_ADMIN_PASSWORD });
    } else {
      const generated = spec.body!(controls.variant, rng, text, pools);
      body = JSON.stringify(controls.variant === "ok" ? withPayload(generated, text) : generated);
    }
  }

  const where = describeCall(controls, position, total, spec.id, `${spec.method} ${filled}`);
  const callStartedAt = performance.now();
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
  recordSlowCall(spec.id, Math.round(performance.now() - callStartedAt));
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
    captureIds(json, pools);
  }
  // The stateful feed: a successful password change moves the credential the driver uses.
  if (
    spec.id === PASSWORD_ROUTE &&
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
  // A route that deleted the fixture is still a call worth fuzzing; put the premise back so
  // the rest of the run keeps reaching handlers instead of 404s.
  if (spec.method !== "GET" && (snapshot.fixtureProject === 0 || snapshot.fixtureAgent === 0)) {
    await ensureFixture();
  }

  const ms = Math.round(performance.now() - callStartedAt);
  recent.push({ spec: spec.id, request: `${spec.method} ${filled}`, status: res.status, ms });
  if (recent.length > RECENT_CALLS) recent.shift();

  // Between calls, never inside one: the rig is only replaced where the last call has already
  // been accounted for, so no input is half-run on one rig and half on the next.
  if (await epochs.afterCall(ms, ms >= SLOW_CALL_MS)) {
    // The calls before the rotation ran on a rig that no longer exists; a finding's kit names
    // only the rig it happened on.
    recent.length = 0;
    const sample = epochs.lastRotation;
    if (sample !== null) {
      console.log(
        `[api] epoch ${sample.index} closed: ${sample.commands} calls in ${sample.wallMs}ms ` +
          `(p50 ${sample.p50}ms, ${sample.slow} slow, ` +
          `${sample.quiet ? "quiet" : "STILL BUSY"}, ${sample.state.sessions ?? 0} Sessions)`,
      );
    }
  }
}

/**
 * One fuzz call: run the sequence of calls the input encodes.
 *
 * The input is `record (0x0a record)*` — see `splitRecords` for why a separator byte and not a
 * length prefix. Two bounds keep one input's cost predictable: at most `MAX_CALLS` calls, and
 * no new call once `SEQUENCE_BUDGET_MS` has gone by. An empty input asks for nothing.
 */
export async function fuzz(data: Buffer): Promise<void> {
  const all = splitRecords(data);
  if (all.length === 0) return;
  const records = all.slice(0, MAX_CALLS);
  if (all.length > MAX_CALLS) stats.capped += 1;
  stats.inputs += 1;
  stats.lengths[records.length] = (stats.lengths[records.length] ?? 0) + 1;
  const deadline = performance.now() + SEQUENCE_BUDGET_MS;
  try {
    for (const [index, record] of records.entries()) {
      if (performance.now() > deadline) {
        stats.budgetCuts += 1;
        break;
      }
      await runOneCall(record, index + 1, records.length);
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    // The replay kit (see finding.ts): the input, the calls that led here and the database they
    // ran against. Without the last of those a finding stops being reproducible the moment an
    // epoch replaces the rig — which is why it is written before anything else runs.
    writeFindingKit(OUT_DIR, {
      leg: "server",
      error,
      input: data,
      calls: recent.map(
        (call) => `${call.spec} \`${call.request}\` → ${call.status} (${call.ms}ms)`,
      ),
      state: {
        epoch: epochs.epoch,
        epochCommands: epochs.spent,
        calls: stats.calls,
        inputs: stats.inputs,
        clock: harness.clock.iso(),
      },
      dbPath: harness.app.dbPath,
    });
    throw error;
  }
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

/** `{1: 120, 3: 8}` → `1:120, 3:8`, shortest sequence first. */
function formatLengths(lengths: Record<number, number>): string {
  const entries = Object.entries(lengths).sort((a, b) => Number(a[0]) - Number(b[0]));
  if (entries.length === 0) return "-";
  return entries.map(([length, count]) => `${length}:${count}`).join(", ");
}

process.on("exit", () => {
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const summary = [
      "# API fuzz run",
      "",
      `- Calls (requests): ${stats.calls} across ${stats.inputs} inputs, sequence lengths ${formatLengths(stats.lengths)}`,
      `- Sequence bounds: ${stats.capped} input(s) cut at ${MAX_CALLS} calls, ${stats.budgetCuts} cut by the ${SEQUENCE_BUDGET_MS}ms budget`,
      `- Slow calls (≥${SLOW_CALL_MS}ms): ${stats.slow}` +
        (stats.slowest.length === 0
          ? ""
          : ` — ${stats.slowest.map((entry) => `${entry.specId} ${entry.ms}ms`).join(", ")}`),
      `- Status buckets: ${JSON.stringify(stats.status)}`,
      `- Auth rotation: ${JSON.stringify(stats.auth)}`,
      `- Distinct state signatures: ${stats.signatures.size}`,
      `- Endpoint specs hit: ${stats.specHits.size}/${specs.length}`,
      `- Spec sweep: ${sweep.answered}/${specs.length} answered, slowest ${sweep.slowest === null ? "-" : `${sweep.slowest.id} ${sweep.slowest.ms}ms`}, ` +
        `${sweep.timeouts.length} timed out, ${sweep.serverErrors.length} answered ≥500, ${sweep.threw.length} threw`,
      ...sweep.timeouts.slice(0, 10).map((entry) => `  - timeout: ${entry}`),
      ...sweep.serverErrors.slice(0, 10).map((entry) => `  - server error: ${entry}`),
      ...sweep.threw.slice(0, 10).map((entry) => `  - threw: ${entry}`),
      `- Fixture repairs: ${stats.repairs}`,
      `- Outbound attempts (non-loopback): ${guard.attempts.length}`,
      `- Boot SSE sample: status ${sseSample.status}, ${sseSample.chunks} chunks / ${sseSample.bytes}B`,
      ...epochs.report(),
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
