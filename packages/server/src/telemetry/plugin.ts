/**
 * Telemetry as ONE plugin (PRFC-0008), in one file: its probes, its compile pass, and
 * its registration — the module whose manifest tells a compile this pass exists.
 * (wrap.ts is gone; its two halves live here, beside the pass that calls them.)
 *
 * The pass declares the five interfaces it instruments as CLASSES (satisfyDeps maps
 * them to declared names), then rewrites the PROVIDING defs: their create() hands out
 * api values that are already probed, so every consumer wires a timed edge. The probed
 * modules' own files are not touched, and neither is the kernel: instrumentation is
 * decided when the tree is compiled, not on the wiring path and not behind a hook.
 *
 * Which probe a value gets is dispatched by the interface CLASS's identity — the same
 * handle the pass requires — so the dispatch key and the wrapper's cast are the same
 * class, and the two cannot drift apart; each arm is typed by the class it serves.
 * (What a string switch could never carry: the type of the arm it selects.)
 *
 * Placement: this file is telemetry's own half — it lives here, in telemetry/, and the
 * compile machinery it talks to (pipeline, registration slot, tree utilities) stays in
 * compile/: the module-pass feature is the kernel's neighbor, not telemetry's.
 *
 * boot.module rides the same walk: each node's create() is timed from the outside, per
 * node, no core hook, no second traversal — one rewrite visits every node once and
 * does both.
 */
import type { IfaceClass, ModuleDef } from "@prismshadow/penguin-core/kernel";
import { defineModule } from "@prismshadow/penguin-core/kernel";
import type { ModulePass, RewriteCtx } from "../compile/pipeline.js";
import { declNameOf, targetsOfDef } from "../compile/tree.js";
import { PASSES_SLOT } from "../compile/module.js";
import type { Telemetry } from "../mechanisms/telemetry.js";
import type { TelemetryKeys, TelemetrySampleInput } from "../api/types.js";
import { Sessions, SessionLoaders, SessionServiceIface } from "../runtime/session-manager.js";
import { TraceIndex, Traces } from "../mechanisms/traces.js";

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

/**
 * The boundary probes, dispatched by the interface CLASS's identity: the arm's cast and
 * its dispatch key are the same imported class, so the wrapper's type is the interface
 * the tree's table declared for that alias — checked here, at the author's elbow, not
 * reconstructed from a string at runtime. An interface this plugin does not know passes
 * through as it is.
 */
