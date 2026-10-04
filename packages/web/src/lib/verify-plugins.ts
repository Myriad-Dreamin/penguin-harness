/**
 * Verifies plugin module tables against the web's own before their modules boot.
 *
 * The page boots through the kernel's runtime entry, which wires by interface identity and
 * checks nothing structural (web-root.ts). The builtin tree is verified when it is built; a
 * plugin's table can only be verified once the page knows which plugins are installed, so
 * that happens here — the kernel's full check (`checkTables`: structural satisfaction,
 * contribution shapes) over the host's table with the plugin's modules mounted under its root,
 * together with the plugins it declares it depends on.
 *
 * The full check needs arktype, so it is a lazy chunk, imported only when some plugin has not
 * been verified before. What passed is remembered per host identity (lib/verified-cache.ts),
 * keyed by each table's content hash, so the next load with the same host and the same
 * plugins returns without loading it. Failures are never remembered.
 *
 * A plugin table's cache key is computed here, over exactly the table that is checked, as the
 * sha256 of its canonical JSON (keys sorted at every level, so no producer's key order matters).
 * Nothing the server says about it (a `hash` field, the build id in its URLs) is taken on trust
 * or needed: the key IS the verified content. A page without WebCrypto (`crypto.subtle` is
 * missing outside a secure context, e.g. plain HTTP on a LAN address) verifies on every load and
 * caches nothing. The host's identity is the `hash` of the web's own generated table, which is
 * part of the bundle that runs this code.
 *
 * TODO(post-verify): plugins wait for their verification before they boot; booting first and
 * verifying after is not built. Revisit only if the first-sight verification shows on the boot path.
 */
import { CHECK_VERSION } from "@prismshadow/penguin-core/kernel/runtime";
import type { ModuleTable } from "@prismshadow/penguin-core/kernel/runtime";
import { readVerified, recordVerified } from "./verified-cache";

/** The host's generated table, with the hash gen-ifaces gives it. */
export type HashedTable = ModuleTable & { readonly hash: string };

export interface PluginTable {
  /** The plugin's name, unique in the list: what dependencies and messages name it by. */
  readonly name: string;
  /** Its table: interfaces, types and the manifests of the modules that join the host. */
  readonly table: ModuleTable;
  /** Plugins in the same list its modules need (wire to, contribute to); checked together with it. */
  readonly dependsOn?: readonly string[];
}

export interface Verification {
  /** The plugins whose tables verify, in the order given. */
  accepted: PluginTable[];
  /** The rest, each with what is wrong, in the order given. */
  rejected: Array<{ plugin: PluginTable; problems: string[] }>;
}

/** The part of the full kernel verification uses. */
export type FullCheck = Pick<
  typeof import("@prismshadow/penguin-core/kernel"),
  "checkTables" | "describeProblem"
>;

// The one sanctioned load of the full kernel on the page: dynamic, so it is a lazy chunk off the
// boot path (the lint rule is there to keep every other import of it type-only).
// oxlint-disable-next-line no-restricted-imports
const loadFullCheck = (): Promise<FullCheck> => import("@prismshadow/penguin-core/kernel");

/**
 * The identity a verdict is valid under: the kernel's check semantics (CHECK_VERSION, bumped
 * whenever a verdict could change) and the host's table hash (every interface and manifest the
 * plugins are checked against). Both are what the verdict depends on, and nothing else is.
 */
export function hostIdentity(host: { readonly hash: string }): string {
  return `check${CHECK_VERSION}:${host.hash}`;
}

/** JSON with every object's keys sorted, so equal content is equal text whoever produced it. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === "object" && v !== null && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, (v as Record<string, unknown>)[k]]),
        )
      : v,
  );
}

/**
 * A plugin table's cache key: sha256 over the canonical JSON of what is checked (its
 * interfaces, types and manifests; a `hash` it carries is not part of it); null when it cannot
 * be computed.
 */
export async function tableKey(table: ModuleTable): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) return null;
  try {
    const body = { ifaces: table.ifaces, types: table.types, modules: table.modules };
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(body)));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/** `p` and every plugin it depends on, transitively, or why that cannot be assembled. */
function withDependencies(
  p: PluginTable,
  byName: ReadonlyMap<string, PluginTable>,
): { deps: PluginTable[] } | { missing: string } {
  const deps: PluginTable[] = [];
  const seen = new Set([p.name]);
  const pending = [...(p.dependsOn ?? [])];
  while (pending.length > 0) {
    const name = pending.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const dep = byName.get(name);
    if (dep === undefined) return { missing: name };
    deps.push(dep);
    pending.push(...(dep.dependsOn ?? []));
  }
  return { deps };
}

export async function verifyPlugins(
  host: HashedTable,
  plugins: readonly PluginTable[],
  opts: { loadCheck?: () => Promise<FullCheck> } = {},
): Promise<Verification> {
  const hostId = hostIdentity(host);
  const problems = new Map<PluginTable, string[]>();
  const byName = new Map<string, PluginTable>();
  for (const p of plugins) {
    if (byName.has(p.name)) problems.set(p, [`plugin '${p.name}' is listed twice`]);
    else byName.set(p.name, p);
  }
  const keys = new Map<PluginTable, string | null>();
  await Promise.all(
    [...byName.values()].map(async (p) => {
      keys.set(p, await tableKey(p.table));
    }),
  );

  const known = readVerified(hostId);
  const verified = new Map<string, readonly string[]>();
  const pending: Array<{
    p: PluginTable;
    deps: PluginTable[];
    key: string | null;
    depKeys: string[];
  }> = [];
  for (const p of byName.values()) {
    const closure = withDependencies(p, byName);
    if ("missing" in closure) {
      problems.set(p, [`depends on '${closure.missing}', which is not installed`]);
      continue;
    }
    const key = keys.get(p) ?? null;
    const depKeys = closure.deps.map((d) => keys.get(d) ?? null);
    const cacheable = key !== null && depKeys.every((k) => k !== null);
    const sortedDeps = cacheable ? (depKeys as string[]).sort() : [];
    const stored = cacheable ? known.get(key) : undefined;
    if (stored !== undefined && stored.join("\n") === sortedDeps.join("\n")) {
      verified.set(key!, sortedDeps);
      continue;
    }
    pending.push({ p, deps: closure.deps, key: cacheable ? key : null, depKeys: sortedDeps });
  }

  if (pending.length > 0) {
    const check = await (opts.loadCheck ?? loadFullCheck)();
    for (const { p, deps, key, depKeys } of pending) {
      let found: string[];
      try {
        found = check
          .checkTables(host, [...deps.map((d) => d.table), p.table])
          .map(check.describeProblem);
      } catch (err) {
        found = [err instanceof Error ? err.message : String(err)];
      }
      if (found.length > 0) problems.set(p, found);
      else if (key !== null) verified.set(key, depKeys);
    }
  }

  recordVerified(hostId, verified);
  const outcome: Verification = { accepted: [], rejected: [] };
  for (const p of plugins) {
    const wrong = problems.get(p);
    if (wrong === undefined) outcome.accepted.push(p);
    else outcome.rejected.push({ plugin: p, problems: wrong });
  }
  return outcome;
}
