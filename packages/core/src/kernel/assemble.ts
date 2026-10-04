/**
 * Module tree boot: manifests decide the wiring, code only provides implementations.
 *
 * {@link assemble} runs a check over the manifests first — nothing is created while a
 * problem stands — then creates modules in dependency order: a module boots after
 * everything it `requires` and after every module that contributes to one of its slots
 * WITH A CODE HALF (that half is the contributor's `bind[id]`, which exists only once the
 * contributor is created). A data-only contribution is manifest data, there before
 * anything is created, so it orders nothing — a module may declare data on a slot and
 * require the slot's owner.
 *
 * The tree shape is scope, not order: siblings are created in whatever order their edges
 * allow, and a cycle is a boot error naming the modules in it.
 *
 * Parked state: each module's `park()` result is stored under its name; the boot takes
 * that map back and hands each module its own document after running the module's
 * migrations. This is the platform node's `modules` field.
 *
 * Which check runs, whether wiring may fall back to a structural match, and how a parked
 * context is checked against its schema are the caller's {@link AssemblyRules}: the full
 * kernel's `bootModules` (./module.ts) supplies the arktype-backed ones, the runtime
 * entry's `bootVerified` (./runtime.ts) identity-only ones. This file imports no arktype.
 */
import type { Json } from "./json.js";
import { isJsonObject } from "./json.js";
import type { Resources } from "./boot.js";
import type { Manifest } from "./manifest.js";
import type { IfaceDecl, TableLike } from "./sig.js";
import { tableOf } from "./table.js";
import { ifaceKey, splitSlotKey } from "./keys.js";
import type { CheckResult, ManifestNode, Published } from "./tree.js";
import { describeProblem } from "./tree.js";
import type { Contributed, ModuleCtx, ModuleDef, ModuleInstance } from "./module-def.js";
import { ModuleBootError } from "./module-def.js";

/** A booted tree. */
export interface ModuleTree {
  /** A module's provided api by module name and alias. */
  api<T = unknown>(module: string, alias: string): T;
  has(module: string): boolean;
  /** Every module's parked document, by name — the platform node stores this. */
  park(): Record<string, Json>;
  /** Reverse creation order. */
  dispose(): void;
}

export interface BootModulesOptions {
  ifaces: TableLike;
  /** What the host publishes: interface declarations AND the live values behind them. */
  published?: { ifaces: Published; values: Record<string, Record<string, unknown>> };
  resources: Resources;
  /** Parked documents from the previous generation, by module name. */
  parked?: Record<string, Json>;
}

/** What differs between the full boot and the arktype-free one. */
export interface AssemblyRules {
  /** The check run over the manifests before anything is created; any problem refuses the boot. */
  check(tree: ManifestNode, ifaces: TableLike, published: Published): CheckResult;
  /**
   * Whether `offered` structurally satisfies `required`: the fallback when no provider
   * declares the required interface itself. Absent = wiring by identity (or by `from`) only.
   */
  satisfies?(offered: IfaceDecl, required: IfaceDecl, ifaces: TableLike): boolean;
  /**
   * Throws when a parked context does not fit its schema. Absent = a module with a context
   * schema and a parked value refuses to boot: unvalidated state is never handed over.
   */
  validateContext?(module: string, schema: Json, self: Json): void;
}

interface Flat {
  def: ModuleDef;
  parent: Flat | null;
  childrenDefs: ModuleDef[];
  /** Module names above this one; a node never wires to an ancestor (its exports are for outsiders). */
  ancestors: Set<string>;
}

type Wire = { from: string; alias: string };
type Provides = Record<string, Record<string, IfaceDecl>>;

function flatten(root: ModuleDef): { nodes: Flat[]; tree: ManifestNode } {
  const nodes: Flat[] = [];
  const walk = (def: ModuleDef, parent: Flat | null): ManifestNode => {
    const flat: Flat = {
      def,
      parent,
      childrenDefs: def.children ?? [],
      ancestors: new Set(parent ? [...parent.ancestors, parent.def.manifest.name] : []),
    };
    nodes.push(flat);
    return { manifest: def.manifest, children: flat.childrenDefs.map((c) => walk(c, flat)) };
  };
  const tree = walk(root, null);
  return { nodes, tree };
}