function probeBoundary(iface: IfaceClass, api: unknown, port: ProbePort): unknown {
  if (iface === Sessions) {
    // task.accept: from the door to the answer — the interface boundary IS that door,
    // the wait for the session lock included; `queued` is read off the result.
    return around(api as Sessions, {
      startTask: (orig) => (sessionId, input, opts) =>
        port.span("task.accept", { session: sessionId }, () => orig(sessionId, input, opts), (r) => ({
          attrs: { queued: r.queued },
        })),
    });
  }
  if (iface === Traces) {
    // session.messages: the page read a session's history window asked for. The
    // per-shard trace.read of the first slice is not visible here — one sample covers
    // the whole page read.
    return around(api as Traces, {
      readMessagesPage: (orig) => (projectId, agentId, sessionId, req) =>
        port.span("session.messages", { session: sessionId }, () => orig(projectId, agentId, sessionId, req), (r) => ({
          attrs: { kind: req.kind, messages: r.messages.length },
        })),
    });
  }
  if (iface === TraceIndex) {
    // trace.reconcile: one sample per pass, timed from the initiating call's door. A
    // caller that arrives while a pass is in flight piggybacks and adds none — the
    // same single-flight the module itself keeps, mirrored here. (A forced caller that
    // the module chains a second pass behind the first stays unmeasured: that chained
    // pass re-enters the module's own object, never this boundary.)
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
  if (iface === SessionServiceIface) {
    // sessions.list: the whole list call as one sample. The SQL/reconcile split of the
    // approved probes is inside the method; a reconcile this list triggers shows up on
    // its own (trace.reconcile shares the request's scope), so the split is still
    // readable — coarser, from the outside.
    return around(api as SessionServiceIface, {
      listSessions: (orig) => (projectId, agentId, opts) =>
        port.span("sessions.list", {}, () => orig(projectId, agentId, opts), (r) => ({
          attrs: { rows: r.sessions.length },
        })),
    });
  }
  if (iface === SessionLoaders) {
    // session.load: the loader a session resumes through, wrapped where it is built —
    // only the load that misses memory goes through it at all. `messages` reads the
    // core Session's own resumedHistory (core's field; the server's types never change).
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
  }
  return api;
}

/** What this plugin registers as — the id its registration names and the host resolves. */
export const TELEMETRY_PASS_ID = "telemetry";

/**
 * The interfaces this pass instruments, as the classes themselves: they are the pass's
 * `requires` (the pipeline checks them against the tree), and the dispatch table maps a
 * provided alias's declared name back to its class — the one place a name becomes a
 * class again, so the probe arms stay reachable from what the tree actually provides.
 */
const PROBE_IFACES = [Sessions, SessionServiceIface, SessionLoaders, Traces, TraceIndex] as const;
const PROBE_BY_DECL = new Map<string, IfaceClass>(
  PROBE_IFACES.map((c): [string, IfaceClass] => [declNameOf(c), c]),
);

/**
 * The pass: ONE walk of the tree, every node once. A def that provides an instrumented
 * interface has its create() wrapped so the api values it hands out come back probed; a
 * boot that wants boot.module has every create() timed — the same wrapped create does
 * both, and a tree without the required interfaces never gets here at all (the pipeline
 * skips the pass, reason kept).
 */
export function telemetryModulePass(opts: {
  /** Where boundary samples go before — and after — the Telemetry node exists. */
  port: ProbePort;
  /** boot.module: per-node create times; leave out where the boot timings are not wanted. */
  onModuleBoot?: (module: string, ms: number) => void;
}): ModulePass {
  const wanted = new Set<string>(PROBE_IFACES.map(declNameOf));
  return {
    id: TELEMETRY_PASS_ID,
    requires: PROBE_IFACES,
    rewrite(tree: ModuleDef, ctx: RewriteCtx): ModuleDef {
      const walk = (def: ModuleDef): ModuleDef => {
        const next = probeDef(def, ctx, wanted, opts);
        return {
          ...next,
          ...(next.children === undefined ? {} : { children: next.children.map(walk) }),
        };
      };
      return walk(tree);
    },
  };
}

/**
 * One node: its create() wrapped once — the probe (the api values it hands out come
 * back probed) and, when wanted, the boot.module timing, in the same wrapper. A def
 * that provides nothing instrumented and wants no timing is returned as it is. The
 * group that merely EXPORTS a target resolves to the same interface name; its own
 * create never fills that alias, so the wrap finds no value and does nothing — the
 * child's probed value is what the kernel's export forwarding hands onward, and every
 * consumer sees the same wrapped object, once.
 */
function probeDef(
  def: ModuleDef,
  ctx: RewriteCtx,
  wanted: ReadonlySet<string>,
  opts: { port: ProbePort; onModuleBoot?: (module: string, ms: number) => void },
): ModuleDef {
  const { port, onModuleBoot } = opts;
  const targets = targetsOfDef(def, ctx.ifaces, wanted);
  if (targets.length === 0 && onModuleBoot === undefined) return def;
  return {
    ...def,
    async create(innerCtx, context) {
      const start = onModuleBoot !== undefined ? performance.now() : 0;
      const inst = await def.create(innerCtx, context);
      if (onModuleBoot !== undefined) onModuleBoot(def.manifest.name, performance.now() - start);
      const api = inst.api as Record<string, unknown>;
      for (const t of targets) {
        const iface = PROBE_BY_DECL.get(t.iface);
        if (iface === undefined) continue;
        const value = api[t.alias];
        if (value !== undefined) api[t.alias] = probeBoundary(iface, value, port);
      }
      return inst;
    },
  };
}

/**
 * The plugin's module: its manifest registers the pass — one line of data — with
 * CompileModule's `passes` slot, so WHAT a tree compiles with is declared in the tree
 * and checked with it. The code half cannot travel with the data (bind hands a
 * contributor its contribution inside create(), and the compile runs before the first
 * create()), which is why the host resolves the id; the module itself needs no api.
 * Pre-gen note: like every new module in this trial, the table entry — and the slot's
 * schema — that the checker wants for this registration exist only after gen:ifaces
 * runs; until then the checker reports it, as it reports the trial's other new nodes.
 */
export const telemetryPluginDef = (): ModuleDef =>
  defineModule(
    {
      name: "TelemetryPlugin",
      requires: {},
      provides: {},
      contributes: { [PASSES_SLOT]: [{ id: TELEMETRY_PASS_ID }] },
      children: [],
    },
    { create: () => ({ api: {} }) },
  );
