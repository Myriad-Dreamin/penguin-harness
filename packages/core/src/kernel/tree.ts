/**
 * The module tree as data, and what both checks read off it without arktype: where each
 * module sits (its path, what it may see, what is above it), what it provides, and how a
 * problem reads. The full check (./check.ts) and the runtime booter's identity-only check
 * (./exact-check.ts) both build on it.
 */
import type { Manifest } from "./manifest.js";
import type { IfaceDecl, TableLike } from "./sig.js";
import { tableOf } from "./table.js";
import { ifaceKey } from "./keys.js";

/** A manifest and its children, as the tree is declared. */
export interface ManifestNode {
  manifest: Manifest;
  children: ManifestNode[];
}

/** What the host publishes: modules with provided interfaces, no manifests of their own. */
export type Published = Record<string /* module name */, Record<string /* alias */, IfaceDecl>>;

export type Problem =
  | { path: string; kind: "unresolved"; alias: string; from: string; why: string }
  | { path: string; kind: "mismatch"; alias: string; from: string; method: string; why: string }
  | { path: string; kind: "unknown-iface"; alias: string; ref: string }
  | { path: string; kind: "no-such-slot"; slotKey: string }
  | { path: string; kind: "bad-contribution"; slotKey: string; id: string; why: string }
  | { path: string; kind: "duplicate-id"; id: string; other: string }
  | { path: string; kind: "duplicate-module"; name: string; other: string };

export interface CheckResult {
  problems: Problem[];
  /** Module name → its provided interfaces by alias (the tree's own plus the published). */
  provides: Record<string, Record<string, IfaceDecl>>;
}

export interface Located {
  path: string;
  manifest: Manifest;
  /** Module names this module may wire to or contribute to. */
  visible: Set<string>;
  /** Module names above this one — never a provider for it (their exports face outward). */
  ancestors: Set<string>;
}

/** Provided interfaces of a module, by alias, resolved through the table. */
export function provided(
  manifest: Manifest,
  table: TableLike,
): { byAlias: Record<string, IfaceDecl>; unknown: Array<{ alias: string; ref: string }> } {
  const byAlias: Record<string, IfaceDecl> = {};
  const unknown: Array<{ alias: string; ref: string }> = [];
  for (const [alias, ref] of Object.entries(manifest.provides)) {
    const decl = tableOf(table).ifaces[ifaceKey(manifest.name, ref)];
    if (decl === undefined) unknown.push({ alias, ref });
    else byAlias[alias] = decl;
  }
  return { byAlias, unknown };
}

export function locate(root: ManifestNode): Located[] {
  const out: Located[] = [];
  const walk = (node: ManifestNode, path: string, inherited: string[], above: string[]) => {
    const siblings = node.children.map((c) => c.manifest.name);
    const ancestors = new Set([...above, node.manifest.name]);
    for (const child of node.children) {
      const childPath = `${path}/${child.manifest.name}`;
      const visible = new Set([...inherited, node.manifest.name, ...siblings]);
      out.push({ path: childPath, manifest: child.manifest, visible, ancestors });
      walk(child, childPath, [...inherited, node.manifest.name, ...siblings], [...ancestors]);
    }
  };
  out.push({
    path: `/${root.manifest.name}`,
    manifest: root.manifest,
    visible: new Set(),
    ancestors: new Set(),
  });
  walk(root, `/${root.manifest.name}`, [], []);
  return out;
}

export function describeProblem(p: Problem): string {
  switch (p.kind) {
    case "unresolved":
      return `${p.path}: requires.${p.alias}${p.from ? ` from '${p.from}'` : ""}: ${p.why}`;
    case "mismatch":
      return `${p.path}: requires.${p.alias} from '${p.from}': ${p.method}: ${p.why}`;
    case "unknown-iface":
      return `${p.path}: '${p.alias}' names interface '${p.ref}', which the table does not carry`;
    case "no-such-slot":
      return `${p.path}: contributes to '${p.slotKey}', which no visible module declares`;
    case "bad-contribution":
      return `${p.path}: contribution '${p.id}' to '${p.slotKey}': ${p.why}`;
    case "duplicate-id":
      return `${p.path}: contribution id '${p.id}' is already used by ${p.other}`;
    case "duplicate-module":
      return `${p.path}: module name '${p.name}' is already used by ${p.other}`;
  }
}
