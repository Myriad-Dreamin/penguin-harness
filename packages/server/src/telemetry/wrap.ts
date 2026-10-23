/**
 * Telemetry's boundary probes (PRFC-0008): interfaces other modules already provide,
 * timed at the edge where consumers wire them — in this trial the edge is a rewrite of
 * the providing module's own definition (compile/telemetry.ts), so the probed modules'
 * files are not touched, they hold no clock, no scope and no sample, and the kernel is
 * not touched either: no hook, no seam.
 *
 * Every proxy copies the target's own properties — functions bound back to the target, so
 * its private state still sees the right receiver (a bare Proxy would not: a private
 * field's brand check follows `this`) — and replaces only the probed methods.
 *
 * Samples go through a ProbePort: taken before the Telemetry node exists (a reconcile the
 * boot itself starts) they are kept and handed over once the tree is up, like the boot
 * timings (telemetry/boot.ts); after that they go straight to the node, whose span and
 * record are no-ops while the switch is off.
 *
 * withTimedCreates is the same idea for boot.module: it wraps each create() in the module
 * tree a compile pass hands it — per-node boot times, no core hook.
 */
import type { ModuleDef } from "@prismshadow/penguin-core/kernel";
import type { Telemetry } from "../mechanisms/telemetry.js";
import type { TelemetryKeys, TelemetrySampleInput } from "../api/types.js";
import type { SessionLoaders, SessionServiceIface, Sessions } from "../runtime/session-manager.js";
import type { TraceIndex, Traces } from "../mechanisms/traces.js";

/** Where boundary samples go before — and after — the Telemetry node exists. */
export class ProbePort {
  #node: Telemetry | null = null;
  readonly #pending: TelemetrySampleInput[] = [];

  record(sample: TelemetrySampleInput): void {
    if (this.#node !== null) void this.#node.record(sample);
    else this.#pending.push(sample);
  }

