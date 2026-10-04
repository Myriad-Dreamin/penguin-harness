/**
 * A module as the booter takes it: the {@link ModuleDef} shape, the literal form
 * (`defineModule`) and the class form (`@Module` / `@Use` / `@Provide` / `@Bind`, read back
 * by {@link moduleDefOf} against the generated manifest table). No arktype: both kernel
 * entries carry it, the arktype-free runtime (./runtime.ts) and the full kernel (./index.ts).
 */
import type { Json, JsonObject } from "./json.js";
import type { Manifest } from "./manifest.js";
import type { Resources } from "./boot.js";
import type { Problem } from "./tree.js";
import type { Meta, ModuleClass } from "./decorators.js";
import { fieldsOf, metaOf } from "./decorators.js";

/** One contribution as the consuming module receives it. */
export interface Contributed<D = JsonObject, C = unknown> {
  id: string;
  /** The contributor module's name. */
  from: string;
  data: D;
  /** The contributor's `bind[id]`, when the slot declares a code half. */
  code?: C;
}

export interface ModuleCtx<Use = Record<string, unknown>> {
  /** Resolved requirements, by the manifest's alias. */
  use: Use;
  /** Contributions to this module's slots, by slot name. */
  contributions: Record<string, Contributed[]>;
  resources: Resources;
  /** Self-cleaning registration; drained at dispose in reverse order, children first. */
  effect(dispose: () => void): void;
}

export interface ModuleInstance<Api = Record<string, unknown>> {
  /** Provided implementations, by the manifest's provides alias. */
  api: Api;
  /** Implementations of this module's own contributions, by contribution id. */
  bind?: Record<string, unknown>;
  park?(): Json;
}

export interface ModuleDef<
  M extends Manifest = Manifest,
  Use = Record<string, unknown>,
  Api = Record<string, unknown>,
> {
  manifest: M;
  /** Context migrations by from-version, chained (1→2→3). */
  migrations?: Record<number, (old: Json) => Json>;
  create(ctx: ModuleCtx<Use>, context: Json): ModuleInstance<Api> | Promise<ModuleInstance<Api>>;
  children?: ModuleDef[];
}

type RefKey<Ref, Mod extends string> = Ref extends `${string}#${string}`
  ? Ref
  : Ref extends string
    ? `${Mod}#${Ref}`
    : never;
type Lookup<Reg, K> = K extends keyof Reg ? Reg[K] : unknown;

/**
 * Interface key (`<module>#<Export>`) → TypeScript type: a registry a package
 * may declare over its interface classes, and `moduleDefiner<ThatRegistry>()` is how a manifest literal
 * gets to type its own `use` and `api`.
 */
export type IfaceRegistry = object;

/** The `use` a manifest's `requires` resolves to, by alias. */
export type UseOf<M extends Manifest, Reg extends IfaceRegistry = IfaceRegistry> = {
  [A in keyof M["requires"]]: Lookup<Reg, RefKey<M["requires"][A]["iface"], M["name"]>>;
};
/** The `api` a manifest's `provides` demands, by alias. */
export type ApiOf<M extends Manifest, Reg extends IfaceRegistry = IfaceRegistry> = {
  [A in keyof M["provides"]]: Lookup<Reg, RefKey<M["provides"][A], M["name"]>>;
};

export interface ModuleImplOf<M extends Manifest, Reg extends IfaceRegistry> {
  migrations?: Record<number, (old: Json) => Json>;
  create(
    ctx: ModuleCtx<UseOf<M, Reg>>,
    context: Json,
  ): ModuleInstance<ApiOf<M, Reg>> | Promise<ModuleInstance<ApiOf<M, Reg>>>;
  children?: ModuleDef[];
}

/**
 * A `defineModule` bound to an interface registry. A module is its manifest as a literal
 * (the static half — the generator extracts it without executing the file) and its
 * create; `use` and `api` are typed FROM the manifest through the registry, so the two
 * cannot drift: an alias renamed in `requires` is a type error at every `ctx.use.<alias>`,
 * and an interface named in `provides` is what `api` must satisfy. A key the registry
 * does not carry types as `unknown` (a plugin requiring a host interface it has no
 * types for still boots; the host checks the signature).
 */
