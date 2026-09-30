/**
 * Plugin registries: WHERE plugin index entries come from. A registry is one source
 * of `PluginIndexEntry` rows — the shared index format every registry speaks (see
 * api/types.ts; the schema follows typst/packages' `index.json`: a flat array of
 * per-version entries). Discovery only: a Project asks for an entry on the Plugins page
 * (http/routes/plugins-installed.ts), and nothing here imports plugin code.
 *
 * Three sources, one shape — every entry names its content (`integrity`, the plugin store's
 * key), and the catalogue is the three merged:
 *   - the builtin registry serves the index the running BUILD carries: rebuilt by
 *     scripts/build-plugins.mjs from the store-shaped tree of what it packed, shipped beside
 *     the packages (`plugins/index.json` in a push's assets, or in the installation);
 *   - the store registry serves this machine's plugin store's own `index.json`, rebuilt from
 *     its tree after every write (plugin/store.ts);
 *   - the HTTP registry fetches the published `index.json` (see NIGHTLY_INDEX_URL), which the
 *     index repository rebuilds from the same tree shape, and runs it through the same
 *     validator — a remote index is trusted no further than the build's own.
 */
import type { PluginCatalogueEntry, PluginEntrySource, PluginIndexEntry } from "../api/types.js";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { resolvePluginPackage } from "./loader.js";
import type { PluginBase } from "./loader.js";
import { INDEX_FILE, readStore, storeSources } from "./store.js";
import { compareVersions, satisfies } from "./activation.js";

/** One source of plugin index entries; `source` identifies it for display and errors. */
export interface PluginRegistry {
  readonly source: string;
  /** Which of the three channels it is: what the catalogue tags its rows with. */
  readonly kind: PluginEntrySource;
  index(): Promise<PluginIndexEntry[]>;
  /**
   * Long-form documentation for one entry, or null when this source has none for it.
   *
   * Separate from `index` because the shapes differ: the index is a listing sent in full
   * on every page load, a readme is large and wanted only for the entry someone opened.
   */
  readme(name: string): Promise<string | null>;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Validates one raw entry; returns null instead of throwing so the caller can name the index position. */
function asIndexEntry(value: unknown): PluginIndexEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const e = value as Record<string, unknown>;
  if (
    typeof e.name !== "string" ||
    typeof e.version !== "string" ||
    typeof e.description !== "string" ||
    !isStringArray(e.authors) ||
    typeof e.license !== "string"
  ) {
    return null;
  }
  for (const key of ["repository", "homepage"] as const) {
    if (e[key] !== undefined && typeof e[key] !== "string") return null;
  }
  for (const key of ["keywords", "categories"] as const) {
    if (e[key] !== undefined && !isStringArray(e[key])) return null;
  }
  if (e.updatedAt !== undefined && typeof e.updatedAt !== "number") return null;
  // Optional, so an index from before it still lists — but a present one must be a key the
  // store can use: a malformed integrity is a broken artifact, not an unpinned entry.
  if (
    e.integrity !== undefined &&
    (typeof e.integrity !== "string" || !INTEGRITY.test(e.integrity))
  ) {
    return null;
  }
  if (e.yanked !== undefined && typeof e.yanked !== "boolean") return null;
  return value as PluginIndexEntry;
}

/** `sha256-<64 lowercase hex digits>`: an entry's content, the plugin store's key. */
export const INTEGRITY = /^sha256-[0-9a-f]{64}$/;

/**
 * Validates a whole index document. Strict, not per-entry-tolerant: an index is one
 * publisher's single artifact, so a malformed row means the artifact is broken —
 * unlike a Project's plugin list, whose entries are independent choices skipped one
 * by one.
 */
export function parsePluginIndex(data: unknown, source: string): PluginIndexEntry[] {
  if (!Array.isArray(data)) {
    throw new Error(`plugin index from ${source} is not an array`);
  }
  return data.map((raw, i) => {
    const entry = asIndexEntry(raw);
    if (entry === null) {
      throw new Error(`plugin index from ${source} has a malformed entry at index ${i}`);
    }
    return entry;
  });
}

