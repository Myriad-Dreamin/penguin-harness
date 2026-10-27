/**
 * API cross-section sequence generator (DESIGN.md §5.1): drives the assembled app through a
 * deterministic, seeded request sequence — the request serialization format the board named
 * ("api 的 serialization 格式是对应的 request") — and checks three invariants after every step.
 *
 * The generator itself is only domain corpus orchestration (weighted pick over the endpoint
 * table, ok/bad body variants, pool state for :params, credential rotation); everything the
 * steps hit is the repo's own production code path: Hono routing, validate.ts, the services,
 * the SessionManager driving the fake loader's scripted sessions, SQLite persistence.
 *
 * Invariants (a violation is a finding, recorded and the run continues):
 *  1. app.request never throws — an exception escaping a handler to the caller is a finding.
 *  2. no process-level error rows appear in error_records (source='process', or code
 *     uncaught_exception / unhandled_rejection): the harness must contain every input.
 *  3. no unexpected-kind error rows outside the fuzzer's own contract-visible injections:
 *     source='llm' rows are allowed only up to the count the FuzzerLLM scripts actually
 *     played (failurePlays); anything else with kind='unexpected' is a real defect surfaced
 *     by the sequence.
 *
 * State introspection (§6.1 R-5): after every step a second, read-only SQLite connection
 * counts the resource tables, plus GET /api/version and the FuzzerClock day, producing a
 * bucketed state signature; new signatures are counted (sequence diversity metric).
 */
import fs from "node:fs/promises";
import {
  openDatabaseReadOnly,
  openExistingDatabase,
} from "../../../../packages/server/src/db/database.js";
import type { DemoApp } from "./assemble.js";
import {
  apiCorpus,
  fillPath,
  type ApiCallSpec,
  type ApiGenCtx,
  type Pools,
  type Variant,
} from "./corpus.js";
import type { Finding } from "./finding.js";
import { Rng } from "./rng.js";
import { serializeLine, tokensOf } from "./serialize.js";

/** Plan's scale ceiling for this leg: at most this many steps, single process, no network. */
export const API_STEP_BUDGET = 300;
/** Per-step soft timeout: a step that outlives it is a finding, not a hang. */
const STEP_SOFT_TIMEOUT_MS = 5_000;
/** Every N steps the FuzzerClock jumps 31 days — across the 30-day auth-session TTL boundary. */
const CLOCK_JUMP_EVERY = 40;
const CLOCK_JUMP_DAYS = 31;
/** Fixed seed: the whole sequence is reproducible byte-for-byte. */
export const API_SEED = 0x5eed_0262;
const SSE_READ_CAP_MS = 1_500;

export interface ApiLegResult {
  steps: number;
  signatures: number;
  findings: Finding[];
  specHits: Map<string, number>;
  statusCounts: Record<string, number>;
  authModeCounts: Record<string, number>;
  reLogins: number;
  llmFailurePlays: number;
  llmFailureRows: number;
}

interface DbSnapshot {
  projects: number;
  agents: number;
  sessions: number;
  scheduleState: number;
  usage: number;
  errTotal: number;
  errUnexpected: number;
  errUnexpectedNonLlm: number;
  errProcess: number;
  errUncaught: number;
  errUnhandled: number;
  errLlmUnexpected: number;
}

const SNAPSHOT_SQL = `
SELECT
  (SELECT COUNT(*) FROM projects) AS projects,
  (SELECT COUNT(*) FROM agents) AS agents,
  (SELECT COUNT(*) FROM sessions) AS sessions,
  (SELECT COUNT(*) FROM schedule_state) AS scheduleState,
  (SELECT COUNT(*) FROM usage_records) AS usage,
  (SELECT COUNT(*) FROM error_records) AS errTotal,
  (SELECT COUNT(*) FROM error_records WHERE kind='unexpected') AS errUnexpected,
  (SELECT COUNT(*) FROM error_records WHERE kind='unexpected' AND source<>'llm') AS errUnexpectedNonLlm,
  (SELECT COUNT(*) FROM error_records WHERE source='process') AS errProcess,
  (SELECT COUNT(*) FROM error_records WHERE code='uncaught_exception') AS errUncaught,
  (SELECT COUNT(*) FROM error_records WHERE code='unhandled_rejection') AS errUnhandled,
  (SELECT COUNT(*) FROM error_records WHERE source='llm' AND kind='unexpected') AS errLlmUnexpected
`;