export function moduleDefiner<Reg extends IfaceRegistry>() {
  return function defineModule<const M extends Manifest>(
    manifest: M,
    impl: ModuleImplOf<M, Reg>,
  ): ModuleDef<M, UseOf<M, Reg>, ApiOf<M, Reg>> {
    return { manifest, ...impl };
  };
}

/** `defineModule` with no registry: every requirement is `unknown` at compile time. */
export const defineModule = moduleDefiner<IfaceRegistry>();

// ───────────────────────── class form: @Module / @Use / @Provide / @Bind ─────────────────────────

// The decorators themselves live in decorators.ts (no imports, so a plugin bundles just them);
// this file reads what they recorded.
export type { ComponentMeta, IfaceClass, ModuleClass, ModuleMeta } from "./decorators.js";
export { Bind, Component, Module, Provide, Use, wire } from "./decorators.js";

/** What a module class's `create` receives: everything in {@link ModuleCtx} except `use` — requirements are fields. */
export type ClassCtx = Omit<ModuleCtx, "use">;

/** The meta a class was decorated with; throws for an undecorated class. */
export function moduleMetaOf(cls: ModuleClass): Meta {
  const m = metaOf(cls);
  if (m === undefined)
    throw new ModuleBootError(`class '${cls.name}' is not a @Module or @Component`);
  return m;
}

/** The manifests the generator extracted, by module name — the `modules` section of the table. */
export type ManifestTable = Readonly<Record<string, Manifest>>;

/**
 * Turns a module class (and, recursively, its children) into the {@link ModuleDef} the
 * booter runs. The string manifest is the generator's (`table.modules[name]` — it read the
 * field annotations statically); the class is checked against it: every `@Use` field must
 * be a requirement there with the same `from`, every `@Provide` field a provision, every
 * child class a child. A mismatch means the table is stale, and says so. `instances`
 * supplies pre-built instances for classes whose constructor takes arguments.
 */
