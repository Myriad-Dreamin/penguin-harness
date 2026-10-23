/**
 * The module tree as the compile pipeline sees it: manifests are the program, create()
 * functions are opaque leaves, and every question the pipeline asks — which interfaces
 * a def provides, which modules exist, what the checker will see — is answered from
 * that data alone, never by executing anything.
 *
 * The kernel owns the shapes (ModuleDef, Manifest, IfaceDecl); nothing here touches
 * them — the pipeline is a consumer of the tree, not an extension of the kernel.
 */
import type {
  IfaceClass,
  IfaceDecl,
  ManifestNode,
  ModuleDef,
  TableLike,
} from "@prismshadow/penguin-core/kernel";
import { ifaceKey, tableOf } from "@prismshadow/penguin-core/kernel";

/** Depth-first over the tree, each parent before its children. */
export function* walkDefs(def: ModuleDef): IterableIterator<ModuleDef> {
  yield def;
  for (const child of def.children ?? []) yield* walkDefs(child);
}

/**
 * An interface class's declared name — the word the generator read off the source into
 * the table (`symbol.getName()`), which for the code as it ships is the class's own
 * `.name`. That is the one soft edge in requiring by class instead of by string: a
 * minifier that renames the binding changes `.name` with it, and two same-named
 * classes collide. The kernel's own node names dodge this with the decorator context's
 * `name` (a string literal the minifier cannot touch); the thorough fix on this edge is
 * the generator's — stamp the table key onto the class it projects, and read it here.
 * Until then the name is the bridge between a pass's `requires` (classes) and the
 * tree's provisions (declared names, from the table).
 */
export function declNameOf(cls: IfaceClass): string {
  return cls.name;
}

/**
 * A fresh def per node — the pipeline's hand to a pass, so the pass can hold its input
 * (or hand it back) without any later pass seeing a mutation of an earlier snapshot.
 * Manifests are copied shallowly: the records inside (requires/provides/contributes)
 * are still shared with the earlier tree, so a pass that rewrites manifest DATA must
 * copy what it changes — the passes in this trial only add create() wrappers, and the
 * contract below says so out loud.
 */
export function copyTree(def: ModuleDef): ModuleDef {
  const copy = (d: ModuleDef): ModuleDef => ({
    ...d,
    manifest: { ...d.manifest },
    ...(d.children === undefined ? {} : { children: d.children.map(copy) }),
  });
  return copy(def);
}

/** The tree as the kernel's checker takes it: manifests only, no code halves. */
export function manifestTreeOf(def: ModuleDef): ManifestNode {
  return {
    manifest: def.manifest,
    children: (def.children ?? []).map(manifestTreeOf),
  };
}

/**
 * Which of a def's provided aliases declare one of `wanted` interface names — a
 * providing def's targets, by alias. Exported aliases of a group resolve to the same
 * names (the generator records a forwarded alias under the child's interface), so a
 * group whose own create never fills them is matched too; callers act only on values
 * that exist.
 */
export function targetsOfDef(
  def: ModuleDef,
  table: TableLike,
  wanted: ReadonlySet<string>,
): Array<{ alias: string; iface: string }> {
  const out: Array<{ alias: string; iface: string }> = [];
  const ifaces = tableOf(table).ifaces;
  for (const [alias, ref] of Object.entries(def.manifest.provides)) {
    const decl: IfaceDecl | undefined = ifaces[ifaceKey(def.manifest.name, ref)];
    if (decl !== undefined && wanted.has(decl.name)) out.push({ alias, iface: decl.name });
  }
  return out;
}

/**
 * Every interface name the tree provides, resolved through the table — satisfyDeps'
 * answer for a pass: "is what I require somewhere in the tree I was handed?" Names,
 * not modules: who provides it is the kernel's wiring decision to make, not the
 * pass's to need.
 */
export function providedIfaceNames(def: ModuleDef, table: TableLike): Set<string> {
  const out = new Set<string>();
  const ifaces = tableOf(table).ifaces;
  for (const d of walkDefs(def)) {
    for (const ref of Object.values(d.manifest.provides)) {
      const decl: IfaceDecl | undefined = ifaces[ifaceKey(d.manifest.name, ref)];
      if (decl !== undefined) out.add(decl.name);
    }
  }
  return out;
}

/**
 * Every entry a tree's manifests carry for one slot, in tree order — the pipeline's
 * registry. A slot's registrations are manifest DATA wherever they sit: a plugin that
 * ships a pass registers it in its own module's `contributes`, and the tree the host
 * assembled says what runs. Duplicates are the checker's to catch loudly (its
 * `duplicate-id` problem); the pipeline keeps the first of an id and skips the rest
 * with the reason kept, so one tree cannot run the same pass twice.
 */
export function contributionsOf<D extends { id: string }>(def: ModuleDef, slotKey: string): D[] {
  const out: D[] = [];
  for (const d of walkDefs(def)) {
    const entries = d.manifest.contributes[slotKey] as unknown as readonly D[] | undefined;
    if (entries !== undefined) out.push(...entries);
  }
  return out;
}

/** debug(): the compiled tree as one readable block — every module, its provided aliases. */
export function describeTree(def: ModuleDef): string {
  const lines: string[] = [];
  const walk = (d: ModuleDef, path: string): void => {
    const provides = Object.keys(d.manifest.provides);
    lines.push(`${path}${provides.length > 0 ? ` => ${provides.join(", ")}` : ""}`);
    for (const child of d.children ?? []) walk(child, `${path}/${child.manifest.name}`);
  };
  walk(def, def.manifest.name);
  return lines.join("\n");
}
