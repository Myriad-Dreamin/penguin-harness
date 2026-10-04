/**
 * Checking generated tables as a tree, with no module code: an `ifaces.json` carries its
 * package's manifests (`modules`) beside its interfaces, and that is enough for
 * {@link checkTree}. This is how a tree is VERIFIED ahead of the boot that will trust it:
 * the web checks its builtin table when it is built (packages/web/scripts), and a plugin's
 * table against the host's when the web first meets it (web lib/verify-plugins.ts).
 */
import type { IfaceTable } from "./sig.js";
import type { Manifest } from "./manifest.js";
import { parseManifest } from "./manifest.js";
import { checkTree } from "./check.js";
import type { ManifestNode, Problem } from "./tree.js";

/** A generated table: interfaces, named types, and the package's module manifests by name. */
export interface ModuleTable extends IfaceTable {
  /** sha256 of the canonical content (scripts/gen-ifaces.mjs). */
  readonly hash?: string;
  /** Manifests by module name — parsed (and so validated) before use. */
  readonly modules: Readonly<Record<string, unknown>>;
}

const childName = (c: Manifest["children"][number]) => (typeof c === "string" ? c : c.keyed);

/**
 * The table's top-level trees: every module no other module of the table lists as a child,
 * with its children nested. Throws on a child the table does not carry, a module listed under
 * two parents, or a cycle.
 */
export function treesOf(table: ModuleTable, where = "table"): ManifestNode[] {
  const manifests = new Map<string, Manifest>();
  for (const [name, doc] of Object.entries(table.modules)) {
    const manifest = parseManifest(doc, `${where}: modules.${name}`);
    if (manifest.name !== name)
      throw new Error(`${where}: modules.${name} is named '${manifest.name}'`);
    manifests.set(name, manifest);
  }
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
 * rule the server's plugin host folds tables by (server plugin/host.ts).
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

/**
 * The full check over a host table with `extras` mounted under its root — each extra's
 * top-level modules become children of the host's one root module, as plugin modules are.
 * Returns the problems ([] = the tree verifies); throws when a table is malformed (a
 * manifest that does not parse, a missing child, a host without exactly one root).
 */
export function checkTables(host: ModuleTable, extras: readonly ModuleTable[] = []): Problem[] {
  const roots = treesOf(host, "host table");
  if (roots.length !== 1) {
    throw new Error(
      `host table: expected one root module, found ${roots.length} (${roots.map((r) => r.manifest.name).join(", ")})`,
    );
  }
  const root = roots[0]!;
  const tree: ManifestNode = {
    manifest: root.manifest,
    children: [...root.children, ...extras.flatMap((t, i) => treesOf(t, `table ${i + 1}`))],
  };
  return checkTree(tree, mergeTables(host, extras)).problems;
}