  /** Times `run` as one `probe` sample — ok, or error when it throws — like the node's span. */
  async span<T>(
    probe: string,
    keys: TelemetryKeys,
    run: () => Promise<T>,
    describe?: (result: T) => Pick<TelemetrySampleInput, "bytes" | "attrs">,
  ): Promise<T> {
    if (this.#node !== null) return this.#node.span(probe, keys, run, describe);
    const start = performance.now();
    try {
      const result = await run();
      const extra = describe?.(result);
      this.record({ probe, durMs: performance.now() - start, status: "ok", keys, ...(extra ?? {}) });
      return result;
    } catch (err) {
      this.record({ probe, durMs: performance.now() - start, status: "error", keys });
      throw err;
    }
  }

  /** Hands the port to this generation's node; off means whatever was kept is dropped. */
  bind(node: Telemetry | null): void {
    this.#node = node;
    if (node?.on() !== true) {
      this.#pending.length = 0;
      return;
    }
    for (const sample of this.#pending) node.record(sample);
    this.#pending.length = 0;
  }
}

/** Copies `target`'s own properties (functions bound to it); `wraps` replaces some of them. */
function around<T extends object>(target: T, wraps: { [K in keyof T]?: (orig: T[K]) => T[K] }): T {
  const out: Record<string, unknown> = {};
  const byName = wraps as Record<string, ((orig: unknown) => unknown) | undefined>;
  for (const [key, value] of Object.entries(target as Record<string, unknown>)) {
    if (typeof value !== "function") {
      out[key] = value;
      continue;
    }
    const bound = value.bind(target);
    const wrap = byName[key];
    out[key] = wrap === undefined ? bound : wrap(bound);
  }
  return out as T;
}

/** What a boundary wrapper is told: the providing module, its alias, the declared interface's name. */
export interface WrapInfo {
  module: string;
  alias: string;
  iface: string;
}

/** Wraps one provided api value at its boundary — the shape a compile pass calls per target. */
export type WrapApi = (info: WrapInfo, api: unknown) => unknown;

/**
 * The boundary probes, as one wrapper factory: keyed by the provided interface's declared
 * name, so a module's own alias never matters. Unnamed interfaces pass through as they are.
 * The compile pass (compile/telemetry.ts) calls this for the defs it rewrites; nothing
 * else does — no kernel hook exists to call it.
 */
export function telemetryProbes(port: ProbePort): WrapApi {
  return (info, api) => {
    switch (info.iface) {
      // task.accept: from the door to the answer — the interface boundary IS that door,
      // the wait for the session lock included; `queued` is read off the result.
      case "Sessions":
        return around(api as Sessions, {
          startTask: (orig) => (sessionId, input, opts) =>
            port.span("task.accept", { session: sessionId }, () => orig(sessionId, input, opts), (r) => ({
              attrs: { queued: r.queued },
            })),
        });
      // session.messages: the page read a session's history window asked for. The
      // per-shard trace.read of the first slice is not visible here — one sample covers
      // the whole page read.
      case "Traces":
        return around(api as Traces, {
          readMessagesPage: (orig) => (projectId, agentId, sessionId, req) =>
            port.span("session.messages", { session: sessionId }, () => orig(projectId, agentId, sessionId, req), (r) => ({
              attrs: { kind: req.kind, messages: r.messages.length },
            })),
        });
      // trace.reconcile: one sample per pass, timed from the initiating call's door. A
      // caller that arrives while a pass is in flight piggybacks and adds none — the
      // same single-flight the module itself keeps, mirrored here. (A forced caller that
      // the module chains a second pass behind the first stays unmeasured: that chained
      // pass re-enters the module's own object, never this boundary.)
      case "TraceIndex": {
        const inflight = new Map<string, Promise<void>>();
        return around(api as TraceIndex, {
          reconcileAgent: (orig) => (projectId, agentId, opts = {}) => {
            const key = `${projectId}\0${agentId}`;
            if (inflight.has(key)) return orig(projectId, agentId, opts);
            const run = port
              .span("trace.reconcile", {}, () => orig(projectId, agentId, opts))
              .finally(() => inflight.delete(key));
            inflight.set(key, run);
            return run;
          },
        });
      }
      // sessions.list: the whole list call as one sample. The SQL/reconcile split of the
      // approved probes is inside the method; a reconcile this list triggers shows up on
      // its own (trace.reconcile shares the request's scope), so the split is still
      // readable — coarser, from the outside.
      case "SessionServiceIface":
        return around(api as SessionServiceIface, {
          listSessions: (orig) => (projectId, agentId, opts) =>
            port.span("sessions.list", {}, () => orig(projectId, agentId, opts), (r) => ({
              attrs: { rows: r.sessions.length },
            })),
        });
      // session.load: the loader a session resumes through, wrapped where it is built —
      // only the load that misses memory goes through it at all. `messages` reads the
      // core Session's own resumedHistory (core's field; the server's types never change).
      case "SessionLoaders":
        return around(api as SessionLoaders, {
          create: (orig) => (root, sources, env) => {
            const loader = orig(root, sources, env);
            return around(loader, {
              load: (inner) => (row) =>
                port.span("session.load", { session: row.sessionId }, () => inner(row), (loaded) => ({
                  attrs: {
                    messages: (loaded as { resumedHistory?: readonly unknown[] }).resumedHistory?.length ?? 0,
                  },
                })),
            });
          },
        });
      default:
        return api;
    }
  };
}

/** boot.module: every create() in the tree timed, one sample per node, from the outside. */
export function withTimedCreates(
  root: ModuleDef,
  note: (module: string, ms: number) => void,
): ModuleDef {
  const wrap = (def: ModuleDef): ModuleDef => ({
    ...def,
    async create(ctx, context) {
      const start = performance.now();
      const inst = await def.create(ctx, context);
      note(def.manifest.name, performance.now() - start);
      return inst;
    },
    ...(def.children === undefined ? {} : { children: def.children.map(wrap) }),
  });
  return wrap(root);
}