function readSnapshot(dbPath: string): DbSnapshot {
  const db = openDatabaseReadOnly(dbPath);
  try {
    const row = db.prepare(SNAPSHOT_SQL).get() as unknown as DbSnapshot;
    return row;
  } finally {
    db.close();
  }
}

/** One serialized request (the artifact out/api-sequence.jsonl is made of these). */
interface SequenceLine {
  step: number;
  spec: string;
  request: {
    method: string;
    path: string;
    auth: "anon" | "cookie" | "bearer";
    body?: unknown;
  };
  observed: {
    status: number | null;
    ms: number | null;
    note?: string;
  };
}

export function withSoftTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<{ ok: true; value: T } | { ok: false; threw: Error | null }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The guarded chain always settles, so a rejection that arrives after the race was
  // decided by the timer cannot become an unhandledRejection (the crash face this demo
  // exists to keep impossible).
  const guarded = promise.then(
    (value) => ({ ok: true as const, value, threw: null as Error | null }),
    (err: unknown) => ({
      ok: false as const,
      value: undefined as T | undefined,
      threw: err instanceof Error ? err : new Error(String(err)),
    }),
  );
  const timeout = new Promise<{ ok: false; value: undefined; threw: null }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, value: undefined, threw: null }), ms);
  });
  return Promise.race([guarded, timeout]).finally(() => clearTimeout(timer));
}