export const BUILTIN_REGISTRY_SOURCE = "builtin";
export const STORE_REGISTRY_SOURCE = "store";

/** A package's own README.md, from wherever it is on this machine; null when it is not. */
async function readmeOf(name: string, bases: readonly PluginBase[]): Promise<string | null> {
  const found = resolvePluginPackage(name, bases);
  if (found === null) return null;
  try {
    return await fsp.readFile(path.join(found.dir, "README.md"), "utf8");
  } catch {
    return null;
  }
}

/**
 * The index the running build carries: `index.json` in the first of its prefixes that has one
 * — a push's assets before the installation's, as a boot imports them (plugin/store.ts
 * `storeSources`). Empty when neither does: a run from source ships no prefix.
 */
export async function shippedIndex(assetsDir: string | null): Promise<PluginIndexEntry[]> {
  for (const { dir } of storeSources(assetsDir)) {
    const file = path.join(dir, INDEX_FILE);
    if (!fs.existsSync(file)) continue;
    const text = await fsp.readFile(file, "utf8");
    return parsePluginIndex(JSON.parse(text), BUILTIN_REGISTRY_SOURCE);
  }
  return [];
}

/**
 * The registry of the running build: the index scripts/build-plugins.mjs rebuilt from what it
 * packed (`shippedIndex`). A readme is the package's own README.md, read from wherever the
 * package is on this machine (`bases`: the current generation, the shipped prefixes) — the
 * file npm shipped with it, never a second copy. A listed package that is not on this machine
 * has none to show.
 */
export function builtinPluginRegistry(
  bases: () => readonly PluginBase[] = () => [],
  assetsDir: () => string | null = () => null,
): PluginRegistry {
  return {
    source: BUILTIN_REGISTRY_SOURCE,
    kind: "builtin",
    // Validated like any other source: a broken shipped index fails loudly rather than
    // serving garbage.
    index: () => shippedIndex(assetsDir()),
    readme: (name) => readmeOf(name, bases()),
  };
}

/** The registry of this machine's plugin store: what it holds, read off its tree. */
export function storePluginRegistry(
  root: string,
  bases: () => readonly PluginBase[] = () => [],
): PluginRegistry {
  return {
    source: STORE_REGISTRY_SOURCE,
    kind: "store",
    index: async () => parsePluginIndex(await readStore(root), STORE_REGISTRY_SOURCE),
    readme: (name) => readmeOf(name, bases()),
  };
}

/** How a published index is fetched: `fetchImpl` and `delay` are injectable for tests. */
export interface HttpRegistryOptions {
  fetchImpl?: typeof fetch;
  /** Tries at a connection-level failure (a refused or reset connection, a timeout), an HTTP status is never retried. */
  attempts?: number;
  /** Per attempt: a proxy that never answers must not hold the listing forever. */
  timeoutMs?: number;
  /** The pause before the next attempt, by attempt number (1-based). */
  delay?: (attempt: number) => Promise<void>;
}

const backoff = (attempt: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));

/**
 * A registry behind an `index.json` URL.
 *
 * A connection that fails is tried again before it is reported: the document sits behind a
 * CDN redirect, and the first hop out through a corporate proxy is exactly the kind of thing
 * that fails once and works a second later. What the server answered (a 404, a 503) is not
 * retried — that is a fact about the source, not about the wire.
 */