export function moduleDefOf(
  cls: ModuleClass,
  opts: {
    manifests: ManifestTable;
    instances?: ReadonlyMap<ModuleClass, object>;
    extra?: ModuleDef[];
    /**
     * Definitions standing in for nodes, by name — an extension's replacements. A
     * replaced class is not looked at (its table entry, its fields): the definition is
     * taken as it is, and the assembled tree is what gets checked.
     */
    replace?: ReadonlyMap<string, ModuleDef>;
  },
): ModuleDef {
  const meta = moduleMetaOf(cls);
  const replacement = opts.replace?.get(meta.name);
  if (replacement !== undefined) {
    if (replacement.manifest.name !== meta.name) {
      throw new ModuleBootError(
        `replacement for '${meta.name}' is named '${replacement.manifest.name}' — a replacement keeps the name of the node it stands in for`,
      );
    }
    return replacement;
  }
  const manifest = opts.manifests[meta.name];
  if (manifest === undefined) {
    throw new ModuleBootError(`${meta.name}: not in the generated manifest table — run gen:ifaces`);
  }
  // The field decorators record a class's @Use / @Provide / @Bind fields when an instance
  // is constructed. A replacement (a test double standing in for the class) is not one,
  // so the class is probed once to learn its fields before the double is checked against
  // them; the node classes' constructors only store what they are given.
  const supplied = opts.instances?.get(cls);
  if (
    supplied !== undefined &&
    fieldsOf(cls).use.size + fieldsOf(cls).provide.size + fieldsOf(cls).bind.size === 0
  ) {
    try {
      new (cls as unknown as new () => object)();
    } catch {
      // A class that cannot be built without arguments keeps whatever was recorded.
    }
  }
  const instance = (supplied ?? new (cls as unknown as new () => object)()) as Record<
    string,
    unknown
  > & {
    setup?: (ctx: ClassCtx, context: Json) => void | Promise<void>;
    park?: () => Json;
    migrations?: Record<number, (old: Json) => Json>;
  };
  const f = fieldsOf(cls);
  const stale = (what: string) =>
    new ModuleBootError(
      `${meta.name}: ${what} — the generated manifest table is stale; run gen:ifaces`,
    );
  for (const [field, from] of f.use) {
    const r = manifest.requires[field];
    if (r === undefined) throw stale(`@Use field '${field}' is not a requirement in the table`);
    // `@Use()` with no argument leaves the wiring to the table (the generator wires a field
    // typed by a component class to that component); an explicit argument must agree.
    const fromName =
      from === undefined ? undefined : typeof from === "string" ? from : moduleMetaOf(from).name;
    if (fromName !== undefined && r.from !== fromName)
      throw stale(
        `@Use field '${field}' is wired to '${fromName}' in code, '${r.from}' in the table`,
      );
  }
  for (const field of Object.keys(manifest.requires)) {
    if (!f.use.has(field)) throw stale(`requirement '${field}' in the table has no @Use field`);
  }
  // A component's provisions are all the instance: itself, and every interface it
  // `implements` (the generator records both).
  const selfAliases = meta.kind === "component" ? Object.keys(manifest.provides) : [];
  if (meta.kind === "component" && manifest.provides[cls.name] === undefined)
    throw stale(`component '${cls.name}' does not provide itself in the table`);
  for (const field of f.provide) {
    if (manifest.provides[field] === undefined)
      throw stale(`@Provide field '${field}' is not a provision in the table`);
  }
  const forwarded = new Set(manifest.exports ?? []);
  for (const field of Object.keys(manifest.provides)) {
    if (selfAliases.includes(field) || forwarded.has(field)) continue;
    if (!f.provide.has(field))
      throw stale(`provision '${field}' in the table has no @Provide field`);
  }
  const childNames = (meta.children ?? []).map((c) => moduleMetaOf(c).name);
  const declared = manifest.children
    .map((c) => (typeof c === "string" ? c : c.keyed))
    .filter((c) => c !== "*");
  if (childNames.join(",") !== declared.join(",")) {
    throw stale(
      `children are [${childNames.join(", ")}] in code, [${declared.join(", ")}] in the table`,
    );
  }
  const extra = opts.extra ?? [];
  const def: ModuleDef = {
    manifest: {
      ...manifest,
      children: [...manifest.children.filter((c) => c !== "*"), ...(extra.length > 0 ? ["*"] : [])],
    },
    async create(ctx, context) {
      // A supplied instance (a double) keeps the fields it came with; the tree fills the
      // rest, so a double may be partial.
      for (const field of f.use.keys())
        if (supplied === undefined || instance[field] === undefined)
          instance[field] = (ctx.use as Record<string, unknown>)[field];
      if (typeof instance.setup === "function") await instance.setup(ctx, context);
      const api: Record<string, unknown> = {};
      for (const alias of selfAliases) api[alias] = instance;
      for (const field of f.provide) {
        if (instance[field] === undefined) {
          throw new ModuleBootError(
            `${meta.name}: setup() left @Provide field '${field}' unassigned`,
          );
        }
        api[field] = instance[field];
      }
      const bind: Record<string, unknown> = {};
      for (const [field, id] of f.bind) {
        if (instance[field] === undefined) {
          throw new ModuleBootError(
            `${meta.name}: create() left @Bind field '${field}' ('${id}') unassigned`,
          );
        }
        bind[id] = instance[field];
      }
      const out: ModuleInstance = { api, bind };
      if (typeof instance.park === "function") out.park = () => instance.park!();
      return out;
    },
    children: [
      ...(meta.children ?? []).map((child) => moduleDefOf(child, { ...opts, extra: undefined })),
      ...extra,
    ],
  };
  if (instance.migrations !== undefined) def.migrations = instance.migrations;
  return def;
}

export class ModuleBootError extends Error {
  constructor(
    message: string,
    readonly problems: Problem[] = [],
  ) {
    super(message);
    this.name = "ModuleBootError";
  }
}
