/**
 * Error persistence: errors caught on the server are all
 * written to error_records through here, for display on the stats dashboard. Shape
 * mirrors usage-recorder — persist only raw facts, leave aggregation to query time.
 *
 * **The classification (kind) criterion is "does a human need to step in"**, not where
 * the error originated:
 *
 * - `expected`: anticipated by the system, has a defined handling path, part of normal
 *   operation, no human needed — HTTP business errors (`HttpError`, mostly 4xx); LLM
 *   `timeout` / `malformed`, and an LLM `failed` the engine went on to retry (the engine
 *   reconnects on all three, so a request the ladder carried cost the user nothing); tool
 *   execution `failed` / `timeout` (the error is fed back to the model, and the Agent
 *   adjusts on its own).
 * - `unexpected`: shouldn't happen, usually a bug or a config/environment fault,
 *   **needs a human** — internal errors converged to 500; process crashes; runtime
 *   errors escaping from background tasks (Session drive / usage persistence / title
 *   generation / subagent registration); LLM `auth` (the credential was rejected and only
 *   a human can replace it) and an LLM `failed` the retries did not recover (the run ended
 *   on it and the user lost the turn).
 * - User-initiated actions **are not errors** and are never recorded: request/tool
 *   `aborted` (user clicked "stop", or denied a tool).
 *
 * Determination: HTTP sources are inferred automatically from `HttpError` (preserving
 * existing behavior); other sources must pass `kind` explicitly at the capture site.
 * The frontend highlights unexpected by default; expected is still recorded without
 * losing information.
 *
 * Sources cover HTTP, Session drive, LLM requests, Environment (tool execution), usage
 * persistence, title generation, subagent registration, and process-level fallback;
 * among these, `llm` / `environment` errors are not expressed via throw (core converges
 * them into the message stream instead), and are fished out by stream-error-watcher from
 * the Session output stream.
 *
 * **This recorder never throws**: it's hooked onto app.onError, and throwing from
 * within it would turn error handling into infinite recursion; if persistence itself
 * fails (disk full / DB already closed, etc.), it's fine to drop that one record.
 *
 * **Short-window dedup (DEDUP_WINDOW_MS)**: error storms are the norm — someone scanning
 * the API produces a wall of 404s, or a tool fails repeatedly in a loop. Persisting each
 * one both write-amplifies and floods the table, and makes the dashboard's "most recent
 * 20" all the same error. So the same `(source, code, Project, Session)` is persisted at
 * most once per window; repeats within the window are **dropped** (not persisted); only an
 * actual persist refreshes the timestamp, so a sustained storm leaves a steady one record
 * per window instead of being suppressed indefinitely. The Session is in the key so one
 * Session's storm never hides another Session's first occurrence of the same error.
 * **Tradeoff**: the table **underestimates** — a storm of the same error persists once
 * per window. What was dropped is counted IN MEMORY per key (`suppressed`), never written:
 * the read route answers it beside the rows, and a restart zeroes it. In exchange, a single
 * error storm doesn't drown out error_records or the stats dashboard. The second line of defense is
 * ErrorsRepo's capacity cap. The dedup table (lastSeen) must stay bounded: past
 * DEDUP_KEYS_MAX, expired entries are cleared first, and if still over the limit the
 * whole table is cleared — better to miss some dedup than let it grow unbounded across
 * different error codes.
 */
import { formatLocalDate } from "../internal/dates.js";
import { HttpError } from "../http/errors.js";
import { Component, Use } from "@prismshadow/penguin-core/kernel";
import type { Clock } from "../hmr/capabilities.js";
import type { ErrorLog, Errors } from "../mechanisms/observability.js";
import type { Telemetry } from "../mechanisms/telemetry.js";