export async function runApiLeg(
  app: DemoApp,
  loader: { loaded: Array<{ llm: { failurePlays: number } }> },
  outDir: string,
  transcriptLines: string[],
): Promise<ApiLegResult> {
  const rng = new Rng(API_SEED);
  const corpus = apiCorpus("default_project", "default_agent");
  const totalWeight = corpus.reduce((acc, spec) => acc + spec.weight, 0);
  const weightedPick = (): ApiCallSpec => {
    let dart = rng.next() * totalWeight;
    for (const spec of corpus) {
      dart -= spec.weight;
      if (dart <= 0) return spec;
    }
    return corpus[corpus.length - 1]!;
  };

  const pools: Pools = { projects: [], agents: [], sessions: [], schedules: [], users: [] };
  const findings: Finding[] = [];
  const specHits = new Map<string, number>();
  const statusCounts: Record<string, number> = {};
  const authModeCounts: Record<string, number> = {};
  const lines: SequenceLine[] = [];
  const signatures = new Set<string>();

  let cookie: string | null = null;
  let reLogins = 0;
  // The admin password the driver currently believes in — the corpus's me.password.put ok
  // variant changes it, and a stateful sequence feeds itself: the driver adopts the new
  // value so later logins (and later password changes' oldPassword) stay valid.
  let adminPassword = app.adminPassword;

  // Resume-path seed: a session row the harness did NOT create through sessionService (the
  // shape a restart finds in the index). createSession adopts a real core Session built over
  // the scripted mmsp stub; a bare row is the one path that loads through the fake
  // SessionLoader instead — so the sequence seeds one, the same narrow-write way the CLI's
  // auth token writes its row (openExistingDatabase: no schema work), and the session.*
  // specs drive it into the FuzzerLLM script rotation (text / tool_call / request_fail).
  const resumeSessionIds = [
    "session-2026-10-26-00-00-00-fuzzresume1",
    "session-2026-10-26-00-00-00-fuzzresume2",
    "session-2026-10-26-00-00-00-fuzzresume3",
  ];
  {
    const db = openExistingDatabase(app.dbPath);
    try {
      const insert = db.prepare(
        `INSERT OR REPLACE INTO sessions
         (session_id, project_id, agent_id, provider, model_id, workspace, approval_mode, created_at, last_active_at, has_trace)
         VALUES (?, 'default_project', 'default_agent', 'fuzz-group', 'fuzz-model', ?, 'allow-all', ?, ?, 0)`,
      );
      for (const id of resumeSessionIds) insert.run(id, app.root, app.clock.iso(), app.clock.iso());
    } finally {
      db.close();
    }
    // Three rows, so the loader's script rotation reaches all three plays: text, a tool
    // call, and one contract-visible LLM failure (the request_fail turn the invariants
    // account for against failurePlays).
    pools.sessions.push(...resumeSessionIds);
  }

  const versionIdentity = async (): Promise<string> => {
    const res = await app.app.request("/api/version", {
      headers: { authorization: `Bearer ${app.apiToken}`, "content-type": "application/json" },
    });
    if (!res.ok) return `unreachable(${res.status})`;
    const json = (await res.json()) as { version?: string; describe?: string };
    return `${json.version ?? "?"}/${json.describe ?? "?"}`;
  };

  const login = async (step: number): Promise<boolean> => {
    try {
      const res = await app.app.request("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "admin", password: adminPassword }),
      });
      if (res.status !== 200) return false;
      cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? null;
      reLogins += 1;
      return true;
    } catch (err) {
      findings.push({
        leg: "api",
        step,
        kind: "login_threw",
        detail: `login request threw: ${err instanceof Error ? err.message : String(err)}`,
      });
      return false;
    }
  };

  // Baselines are taken after seedAdmin: a fresh DB should hold no error rows at all, so any
  // growth is attributable to the sequence's own steps.
  const baseline = readSnapshot(app.dbPath);
  if (
    baseline.errProcess + baseline.errUncaught + baseline.errUnhandled + baseline.errUnexpected >
    0
  ) {
    findings.push({
      leg: "api",
      step: 0,
      kind: "baseline_not_clean",
      detail: `error_records is not empty before the first step: ${JSON.stringify(baseline)}`,
    });
  }

  // Guaranteed resume-path drive: the weighted dice may never land a task on a seed row, so
  // each seed gets one scripted task up front — the fake loader loads all three, and the
  // FuzzerLLM rotation plays text, a tool call, and one contract-visible failure.
  let seedStep = 0;
  for (const seedId of resumeSessionIds) {
    seedStep += 1;
    const seedBody = {
      input: [{ type: "text", text: `fuzz resume seed task ${seedStep}` }],
      queueIfBusy: true,
    };
    const res = await app.app.request(`/api/sessions/${encodeURIComponent(seedId)}/tasks`, {
      method: "POST",
      headers: { authorization: `Bearer ${app.apiToken}`, "content-type": "application/json" },
      body: JSON.stringify(seedBody),
    });
    lines.push({
      step: seedStep,
      spec: "session.task.resume-seed",
      request: {
        method: "POST",
        path: `/api/sessions/${seedId}/tasks`,
        auth: "bearer",
        body: seedBody,
      },
      observed: {
        status: res.status,
        ms: null,
        note: "guaranteed resume-path step (drives the fake SessionLoader)",
      },
    });
    app.clock.step(1_000);
  }

  const checkInvariants = (step: number, snap: DbSnapshot): void => {
    if (snap.errProcess > baseline.errProcess) {
      findings.push({
        leg: "api",
        step,
        kind: "invariant_process_error",
        detail: `error_records gained source='process' rows: ${baseline.errProcess} → ${snap.errProcess}`,
      });
    }
    if (snap.errUncaught > baseline.errUncaught || snap.errUnhandled > baseline.errUnhandled) {
      findings.push({
        leg: "api",
        step,
        kind: "invariant_uncaught",
        detail: `uncaught_exception/unhandled_rejection rows appeared: ${snap.errUncaught}/${snap.errUnhandled}`,
      });
    }
    if (snap.errUnexpectedNonLlm > baseline.errUnexpectedNonLlm) {
      findings.push({
        leg: "api",
        step,
        kind: "invariant_unexpected_error",
        detail: `kind='unexpected' rows outside the injected source='llm' bucket: ${baseline.errUnexpectedNonLlm} → ${snap.errUnexpectedNonLlm}`,
      });
    }
    const played = loader.loaded.reduce((acc, entry) => acc + entry.llm.failurePlays, 0);
    // Dedup (source, code, project) means rows ≤ plays always; rows > plays means a failure
    // the fuzzer did not script reached the record.
    if (snap.errLlmUnexpected > played) {
      findings.push({
        leg: "api",
        step,
        kind: "invariant_llm_over_budget",
        detail: `source='llm' unexpected rows (${snap.errLlmUnexpected}) exceed the scripted failure plays (${played})`,
      });
    }
  };

  const sseStep = async (step: number): Promise<void> => {
    const controller = new AbortController();
    const cap = setTimeout(() => controller.abort(), SSE_READ_CAP_MS);
    let bytes = 0;
    let chunks = 0;
    let status: number | null = null;
    try {
      // localhost, not 127.0.0.1: the canonical-host guard treats 127.0.0.1 as the preview host.
      const res = await fetch(`http://localhost:${app.listener.port}/api/events`, {
        headers: { authorization: `Bearer ${app.apiToken}`, accept: "text/event-stream" },
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
          if (bytes > 32_768) break; // bounded read: sample the stream, then stop
        }
        reader.cancel().catch(() => {});
      }
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      if (!aborted) {
        findings.push({
          leg: "api",
          step,
          kind: "sse_threw",
          detail: `SSE read failed outside the abort: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      // The cap firing IS the bounded-read contract doing its job (a live event stream only
      // ends when a client stops reading) — the line records what was sampled either way.
    } finally {
      clearTimeout(cap);
      controller.abort();
      lines.push({
        step,
        spec: "events.sse",
        request: { method: "GET", path: "/api/events", auth: "bearer" },
        observed: {
          status,
          ms: null,
          note: `${chunks} chunks / ${bytes}B sampled then aborted (cap ${SSE_READ_CAP_MS}ms)`,
        },
      });
    }
  };

  for (let step = seedStep + 1; step <= API_STEP_BUDGET; step++) {
    if (step % CLOCK_JUMP_EVERY === 0) app.clock.jumpForwardDays(CLOCK_JUMP_DAYS);
    const spec = weightedPick();
    specHits.set(spec.id, (specHits.get(spec.id) ?? 0) + 1);

    if (spec.id === "events.sse") {
      authModeCounts.bearer = (authModeCounts.bearer ?? 0) + 1;
      await sseStep(step);
      app.clock.step(1_000);
      continue;
    }

    const ctx: ApiGenCtx = { rng, pools, step, password: adminPassword };
    const variant: Variant = rng.chance(0.25) ? "bad" : "ok";
    const auth: SequenceLine["request"]["auth"] =
      step % 3 === 0 ? "anon" : step % 3 === 1 ? "bearer" : "cookie";
    authModeCounts[auth] = (authModeCounts[auth] ?? 0) + 1;
    const filled = fillPath(spec, ctx, "default_project", "default_agent");
    const body = spec.body?.(variant, ctx);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (auth === "bearer") headers.authorization = `Bearer ${app.apiToken}`;
    if (auth === "cookie") {
      if (cookie === null && !(await login(step))) {
        findings.push({
          leg: "api",
          step,
          kind: "login_failed",
          detail: "cookie-mode step could not log in",
        });
      }
      if (cookie !== null) headers.cookie = cookie;
    }

    const t0 = performance.now();
    let status: number | null = null;
    let ms: number | null = null;
    let note: string | undefined;
    const raced = await withSoftTimeout(
      // Hono's `request()` is typed `Response | Promise<Response>`; the soft timeout races a
      // promise, so normalise here.
      Promise.resolve(
        app.app.request(filled, {
          method: spec.method,
          headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      ),
      STEP_SOFT_TIMEOUT_MS,
    );
    ms = Math.round(performance.now() - t0);
    if (!raced.ok && raced.threw !== null) {
      // Invariant 1: an exception escaping app.request is a finding; the run continues.
      findings.push({
        leg: "api",
        step,
        kind: "request_threw",
        detail: `${spec.method} ${filled} threw: ${raced.threw.message}`,
      });
    } else if (!raced.ok) {
      findings.push({
        leg: "api",
        step,
        kind: "step_timeout",
        detail: `${spec.method} ${filled} exceeded the ${STEP_SOFT_TIMEOUT_MS}ms soft timeout`,
      });
    } else {
      const res = raced.value;
      status = res.status;
      statusCounts[String(status)] = (statusCounts[String(status)] ?? 0) + 1;
      if (auth === "cookie" && status === 401) {
        // The TTL jump expired the auth session: re-login and note it (the 401 itself is the
        // TTL-expiry path being exercised, not a finding).
        cookie = null;
        note = "401 after TTL jump — re-login next cookie step";
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        try {
          const json = await res.json();
          spec.capture?.(json, pools);
        } catch (err) {
          findings.push({
            leg: "api",
            step,
            kind: "response_parse_threw",
            detail: `${spec.method} ${filled}: response.json() threw ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
      // The stateful-sequence feed: a successful password change moves the driver's notion
      // of the credential forward, so the sequence's own later logins stay valid.
      if (
        spec.id === "me.password.put" &&
        variant === "ok" &&
        res.status >= 200 &&
        res.status < 300
      ) {
        adminPassword = "penguin-0001";
      }
    }

    lines.push({
      step,
      spec: spec.id,
      request: { method: spec.method, path: filled, auth, ...(body === undefined ? {} : { body }) },
      observed: { status, ms: Math.round(ms), ...(note !== undefined ? { note } : {}) },
    });

    app.clock.step(1_000);

    // Introspection + invariants + state signature (§6.1): read-only second connection.
    try {
      const snap = readSnapshot(app.dbPath);
      checkInvariants(step, snap);
      const version = await versionIdentity();
      signatures.add(
        `p${snap.projects}|a${snap.agents}|s${snap.sessions}|h${snap.scheduleState}|u${snap.usage}|e${snap.errTotal}|x${snap.errUnexpected}|v=${version}|d=${app.clock.iso().slice(0, 10)}`,
      );
    } catch (err) {
      findings.push({
        leg: "api",
        step,
        kind: "introspection_threw",
        detail: `read-only snapshot failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  const finalSnap = readSnapshot(app.dbPath);
  checkInvariants(API_STEP_BUDGET, finalSnap);

  await fs.mkdir(outDir, { recursive: true });
  // Captured ids and the disposable root are written as their provenance and timing stays
  // in this transcript, so the same seed writes the same bytes (see serialize.ts).
  const tokens = tokensOf(pools, app.root);
  const jsonl = lines.map((line) => serializeLine(line, tokens)).join("\n") + "\n";
  await fs.writeFile(`${outDir}/api-sequence.jsonl`, jsonl, "utf8");

  transcriptLines.push(
    `## API cross-section (${lines.length} steps, request serialization format)`,
    "",
  );
  transcriptLines.push(
    "Every line of \`api-sequence.jsonl\` is one serialized request (method/path/auth/body) plus what the server answered — the seed is fixed, the sequence is reproducible: ids captured from earlier responses appear as their provenance (\`$sessions[0]\`) and the disposable root as \`$root\`, while the wall-clock \`ms\` column below stays out of the sequence.",
    "",
    `Resume-path seed: 3 session rows inserted straight into the index (openExistingDatabase, the CLI auth-token write path) — the only path the fake SessionLoader serves; the corpus's session.* specs drive them through the FuzzerLLM script rotation.`,
    "",
  );
  transcriptLines.push(
    "| step | spec | method | path | auth | status | ms |",
    "|---|---|---|---|---|---|---|",
  );
  for (const line of lines) {
    const shortPath =
      line.request.path.length > 58 ? `${line.request.path.slice(0, 55)}…` : line.request.path;
    transcriptLines.push(
      `| ${line.step} | ${line.spec} | ${line.request.method} | \`${shortPath}\` | ${line.request.auth} | ${line.observed.status ?? "—"} | ${line.observed.ms ?? "—"} |`,
    );
  }
  transcriptLines.push("");
  transcriptLines.push(
    `- Status buckets: ${Object.entries(statusCounts)
      .sort()
      .map(([s, n]) => `${s}×${n}`)
      .join(", ")}`,
    `- Auth rotation: anon×${authModeCounts.anon ?? 0}, bearer×${authModeCounts.bearer ?? 0}, cookie×${authModeCounts.cookie ?? 0}; cookie re-logins: ${reLogins}`,
    `- Distinct bucketed state signatures: ${signatures.size}`,
    `- Endpoint specs hit: ${specHits.size}/${corpus.length}`,
    `- error_records: total=${finalSnap.errTotal} unexpected=${finalSnap.errUnexpected} (llm-injected=${finalSnap.errLlmUnexpected}, other=${finalSnap.errUnexpectedNonLlm}) process=${finalSnap.errProcess}`,
    `- Resource pools at end: projects=${pools.projects.length} agents=${pools.agents.length} sessions=${pools.sessions.length} schedules=${pools.schedules.length} users=${pools.users.length}`,
    "",
  );

  return {
    steps: lines.length,
    signatures: signatures.size,
    findings,
    specHits,
    statusCounts,
    authModeCounts,
    reLogins,
    llmFailurePlays: loader.loaded.reduce((acc, entry) => acc + entry.llm.failurePlays, 0),
    llmFailureRows: finalSnap.errLlmUnexpected,
  };
}
