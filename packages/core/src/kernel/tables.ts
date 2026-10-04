/**
 * Checking generated tables as a tree, with no module code: an `ifaces.json` carries its
 * package's manifests (`modules`) beside its interfaces, and that is enough for
 * {@link checkTree}. This is how a tree is VERIFIED ahead of the boot that will trust it:
 * the web checks its builtin table when it is built (packages/web/scripts), and a plugin's
 * table against the host's when the web first meets it (web lib/verify-plugins.ts).
 */
import type { IfaceTable } from "./sig.js";
import { satisfies } from "./sig.js";
import type { Manifest } from "./manifest.js";
import { parseManifest } from "./manifest.js";
import { checkTree } from "./check.js";
import { ifaceKey } from "./keys.js";
import type { ModuleTable } from "./table-trees.js";
import { manifestTrees, mergeTables } from "./table-trees.js";
import type { ManifestNode, Problem } from "./tree.js";

export type { ModuleTable } from "./table-trees.js";
export { mergeTables } from "./table-trees.js";

/** A table's manifests, each parsed (and so validated) and named as its key says. */
function parsedManifests(table: ModuleTable, where: string): Map<string, Manifest> {
  const manifests = new Map<string, Manifest>();
  for (const [name, doc] of Object.entries(table.modules)) {
    const manifest = parseManifest(doc, `${where}: modules.${name}`);
    if (manifest.name !== name)
      throw new Error(`${where}: modules.${name} is named '${manifest.name}'`);
    manifests.set(name, manifest);
  }
  return manifests;
}

/**
 * The table's top-level trees: every module no other module of the table lists as a child,
 * with its children nested. Throws on a manifest that does not parse, a child the table does
 * not carry, a module listed under two parents, or a cycle.
 */
export function treesOf(table: ModuleTable, where = "table"): ManifestNode[] {
  return manifestTrees(parsedManifests(table, where), where);
}

/**
 * An extra's copies of host interfaces that the host's entry no longer satisfies. An extra
 * that requires a host interface carries the signature it compiled against under the host's
 * key (it imports the host's declaration, so gen-ifaces keys it the host's way), so the merged
 * table — where the host's entry stands — wires it to the host's provider by identity. What identity does not
 * say is whether the host still offers what the copy needs; that is asked here, of every
 * requirement naming such a key, and a gap is the requiring module's `mismatch`.
 */
function staleCopies(
  host: IfaceTable,
  extra: ModuleTable,
  merged: IfaceTable,
  manifests: ReadonlyMap<string, Manifest>,
  pathOf: (module: string) => string,
): Problem[] {
  const problems: Problem[] = [];
  for (const m of manifests.values()) {
    for (const [alias, need] of Object.entries(m.requires)) {
      const key = ifaceKey(m.name, need.iface);
      const hostDecl = host.ifaces[key];
      const copy = extra.ifaces[key];
      if (hostDecl === undefined || copy === undefined) continue;
      const gap = satisfies(hostDecl, copy, merged)[0];
      if (gap === undefined) continue;
      problems.push({
        path: pathOf(m.name),
        kind: "mismatch",
        alias,
        from: need.from ?? key,
        method: gap.method,
        why: `the host's '${key}' no longer offers what this plugin was built against: ${gap.why}`,
      });
    }
  }
  return problems;
}

/**
 * The full check over a host table with `extras` mounted under its root — each extra's
 * top-level modules become children of the host's one root module, as plugin modules are —
 * plus, for each extra, that the host still satisfies every host interface the extra copied
 * (staleCopies). Returns the problems ([] = the tree verifies); throws when a table is
 * malformed (a manifest that does not parse, a missing child, a host without exactly one root).
 */
export function checkTables(host: ModuleTable, extras: readonly ModuleTable[] = []): Problem[] {
  const roots = treesOf(host, "host table");
  if (roots.length !== 1) {
    throw new Error(
      `host table: expected one root module, found ${roots.length} (${roots.map((r) => r.manifest.name).join(", ")})`,
    );
  }
  const root = roots[0]!;
  const parsed = extras.map((t, i) => parsedManifests(t, `table ${i + 1}`));
  const tree: ManifestNode = {
    manifest: root.manifest,
    children: [
      ...root.children,
      ...parsed.flatMap((manifests, i) => manifestTrees(manifests, `table ${i + 1}`)),
    ],
  };
  const merged = mergeTables(host, extras);
  const paths = new Map<string, string>();
  const walk = (node: ManifestNode, path: string) => {
    paths.set(node.manifest.name, path);
    for (const c of node.children) walk(c, `${path}/${c.manifest.name}`);
  };
  walk(tree, `/${root.manifest.name}`);
  return [
    ...checkTree(tree, merged).problems,
    ...extras.flatMap((extra, i) =>
      staleCopies(host, extra, merged, parsed[i]!, (name) => paths.get(name) ?? name),
    ),
  ];
}