/** Capture-site source (maps one-to-one to error_records.source). */
export type ErrorSource =
  | "http"
  | "organization"
  | "session"
  | "llm"
  | "environment"
  | "compaction"
  | "usage"
  | "title"
  | "subagent"
  | "process"
  | "schedule"
  | "messaging"
  | "id_suggest"
  /** The API socket (PRFC-0011): a call that failed inside the platform, or the socket itself. */
  | "socket"
  /** A connected machine's relay: its socket, its event stream, a terminal relayed to it. */
  | "machine"
  /** A plugin the generation's load skipped. */
  | "plugin"
  /** Reported by a browser over POST /api/errors/browser: what the server cannot see. */
  | "browser";

/** Error classification: see file header — the criterion is "does a human need to step in". */
export type ErrorKind = "expected" | "unexpected";

/** Attribution context (all optional: the login endpoint has no Project, and process-level fallback has no request at all). */
export interface ErrorContext {
  projectId?: string;
  agentId?: string;
  sessionId?: string;
  /** The Task: the timestamp of its input message — the prompt's own Trace timestamp. */
  taskId?: string;
  /** The request; absent, the recorder takes telemetry's request key (set only while telemetry is on). */
  requestId?: string;
}

export interface ErrorRecordArgs {
  source: ErrorSource;
  /** The caught error (unknown: the value caught may not be an Error; failures from the message stream pass the reason text directly). */
  err: unknown;
  ctx?: ErrorContext;
  /** Semantic code (required for non-HTTP sources, e.g. session_run_failed); defaults to HttpError.code. */
  code?: string;
  /** HTTP status code; leave empty for non-HTTP sources. */
  status?: number;
  /** Explicit classification (see file header); defaults to inferring from `HttpError` — HTTP sources rely on this, other sources should pass it explicitly. */
  kind?: ErrorKind;
  /** A stack from elsewhere (a browser's report); absent, an unexpected Error's own stack is kept. */
  stack?: string;
}

/** What the dedup dropped for one key, counted in memory only (see file header). */
export interface SuppressedCount {
  source: string;
  code: string;
  projectId: string | null;
  sessionId: string | null;
  count: number;
}

/** Which suppressed counts a read asks for: one Project (plus unattributed ones for an admin), optionally one Session. */
export interface SuppressedFilter {
  projectId: string;
  includeGlobal?: boolean;
  sessionId?: string;
}

/** Message truncation length (keep only a readable summary; the full stack is still logged). */
export const MESSAGE_MAX = 500;

/** Stack truncation: an unexpected error keeps its first STACK_MAX_LINES lines, at most STACK_MAX characters. */
export const STACK_MAX_LINES = 20;
export const STACK_MAX = 4000;

/** Short-window dedup window: the same (source, code, Project) is persisted at most once per window (see the file header's tradeoff). */
export const DEDUP_WINDOW_MS = 2000;

/** Cap on dedup table keys (bounded; over the limit, expired entries are cleared first, and if still over, the whole table is cleared). */
export const DEDUP_KEYS_MAX = 1000;

function messageOf(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.length > MESSAGE_MAX ? raw.slice(0, MESSAGE_MAX) : raw;
}

/** The stored form of a stack: the first STACK_MAX_LINES lines, cut at STACK_MAX characters. */
export function truncateStack(stack: string): string {
  const lines = stack.split("\n").slice(0, STACK_MAX_LINES).join("\n");
  return lines.length > STACK_MAX ? lines.slice(0, STACK_MAX) : lines;
}

@Component()
export class ErrorRecorder implements Errors {
  /** Dedup table: `source \0 code \0 projectId \0 sessionId` → timestamp of the last **persist** (see file header). */
  private readonly lastSeen = new Map<string, number>();
  /** What the dedup dropped, by the same key; bounded like the dedup table (see file header). */
  private readonly dropped = new Map<string, SuppressedCount>();

  @Use() private readonly errors!: ErrorLog;
  @Use() private readonly clock!: Clock;
  /** Where the request key comes from while no capture site names one; absent in a tree without telemetry. */
  @Use() private readonly telemetry?: Telemetry;

