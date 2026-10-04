/**
 * Which plugin tables this browser has already verified against which host — so a page load
 * whose plugins were all verified before boots them without loading the kernel's full check
 * (and arktype with it). The verifier is lib/verify-plugins.ts; this module only stores.
 *
 * One document in `localStorage` under {@link VERIFIED_CACHE_KEY}:
 *
 *   { v: 1, hosts: [ { host: H, plugins: { <plugin table hash>: [<dependency table hashes>] } } ] }
 *
 * `host` is the host identity (verify-plugins.ts hostIdentity: the kernel's check version and
 * the web's own table hash), `hosts` is most recently used first. A plugin hash is recorded
 * with the sorted hashes of the plugin tables it was verified together with, and is a hit only
 * when they match again — a dependency that changed invalidates it.
 *
 * Content-addressed, so not keyed by user or data root (unlike lib/list-cache.ts, whose
 * conventions it otherwise follows): a verdict is a fact about two tables, true for anyone.
 * Only verdicts that PASSED are stored. Kept: the current host and the few most recently used
 * before it ({@link KEPT_HOSTS}), so moving back through harness history still hits; a write
 * also drops the host's plugin hashes that are no longer installed.
 *
 * Versioned: a document whose `v` is not {@link VERIFIED_CACHE_VERSION}, or that does not parse
 * to the expected shape, is removed, never migrated. Storage that is blocked, full or corrupt
 * behaves exactly as an empty cache: everything is verified again. Safe mode (`?safe`) neither
 * reads nor writes it.
 */
import { isSafeMode } from "../rescue/safe-mode";

export const VERIFIED_CACHE_KEY = "penguin.verifiedPlugins";
/** Bumped whenever the stored shape changes; any other value is discarded on read. */
export const VERIFIED_CACHE_VERSION = 1;
/** Host identities kept: the current one and the most recently used before it. */
export const KEPT_HOSTS = 4;

/** Plugin table hash → the sorted hashes of the tables it was verified together with. */
export type VerifiedPlugins = ReadonlyMap<string, readonly string[]>;

interface HostEntry {
  host: string;
  plugins: Record<string, readonly string[]>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === "string");

function isHostEntry(value: unknown): value is HostEntry {
  return (
    isRecord(value) &&
    typeof value.host === "string" &&
    isRecord(value.plugins) &&
    Object.values(value.plugins).every(isStringArray)
  );
}

/** The stored host entries, most recent first; [] for nothing stored or a document that does not check out. */
function readHosts(): HostEntry[] {
  try {
    const raw = localStorage.getItem(VERIFIED_CACHE_KEY);
    if (raw === null) return [];
    const doc: unknown = JSON.parse(raw);
    if (
      isRecord(doc) &&
      doc.v === VERIFIED_CACHE_VERSION &&
      Array.isArray(doc.hosts) &&
      doc.hosts.every(isHostEntry)
    ) {
      return doc.hosts;
    }
  } catch {
    // Unparseable, or storage refused the read: the same as nothing stored.
  }
  drop();
  return [];
}

function drop(): void {
  try {
    localStorage.removeItem(VERIFIED_CACHE_KEY);
  } catch {
    // Blocked storage holds nothing to drop.
  }
}

/** What was verified under `host`; empty in safe mode or when nothing usable is stored. */
export function readVerified(host: string): VerifiedPlugins {
  if (isSafeMode()) return new Map();
  const entry = readHosts().find((h) => h.host === host);
  return new Map(Object.entries(entry?.plugins ?? {}));
}

/**
 * Makes `plugins` the complete record for `host` — every installed plugin that verified,
 * already known or new; anything else stored for `host` is dropped — and `host` the most
 * recently used. A write that fails removes the document: a record that could not be
 * replaced is stale.
 */
export function recordVerified(host: string, plugins: VerifiedPlugins): void {
  if (isSafeMode()) return;
  const entry: HostEntry = { host, plugins: Object.fromEntries(plugins) };
  const hosts = [entry, ...readHosts().filter((h) => h.host !== host)].slice(0, KEPT_HOSTS);
  try {
    localStorage.setItem(VERIFIED_CACHE_KEY, JSON.stringify({ v: VERIFIED_CACHE_VERSION, hosts }));
  } catch {
    drop();
  }
}
