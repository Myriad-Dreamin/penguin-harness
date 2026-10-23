/**
 * Telemetry as a plugin pass (PRFC-0008): the compile-time form of the boundary probes.
 *
 * The pass declares the five interfaces it instruments (satisfyDeps: a tree without
 * them — a bare kernel, a stripped test tree — skips telemetry with the reason kept,
 * instead of failing or silently half-working), then rewrites the PROVIDING defs: their
 * create() hands out api values that are already probed (telemetry/wrap.ts proxies), so
 * every consumer wires a timed edge. The probed modules' own files are not touched,
 * and neither is the kernel: instrumentation is decided when the tree is compiled,
 * not on the wiring path and not behind a hook.
 *
 * boot.module rides the same pass (withTimedCreates): each node's create() is timed
 * from the outside, per node, no core hook.
 */
import type { ModuleDef, TableLike } from "@prismshadow/penguin-core/kernel";
import type { RewriteCtx, TreePass } from "./pipeline.js";
import { targetsOfDef } from "./tree.js";
import {
  ProbePort,
  telemetryProbes,
  withTimedCreates,
  type WrapInfo,
} from "../telemetry/wrap.js";

/** The interfaces this pass instruments, by their declared names — its dependencies. */
const PROBE_IFACES = [
  "Sessions",
  "Traces",
  "TraceIndex",
  "SessionServiceIface",
  "SessionLoaders",
] as const;

export function telemetryPass(opts: {
  /** Where boundary samples go before — and after — the Telemetry node exists. */
  port: ProbePort;
  /** boot.module: per-node create times; leave out where the boot timings are not wanted. */
  onModuleBoot?: (module: string, ms: number) => void;
}): TreePass {
  return {
    name: "telemetry",
    requires: PROBE_IFACES,
    rewrite(tree: ModuleDef, ctx: RewriteCtx): ModuleDef {
      const probe = telemetryProbes(opts.port);
      const wanted = new Set<string>(PROBE_IFACES);
      const wrap = (def: ModuleDef): ModuleDef => {
        const next =
          targetsOfDef(def, ctx.ifaces, wanted).length > 0
            ? probeCreate(def, probe, ctx.ifaces, wanted)
            : def;
        return {
          ...next,
          ...(next.children === undefined ? {} : { children: next.children.map(wrap) }),
        };
      };
      const probed = wrap(tree);
      return opts.onModuleBoot === undefined ? probed : withTimedCreates(probed, opts.onModuleBoot);
    },
  };
}

/**
 * One providing def, its create() wrapped so the api values it hands out come back
 * probed. The group that merely EXPORTS a target resolves to the same interface name;
 * its own create never fills that alias, so the wrap finds no value and does nothing —
 * the child's probed value is what the kernel's export forwarding hands onward, and
 * every consumer sees the same wrapped object, once.
 */
function probeCreate(
  def: ModuleDef,
  probe: (info: WrapInfo, api: unknown) => unknown,
  table: TableLike,
  wanted: ReadonlySet<string>,
): ModuleDef {
  const targets = targetsOfDef(def, table, wanted);
  return {
    ...def,
    async create(ctx, context) {
      const inst = await def.create(ctx, context);
      const api = inst.api as Record<string, unknown>;
      for (const t of targets) {
        const value = api[t.alias];
        if (value !== undefined) {
          api[t.alias] = probe({ module: def.manifest.name, alias: t.alias, iface: t.iface }, value);
        }
      }
      return inst;
    },
  };
}