export function httpPluginRegistry(
  indexUrl: string,
  options: HttpRegistryOptions | typeof fetch = {},
): PluginRegistry {
  const opts: HttpRegistryOptions =
    typeof options === "function" ? { fetchImpl: options } : options;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const attempts = opts.attempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const delay = opts.delay ?? backoff;
  const request = async (): Promise<Response> => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await fetchImpl(indexUrl, { signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        lastError = err;
        if (attempt < attempts) await delay(attempt);
      }
    }
    const cause = lastError instanceof Error ? lastError : new Error(String(lastError));
    const why =
      cause.cause instanceof Error ? `${cause.message} (${cause.cause.message})` : cause.message;
    throw new Error(
      `plugin index from ${indexUrl} could not be fetched (${attempts} attempts): ${why}`,
    );
  };
  return {
    source: indexUrl,
    kind: "index",
    index: async () => {
      const res = await request();
      if (!res.ok) {
        throw new Error(`plugin index from ${indexUrl} answered HTTP ${res.status}`);
      }
      let data: unknown;
      try {
        data = await res.json();
      } catch (err) {
        throw new Error(
          `plugin index from ${indexUrl} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return parsePluginIndex(data, indexUrl);
    },
    // The shared index format carries no readme location, so a remote source has none to
    // offer yet. Null rather than a guessed URL: inventing one would have the Web App
    // render whatever answered it.
    readme: () => Promise.resolve(null),
  };
}

/**
 * Where the published plugin index lives.
 *
 * A release asset, not the GitHub API and not a Pages URL. The API would cost this server two
 * requests against an unauthenticated 60/hour budget shared by every deployment behind one NAT,
 * for a document that changes four times a day; the asset is a plain file download with no such
 * budget, and the CDN in front of it is the same one that serves the installers.
 *
 * The tag is fixed and never re-pointed. What a six-hourly workflow in the index repository
 * replaces is the ASSET on that release, so this URL is stable for the life of the tag and
 * nothing here has to discover which release is newest — "latest nightly" is a name, resolved
 * by the publisher rather than by a search.
 */
export const NIGHTLY_INDEX_URL =
  "https://github.com/Prism-Shadow/penguin-extensions/releases/download/nightly/index.json";

/** Wall-clock reader, injectable so a cache's TTL is deterministic in tests. */
export type Clock = () => number;

/**
 * How long a fetched index is reused. The published document changes every six hours, so this
 * is not about freshness — it is about a listing endpoint that any logged-in user can open on
 * every page load, which without a cache turns one navigation habit into a request per view.
 */
export const INDEX_CACHE_TTL_MS = 30 * 60_000;

/**
 * Wrap a registry so its index is fetched at most once per TTL, and keep serving the last good
 * document when a refresh fails.
 *
 * Serving stale is the point rather than a fallback: the alternative to a slightly old index is
 * no index at all, and the page's job is to show what exists. A failure with nothing cached
 * still propagates — the caller decides whether one dead source should cost the whole listing.
 *
 * Concurrent callers share one in-flight fetch, so a page opened in four tabs at once is one
 * request rather than four.
 */
export interface IndexSnapshot {
  /** When the document was fetched (ms since the epoch). */
  at: number;
  entries: PluginIndexEntry[];
}

/** A cached registry also hands out its last good document, for a successor to start from. */
export interface CachedRegistry extends PluginRegistry {
  snapshot(): IndexSnapshot | null;
}

export function cachedRegistry(
  inner: PluginRegistry,
  {
    ttlMs = INDEX_CACHE_TTL_MS,
    now = Date.now,
    seed = null,
  }: {
    ttlMs?: number;
    now?: Clock;
    /**
     * The last good document a previous App fetched. It is served while the TTL has not
     * lapsed and stands in when the refresh fails — a hot push must not turn one flaky
     * connection into a listing with a source missing.
     */
    seed?: IndexSnapshot | null;
  } = {},
): CachedRegistry {
  let good: IndexSnapshot | null = seed;
  let inFlight: Promise<PluginIndexEntry[]> | null = null;
  return {
    source: inner.source,
    kind: inner.kind,
    snapshot: () => good,
    index: async () => {
      if (good !== null && now() - good.at < ttlMs) return good.entries;
      inFlight ??= inner
        .index()
        .then((entries) => {
          good = { at: now(), entries };
          return entries;
        })
        .finally(() => {
          inFlight = null;
        });
      try {
        return await inFlight;
      } catch (err) {
        if (good !== null) return good.entries;
        throw err;
      }
    },
    readme: (name) => inner.readme(name),
  };
}

/**
 * Merge several registries into one catalogue, tolerating a source that fails.
 *
 * Deliberately unlike the within-document rule: a malformed row still kills its own index,
 * because that index is one publisher's single artifact, but a source that is unreachable,
 * misconfigured or serving garbage must not empty the page of everything else. The failure is
 * reported alongside the entries rather than swallowed, so the Web App can say which source is
 * down instead of quietly showing a shorter list.
 *
 * A row is one CONTENT: name, version and integrity. The sources that list the same content
 * are one row tagged with each of them, and the FIRST source's metadata describes it — the
 * builtin registry is listed first, so what this deployment ships is the truth about it. Two
 * contents under one name and version are two rows. A row is installable here when it names
 * its integrity: a shipped or stored one is already on this machine, and a published one can
 * be checked when it is fetched; one without an integrity is listed and cannot be installed.
 * A yanked entry is left out.
 */
export async function mergeIndexes(
  registries: readonly PluginRegistry[],
): Promise<{ entries: PluginCatalogueEntry[]; failures: { source: string; error: string }[] }> {
  const settled = await Promise.all(
    registries.map(async (r) => {
      try {
        return { source: r.source, kind: r.kind, entries: await r.index(), error: null };
      } catch (err) {
        return {
          source: r.source,
          kind: r.kind,
          entries: [] as PluginIndexEntry[],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  const rows = new Map<string, PluginCatalogueEntry>();
  for (const result of settled) {
    for (const entry of result.entries) {
      if (entry.yanked === true) continue;
      const key = `${entry.name}@${entry.version}#${entry.integrity ?? ""}`;
      const row = rows.get(key);
      if (row === undefined) {
        rows.set(key, {
          ...entry,
          sources: [result.kind],
          installable: entry.integrity !== undefined,
        });
      } else if (!row.sources.includes(result.kind)) {
        row.sources.push(result.kind);
      }
    }
  }
  const entries = [...rows.values()];
  const failures = settled
    .filter((r) => r.error !== null)
    .map((r) => ({ source: r.source, error: r.error! }));
  return { entries, failures };
}

/**
 * The catalogue row an install of `name` takes, or why there is none: with `integrity`, that
 * content; otherwise the highest version `version` admits (yanked rows are not in the
 * catalogue), a row already on this machine first among equal versions. A row without an
 * integrity is never taken — it cannot be checked — and is named when it is all there is.
 */
export function pickCatalogueEntry(
  entries: readonly PluginCatalogueEntry[],
  name: string,
  ask: { version?: string; integrity?: string },
): PluginCatalogueEntry | { refused: string } {
  const listed = entries.filter((e) => e.name === name);
  if (listed.length === 0) {
    return { refused: `'${name}' is in none of the plugin catalogue's sources` };
  }
  const fits = listed.filter(
    (e) =>
      satisfies(e.version, ask.version) &&
      (ask.integrity === undefined || e.integrity === ask.integrity),
  );
  const wanted = ask.integrity ?? ask.version ?? "*";
  if (fits.length === 0) {
    return {
      refused: `no listed '${name}' satisfies ${wanted} (listed: ${listed.map((e) => e.version).join(", ")})`,
    };
  }
  const onMachine = (e: PluginCatalogueEntry) =>
    Number(e.sources.includes("builtin") || e.sources.includes("store"));
  const best = fits
    .filter((e) => e.installable)
    .sort((a, b) => compareVersions(b.version, a.version) || onMachine(b) - onMachine(a))[0];
  if (best === undefined) {
    return {
      refused: `'${name}' ${wanted} is listed without an integrity, so a fetched copy could not be checked: it cannot be installed`,
    };
  }
  return best;
}
