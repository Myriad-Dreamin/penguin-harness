/**
 * Generated tables as trees, without arktype: the walk from a table's manifests to its
 * top-level trees, and the merge of a host table with the tables mounted under it. Both the
 * full check (./tables.ts, which parses every manifest first) and a runtime boot that takes
 * manifests as generated, verified data (the web's plugin modules) use them, so they live
 * here, under the runtime entry.
 */
import type { IfaceTable } from "./sig.js";
import type { Manifest } from "./manifest.js";
import type { ManifestNode } from "./tree.js";

/** A generated table: interfaces, named types, and the package's module manifests by name. */
export interface ModuleTable extends IfaceTable {
  /** sha256 of the canonical content (scripts/gen-ifaces.mjs). */
  readonly hash?: string;
  /** Manifests by module name — parsed (and so validated) by the full check before use. */
  readonly modules: Readonly<Record<string, unknown>>;
}

const childName = (c: Manifest["children"][number]) => (typeof c === "string" ? c : c.keyed);

/**
 * The top-level trees of these manifests: every module no other one lists as a child, with
 * its children nested (`"*"`, the runtime's open slot, is skipped). Throws on a child that is
 * not among them, a module listed under two parents, or a cycle. Each manifest is taken as it
 * is: a caller holding unvalidated documents parses them first (./tables.ts treesOf).
 */
export function manifestTrees(
  manifests: ReadonlyMap<string, Manifest>,
  where = "table",
): ManifestNode[] {
  const listed = new Set(
    [...manifests.values()].flatMap((m) => m.children.map(childName)).filter((c) => c !== "*"),
  );
  // Each module is placed once: a second placement is a module listed under two parents or
  // its own descendant, and stopping there also bounds the walk on a hostile table.
  const placed = new Set<string>();
  const node = (name: string): ManifestNode => {
    if (placed.has(name))
      throw new Error(`${where}: '${name}' is listed under two parents, or is its own descendant`);
    placed.add(name);
    const manifest = manifests.get(name);
    if (manifest === undefined) throw new Error(`${where}: child '${name}' is not in the table`);
    return {
      manifest,
      children: manifest.children
        .map(childName)
        .filter((c) => c !== "*")
        .map((c) => node(c)),
    };
  };
  const trees = [...manifests.keys()].filter((name) => !listed.has(name)).map((name) => node(name));
  const stranded = [...manifests.keys()].filter((name) => !placed.has(name));
  if (stranded.length > 0)
    throw new Error(`${where}: [${stranded.join(", ")}] are reachable only through a cycle`);
  return trees;
}

/**
 * Host and extras as one interface table. On a key both carry (an extra copies the host
 * interfaces it compiled against) the host's entry stands, then the earlier extra's — the
 * rule the server's plugin host folds tables by (server plugin/host.ts). That the host's
 * entry still satisfies an extra's copy is the full check's to say (./tables.ts checkTables).
 */
export function mergeTables(host: IfaceTable, extras: readonly IfaceTable[]): IfaceTable {
  const ifaces = { ...host.ifaces };
  const types = { ...host.types };
  for (const extra of extras) {
    for (const [key, decl] of Object.entries(extra.ifaces)) ifaces[key] ??= decl;
    for (const [key, decl] of Object.entries(extra.types)) types[key] ??= decl;
  }
  return { ifaces, types };
}
