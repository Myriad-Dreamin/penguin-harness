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
 * A table's hash is the sha256 of its canonical content (scripts/gen-ifaces.mjs). It is
 * recomputed here, not taken on trust: a table whose `hash` does not match its content, or a
 * page without WebCrypto (`crypto.subtle` is missing outside a secure context, e.g. plain
 * HTTP on a LAN address), is verified on every load and never cached.
 *
 * TODO(post-verify): plugins wait for their verification before they boot; booting first and
 * verifying after is not built. Revisit only if the first-sight verification shows on the boot path.
 */
import type { ModuleTable } from "@prismshadow/penguin-core/kernel";
import { CHECK_VERSION } from "@prismshadow/penguin-core/kernel/runtime";
import { readVerified, recordVerified } from "./verified-cache";

/** A generated table with its hash, as gen-ifaces writes it. */
export type HashedTable = ModuleTable & { readonly hash: string };

export interface PluginTable {
  /** The plugin's name, unique in the list: what dependencies and messages name it by. */
  readonly name: string;
  /** Its generated `ifaces.json`. */
  readonly table: HashedTable;
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

const loadFullCheck = (): Promise<FullCheck> => import("@prismshadow/penguin-core/kernel");

/**
 * The identity a verdict is valid under: the kernel's check semantics (CHECK_VERSION, bumped
 * whenever a verdict could change) and the host's table hash (every interface and manifest the
 * plugins are checked against). Both are what the verdict depends on, and nothing else is.
 */
export function hostIdentity(host: { readonly hash: string }): string {
  return `check${CHECK_VERSION}:${host.hash}`;
}

/** sha256 over the table without its `hash`, as gen-ifaces computes it; null when it cannot be computed. */
async function contentHash(table: HashedTable): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) return null;
  try {
    const { hash: _hash, ...body } = table;
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(body)));
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
      const computed = await contentHash(p.table);
      keys.set(p, computed !== null && computed === p.table.hash ? computed : null);
    }),
  );

  const known = readVerified(hostId);
  const verified = new Map<string, readonly string[]>();
  const pending: Array<{ p: PluginTable; deps: PluginTable[]; key: string | null; depKeys: string[] }> = [];
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