  /** Record an error (synchronous, fails silently; same-window duplicates are dropped and counted, see file header). */
  record(args: ErrorRecordArgs): void {
    try {
      const http = args.err instanceof HttpError ? args.err : null;
      const now = this.clock.now();
      const projectId = args.ctx?.projectId ?? null;
      const sessionId = args.ctx?.sessionId ?? null;
      const code = args.code ?? http?.code ?? "internal";
      // Short-window dedup, per Session: repeats within the window aren't persisted, only counted.
      const key = `${args.source}\0${code}\0${projectId ?? ""}\0${sessionId ?? ""}`;
      if (this.deduped(key, now.getTime())) {
        this.countDropped(key, { source: args.source, code, projectId, sessionId });
        return;
      }
      // Explicit classification takes priority; otherwise infer from HttpError (business error = expected, else unexpected).
      const kind = args.kind ?? (http ? "expected" : "unexpected");
      // Only an unexpected error keeps a stack: an expected one is a known path, its stack says nothing.
      const rawStack =
        kind !== "unexpected"
          ? undefined
          : (args.stack ?? (args.err instanceof Error ? args.err.stack : undefined));
      const requestId = args.ctx?.requestId ?? this.telemetry?.keys()?.request ?? null;
      this.errors.insert({
        ts: now.toISOString(),
        date: formatLocalDate(now),
        projectId,
        agentId: args.ctx?.agentId ?? null,
        sessionId,
        source: args.source,
        kind,
        code,
        // Unexpected errors from HTTP sources are converged to 500 externally (matches handleError's response).
        status: args.status ?? http?.status ?? (args.source === "http" ? 500 : null),
        message: messageOf(args.err),
        stack: rawStack !== undefined && rawStack !== "" ? truncateStack(rawStack) : null,
        taskId: args.ctx?.taskId ?? null,
        requestId,
      });
    } catch {
      // See file header: if the recorder itself errors, dropping this one record is the only option — never rethrow.
    }
  }

  /** The in-memory counts of what the dedup dropped, for the rows a read of `f` would see (see file header). */
  suppressed(f: SuppressedFilter): SuppressedCount[] {
    const out: SuppressedCount[] = [];
    for (const entry of this.dropped.values()) {
      const inProject =
        entry.projectId === f.projectId || (f.includeGlobal === true && entry.projectId === null);
      if (!inProject) continue;
      if (f.sessionId !== undefined && entry.sessionId !== f.sessionId) continue;
      out.push({ ...entry });
    }
    return out;
  }

  /** Counts one dropped record under its key; the map is bounded like the dedup table (cleared whole past the cap). */
  private countDropped(key: string, what: Omit<SuppressedCount, "count">): void {
    const entry = this.dropped.get(key);
    if (entry !== undefined) {
      entry.count += 1;
      return;
    }
    if (this.dropped.size >= DEDUP_KEYS_MAX) this.dropped.clear();
    this.dropped.set(key, { ...what, count: 1 });
  }

  /** true if a same-kind error was already recorded within the window (drop it); otherwise register this persist timestamp and keep the dedup table bounded. */
  private deduped(key: string, nowMs: number): boolean {
    const last = this.lastSeen.get(key);
    if (last !== undefined && nowMs - last < DEDUP_WINDOW_MS) return true;
    this.lastSeen.set(key, nowMs);
    if (this.lastSeen.size > DEDUP_KEYS_MAX) this.evict(nowMs);
    return false;
  }

  /** Keep the dedup table bounded (see file header): clear expired entries first; if still over the limit (hundreds/thousands of distinct error codes erupting at once), clear it entirely. */
  private evict(nowMs: number): void {
    for (const [key, at] of this.lastSeen) {
      if (nowMs - at >= DEDUP_WINDOW_MS) this.lastSeen.delete(key);
    }
    if (this.lastSeen.size > DEDUP_KEYS_MAX) this.lastSeen.clear();
  }
}

/** Minimal dependency a capture site needs on the recorder (tests inject a fake; structurally matches SessionManager's UsageRecorderLike). */
export type ErrorSink = Pick<ErrorRecorder, "record">;