/**
 * The module each `requires` alias wires to, after the check has proven it resolvable. A
 * provision DECLARING the very interface (the same table entry) wins over one that merely
 * has the shape; the shape is only consulted when the rules can compare shapes. Without
 * them, a requirement naming its provider with `from` takes that provider's one provision.
 */
function wiring(
  manifest: Manifest,
  provides: Provides,
  ifaces: TableLike,
  rules: AssemblyRules,
  ancestors: ReadonlySet<string>,
): Record<string, Wire> {
  const out: Record<string, Wire> = {};
  for (const [alias, need] of Object.entries(manifest.requires)) {
    const required = tableOf(ifaces).ifaces[ifaceKey(manifest.name, need.iface)]!;
    const candidates = need.from !== undefined ? [need.from] : Object.keys(provides);
    const passes = rules.satisfies === undefined ? [true] : [true, false];
    for (const exact of passes) {
      for (const from of candidates) {
        if (from === manifest.name || ancestors.has(from)) continue;
        for (const [pAlias, decl] of Object.entries(provides[from] ?? {})) {
          if (exact ? decl === required : rules.satisfies!(decl, required, ifaces)) {
            out[alias] = { from, alias: pAlias };
            break;
          }
        }
        if (out[alias] !== undefined) break;
      }
      if (out[alias] !== undefined) break;
    }
    if (out[alias] === undefined && need.from !== undefined && rules.satisfies === undefined) {
      const offered = Object.keys(provides[need.from] ?? {});
      if (offered.length === 1) out[alias] = { from: need.from, alias: offered[0]! };
    }
    if (out[alias] === undefined) {
      throw new ModuleBootError(
        `${manifest.name}: requires.${alias} ('${need.iface}') resolves to no provider — the tree was not verified`,
      );
    }
  }
  return out;
}

function migrateContext(def: ModuleDef, doc: Json | undefined, rules: AssemblyRules): Json {
  const decl = def.manifest.context;
  if (decl === undefined || doc === undefined) return null; // No context, or a fresh boot: nothing to migrate.
  let version = 1;
  let self: Json = null;
  if (isJsonObject(doc) && typeof doc.v === "number" && "self" in doc) {
    version = doc.v;
    self = doc.self;
  } else if (doc !== undefined) {
    self = doc;
  }
  if (version > decl.version) {
    throw new ModuleBootError(
      `${def.manifest.name}: parked under context v${version}, newer than this module's v${decl.version}`,
    );
  }
  while (version < decl.version) {
    const migrate = def.migrations?.[version];
    if (migrate === undefined) {
      throw new ModuleBootError(
        `${def.manifest.name}: no context migration from v${version} to v${decl.version}`,
      );
    }
    self = migrate(self);
    version += 1;
  }
  if (decl.schema !== undefined && self !== null) {
    if (rules.validateContext === undefined) {
      throw new ModuleBootError(
        `${def.manifest.name}: parked context has a schema and this boot cannot validate it — boot through the full kernel`,
      );
    }
    rules.validateContext(def.manifest.name, decl.schema, self);
  }
  return self;
}

/** Refuses a tree whose manifests and code disagree about a node's children. */
function checkChildren(nodes: readonly Flat[]): void {
  // The manifest's `children` is the declared shape; the defs are what boots. They must
  // agree — except that a manifest listing "*" accepts modules supplied at runtime
  // beyond the ones it names (plugin modules under the platform root).
  for (const n of nodes) {
    const declared = n.def.manifest.children.map((c) => (typeof c === "string" ? c : c.keyed));
    const open = declared.includes("*");
    const named = declared.filter((c) => c !== "*").sort();
    const actual = n.childrenDefs.map((c) => c.manifest.name).sort();
    const missing = named.filter((c) => !actual.includes(c));
    const extra = actual.filter((c) => !named.includes(c));
    if (missing.length > 0 || (!open && extra.length > 0)) {
      throw new ModuleBootError(
        `${n.def.manifest.name}: manifest declares children [${declared.join(", ")}] but the code supplies [${actual.join(", ")}]`,
      );
    }
  }
}

/** Checks the tree under `rules`, resolves its wiring and creates every module in order. */
export async function assemble(
  root: ModuleDef,
  opts: BootModulesOptions,
  rules: AssemblyRules,
): Promise<ModuleTree> {
  const { nodes, tree } = flatten(root);
  checkChildren(nodes);
  const { problems, provides } = rules.check(tree, opts.ifaces, opts.published?.ifaces ?? {});
  if (problems.length > 0) {
    throw new ModuleBootError(
      `module tree rejected:\n${problems.map((p) => `  - ${describeProblem(p)}`).join("\n")}`,
      problems,
    );
  }
  const byName = new Map(nodes.map((n) => [n.def.manifest.name, n]));
  const wires = new Map<string, Record<string, Wire>>();
  for (const n of nodes)
    wires.set(
      n.def.manifest.name,
      wiring(n.def.manifest, provides, opts.ifaces, rules, n.ancestors),
    );

  /**
   * Where an exported alias actually comes from: the child declaring the interface (else,
   * when the rules compare shapes, the one child whose provision satisfies it), followed
   * through nested exports. A module's exports are a scope's outward face, not a gate — a
   * consumer waits for the child, never for the whole group, which is what keeps two
   * groups that need one another's children from being a cycle.
   */
  const exportTarget = (module: string, alias: string): { module: string; alias: string } => {
    const n = byName.get(module);
    if (n === undefined || !(n.def.manifest.exports ?? []).includes(alias))
      return { module, alias };
    const wanted = provides[module]![alias]!;
    const found: Array<{ module: string; alias: string }> = [];
    for (const exact of rules.satisfies === undefined ? [true] : [true, false]) {
      for (const child of n.childrenDefs) {
        const name = child.manifest.name;
        for (const [cAlias, decl] of Object.entries(provides[name] ?? {})) {
          if (exact ? decl === wanted : rules.satisfies!(decl, wanted, opts.ifaces)) {
            found.push({ module: name, alias: cAlias });
            break;
          }
        }
      }
      if (found.length > 0) break;
    }
    if (found.length !== 1) {
      throw new ModuleBootError(
        `${module}: exports '${alias}' but ${found.length === 0 ? "no child provides it" : `${found.map((f) => f.module).join(", ")} all do`}`,
      );
    }
    return exportTarget(found[0]!.module, found[0]!.alias);
  };

  const slotOf = (module: string, slot: string) =>
    Object.values(provides[module] ?? {})
      .map((d) => d.slots[slot])
      .find((s) => s !== undefined);

  // Edges: a module comes after what it requires (resolved through exports to the node
  // that provides it), after what contributes code to it, and after its children.
  const after = new Map<string, Set<string>>();
  for (const n of nodes) after.set(n.def.manifest.name, new Set());
  for (const n of nodes) {
    const name = n.def.manifest.name;
    for (const w of Object.values(wires.get(name)!)) {
      if (byName.has(w.from)) after.get(name)!.add(exportTarget(w.from, w.alias).module);
    }
    for (const slotKey of Object.keys(n.def.manifest.contributes)) {
      const split = splitSlotKey(slotKey)!;
      if (!byName.has(split.module)) continue;
      if (slotOf(split.module, split.slot)?.code !== undefined) after.get(split.module)!.add(name);
    }
    for (const child of n.childrenDefs) after.get(name)!.add(child.manifest.name);
  }
  const order: Flat[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (name: string, stack: string[]) => {
    const s = state.get(name);
    if (s === "done") return;
    if (s === "visiting") {
      throw new ModuleBootError(`module dependency cycle: ${[...stack, name].join(" → ")}`);
    }
    state.set(name, "visiting");
    for (const dep of after.get(name)!) visit(dep, [...stack, name]);
    state.set(name, "done");
    order.push(byName.get(name)!);
  };
  for (const n of nodes) visit(n.def.manifest.name, []);

  const instances = new Map<string, { inst: ModuleInstance; disposers: Array<() => void> }>();
  const created: string[] = [];
  const apiOf = (module: string, alias: string): unknown => {
    const inst = instances.get(module);
    if (inst !== undefined) return inst.inst.api[alias];
    const value = opts.published?.values[module]?.[alias];
    if (value === undefined) throw new ModuleBootError(`no api '${alias}' on module '${module}'`);
    return value;
  };
  /** Runs every disposer, newest first, through failures; the failures come back together. */
  const drain = (disposers: Array<() => void>): unknown[] => {
    const failures: unknown[] = [];
    for (const dispose of disposers.reverse()) {
      try {
        dispose();
      } catch (err) {
        failures.push(err);
      }
    }
    disposers.length = 0;
    return failures;
  };
  const disposeAll = () => {
    const failures: unknown[] = [];
    try {
      for (const name of [...created].reverse())
        failures.push(...drain(instances.get(name)!.disposers));
    } finally {
      created.length = 0;
      instances.clear();
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1)
      throw new AggregateError(failures, `${failures.length} disposers failed`);
  };
  try {
    for (const n of order) {
      const mf = n.def.manifest;
      const use: Record<string, unknown> = {};
      for (const [alias, w] of Object.entries(wires.get(mf.name)!)) {
        const t = exportTarget(w.from, w.alias);
        use[alias] = apiOf(t.module, t.alias);
      }
      const contributions: Record<string, Contributed[]> = {};
      for (const other of nodes) {
        for (const [slotKey, entries] of Object.entries(other.def.manifest.contributes)) {
          const split = splitSlotKey(slotKey)!;
          if (split.module !== mf.name) continue;
          const slotDecl = slotOf(mf.name, split.slot);
          const list = (contributions[split.slot] ??= []);
          const contributor = instances.get(other.def.manifest.name);
          for (const entry of entries) {
            const { id, ...data } = entry;
            const item: Contributed = { id, from: other.def.manifest.name, data };
            if (slotDecl?.code !== undefined) {
              const code = contributor?.inst.bind?.[id];
              if (code === undefined) {
                throw new ModuleBootError(
                  `${other.def.manifest.name}: contribution '${id}' to '${slotKey}' declared but not bound`,
                );
              }
              item.code = code;
            }
            list.push(item);
          }
        }
      }
      const disposers: Array<() => void> = [];
      const ctx: ModuleCtx = {
        use,
        contributions,
        resources: opts.resources,
        effect: (dispose) => disposers.push(dispose),
      };
      const context = migrateContext(n.def, opts.parked?.[mf.name], rules);
      // Effects registered while this module is being created are its own to release when
      // it fails — the outer cleanup only knows the modules that made it into `instances`.
      let inst: ModuleInstance;
      try {
        inst = await n.def.create(ctx, context);
      } catch (err) {
        drain(disposers);
        throw err;
      }
      // Exports: the alias is forwarded from the child that declares the interface — else
      // from the one child whose provision satisfies it — so the subtree offers it as one.
      for (const alias of mf.exports ?? []) {
        const t = exportTarget(mf.name, alias);
        inst.api[alias] = apiOf(t.module, t.alias);
      }
      try {
        validateApi(mf, inst, provides);
      } catch (err) {
        drain(disposers);
        throw err;
      }
      instances.set(mf.name, { inst, disposers });
      created.push(mf.name);
    }
  } catch (err) {
    try {
      disposeAll();
    } catch {
      // The original failure is what the caller needs.
    }
    throw err;
  }
  return {
    api: <T>(module: string, alias: string) => apiOf(module, alias) as T,
    has: (module) => instances.has(module),
    park() {
      const out: Record<string, Json> = {};
      for (const [name, entry] of instances) {
        const decl = byName.get(name)!.def.manifest.context;
        if (decl === undefined || entry.inst.park === undefined) continue;
        out[name] = { v: decl.version, self: entry.inst.park() };
      }
      return out;
    },
    dispose: disposeAll,
  };
}

/** A created module's api has every method and required field its provided interfaces name. */
function validateApi(mf: Manifest, inst: ModuleInstance, provides: Provides): void {
  for (const alias of Object.keys(mf.provides)) {
    const value = inst.api[alias];
    if (value === null || (typeof value !== "object" && typeof value !== "function")) {
      throw new ModuleBootError(`${mf.name}: create() returned no api for provides.${alias}`);
    }
    const decl = provides[mf.name]![alias]!;
    const missing = Object.keys(decl.methods).filter(
      (m) => typeof (value as Record<string, unknown>)[m] !== "function",
    );
    const absent = Object.entries(decl.fields ?? {})
      .filter(([, expr]) => !("maybe" in expr))
      .filter(([f]) => (value as Record<string, unknown>)[f] === undefined)
      .map(([f]) => f);
    if (missing.length > 0 || absent.length > 0) {
      throw new ModuleBootError(
        `${mf.name}: api '${alias}' does not satisfy '${decl.name}': missing [${[...missing, ...absent].join(", ")}]`,
      );
    }
  }
}
