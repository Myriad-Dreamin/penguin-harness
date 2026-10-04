/**
 * The last known state of the lists a page opens on, kept across a reload so the page can draw
 * them on its first frame and reconcile when the server answers.
 *
 * Three lists, each one document in `localStorage` (synchronous, so it is there for the first
 * render):
 *   - a Project's Session rows — every source's (this server's and each machine's) active rows,
 *     plus the organization Sessions (desks, tickets) a page has opened, each with the machine
 *     it routes to;
 *   - the user's organizations across their Projects, with the machine each one runs on;
 *   - the plugin web modules GET /api/contributions last forwarded, which the boot assembles
 *     into the module tree before the mount (plugins/forwarded.ts) — the one list read before
 *     anyone is known to be signed in, so it is one document naming its user rather than one per
 *     user in the key; the boot takes it under any user, and the shell's answer for the signed-in
 *     user replaces it.
 *
 * DRAW FROM IT, DECIDE FROM THE SERVER. What is read here may be shown, and may let a request
 * that only needs an id or a machine start early; nothing consequential — "not found", the
 * auto-selected Session, the "no Sessions" state, forgetting an organization — is decided from
 * it. The server's answer replaces it wholesale (never merged), and is then written back.
 *
 * Keying. Per origin already (so per port); within one, the document names the data root it was
 * made against (the install id the boot reconciles before mount, `install-scope.ts`), the user
 * and, for Sessions, the Project, and a read that disagrees on any of them is discarded. The
 * user and the Project are in the key as well, so two users of one browser never overwrite each
 * other. Cleared for a user on logout — titles are the user's content.
 *
 * Versioned: a document whose `v` is not {@link LIST_CACHE_VERSION}, or that does not parse to
 * the expected shape, is discarded, never migrated. Storage that is blocked, full or corrupt
 * behaves exactly as no cache at all. Safe mode (`?safe`) never reads it, so a bad document
 * cannot break the boot it exists to rescue; it still writes, so the server's answers in safe
 * mode replace a bad document with a good one.
 */
import type {
  OrganizationSummary,
  SessionInfo,
  WebModulePackage,
} from "@prismshadow/penguin-server/api";
import { isSafeMode } from "../rescue/safe-mode";
import { INSTALL_ID_KEY } from "./install-scope";
import { isOrgSession, sessionCategory } from "./session-grouping";
import { mostRecentFirst } from "./session-merge";

/** Bumped whenever the stored shape changes; any other value is discarded on read. */
export const LIST_CACHE_VERSION = 1;

const SESSIONS_PREFIX = "penguin.listCache.sessions.";
const ORGS_PREFIX = "penguin.listCache.organizations.";
const WEB_MODULES_KEY = "penguin.listCache.webModules";

/**
 * Rows kept per (source, Agent), most recently active first: a few sidebar pages
 * (SIDEBAR_PAGE_SIZE is 10). A placeholder for a list about to be refetched, not a copy of it.
 */
export const CACHED_ROWS_PER_LIST = 30;
/** Organization Sessions kept per Project, most recently active first. */
export const CACHED_ORG_SESSIONS = 20;
/** Organizations kept per user. */
export const CACHED_ORGANIZATIONS = 100;

/** One cached Session row and the server it lives on (`null` = this server). */
export interface CachedSessionRow {
  row: SessionInfo;
  source: string | null;
}

/** `/` is escaped by encodeURIComponent, so it separates the user from the Project unambiguously. */
const sessionsKey = (userId: string, projectId: string) =>
  `${SESSIONS_PREFIX}${encodeURIComponent(userId)}/${encodeURIComponent(projectId)}`;
const orgsKey = (userId: string) => `${ORGS_PREFIX}${encodeURIComponent(userId)}`;

/** The data root this browser's state was reconciled against before mount, or null. */
function installId(): string | null {
  try {
    return localStorage.getItem(INSTALL_ID_KEY);
  } catch {
    return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The stored document under `key` when it is this version, of this data root and names the
 * expected owner; null otherwise. A document that is there but unusable is removed, so it is
 * not parsed again on every load.
 */
function readDoc(key: string, owner: Record<string, string>): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const install = installId();
    const doc: unknown = JSON.parse(raw);
    const usable =
      install !== null &&
      isRecord(doc) &&
      doc.v === LIST_CACHE_VERSION &&
      doc.installId === install &&
      Object.entries(owner).every(([field, value]) => doc[field] === value);
    if (usable) return doc;
  } catch {
    // Unparseable, or storage refused the read: the same as nothing stored.
  }
  drop(key);
  return null;
}

/**
 * Writes `body` under `key`, stamped with the version and the data root. A write that fails
 * (quota, blocked storage) removes what was there: a document the server's answer could not
 * replace is stale, and stale is worse than none.
 */
function writeDoc(key: string, body: Record<string, unknown>): void {
  const install = installId();
  if (install === null) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ v: LIST_CACHE_VERSION, installId: install, ...body }),
    );
  } catch {
    drop(key);
  }
}

function drop(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Blocked storage holds nothing to drop.
  }
}

/** A row that can be drawn and addressed: the fields a list row and a route read. */
function isSessionRow(value: unknown, projectId: string): value is SessionInfo {
  return (
    isRecord(value) &&
    typeof value.sessionId === "string" &&
    typeof value.agentId === "string" &&
    value.projectId === projectId &&
    typeof value.createdAt === "string"
  );
}

/**
 * The Project's cached Session rows, or null when there are none to draw (nothing stored, a
 * document that does not check out, safe mode). One malformed row discards the document.
 */
export function readSessionCache(userId: string, projectId: string): CachedSessionRow[] | null {
  if (isSafeMode()) return null;
  const key = sessionsKey(userId, projectId);
  const doc = readDoc(key, { userId, projectId });
  if (doc === null) return null;
  const rows = doc.rows;
  const valid =
    Array.isArray(rows) &&
    rows.every(
      (entry: unknown) =>
        isRecord(entry) &&
        (entry.source === null || typeof entry.source === "string") &&
        isSessionRow(entry.row, projectId),
    );
  if (!valid) {
    drop(key);
    return null;
  }
  return rows as CachedSessionRow[];
}

/**
 * Replaces the Project's cached Session rows with `rows` — the list as the server last
 * answered it. Kept: the active rows of each (source, Agent), {@link CACHED_ROWS_PER_LIST} at
 * most, and {@link CACHED_ORG_SESSIONS} organization Sessions, each most recently active first.
 */
export function writeSessionCache(
  userId: string,
  projectId: string,
  rows: readonly CachedSessionRow[],
): void {
  const sorted = [...rows].sort((a, b) => mostRecentFirst(a.row, b.row));
  const perList = new Map<string, number>();
  let org = 0;
  const kept: CachedSessionRow[] = [];
  for (const entry of sorted) {
    if (isOrgSession(entry.row)) {
      if (org >= CACHED_ORG_SESSIONS) continue;
      org += 1;
      kept.push(entry);
      continue;
    }
    if (sessionCategory(entry.row) !== "active") continue;
    const list = `${entry.source ?? ""}\0${entry.row.agentId}`;
    const count = perList.get(list) ?? 0;
    if (count >= CACHED_ROWS_PER_LIST) continue;
    perList.set(list, count + 1);
    kept.push(entry);
  }
  writeDoc(sessionsKey(userId, projectId), { userId, projectId, rows: kept });
  dropLegacyMachineRows();
}

/**
 * TODO(list-cache-legacy): earlier releases kept each machine's rows under
 * `penguin.machineSessions.<projectId>:<machineId>`, unversioned and not per user; this cache
 * replaced them, and they are removed (never migrated) when a Session list is written — a scan
 * of a few dozen key names. Remove this once the release after the one that ships the list
 * cache is out.
 */
function dropLegacyMachineRows(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("penguin.machineSessions.")) doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    // Blocked storage holds nothing to drop.
  }
}

function isOrganization(value: unknown): value is OrganizationSummary {
  return (
    isRecord(value) &&
    typeof value.projectId === "string" &&
    typeof value.orgId === "string" &&
    typeof value.name === "string" &&
    (value.machineId === undefined ||
      value.machineId === null ||
      typeof value.machineId === "string")
  );
}

/** The user's cached organizations, or null when there are none to draw. */
export function readOrganizationCache(userId: string): OrganizationSummary[] | null {
  if (isSafeMode()) return null;
  const key = orgsKey(userId);
  const doc = readDoc(key, { userId });
  if (doc === null) return null;
  const organizations = doc.organizations;
  if (!Array.isArray(organizations) || !organizations.every(isOrganization)) {
    drop(key);
    return null;
  }
  return organizations;
}

/** Replaces the user's cached organizations with the server's complete answer. */
export function writeOrganizationCache(
  userId: string,
  organizations: readonly OrganizationSummary[],
): void {
  writeDoc(orgsKey(userId), {
    userId,
    organizations: organizations.slice(0, CACHED_ORGANIZATIONS),
  });
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === "string");

/** A package as the boot reads it: names, the table's two maps, module URLs and stylesheets. */
function isWebModulePackage(value: unknown): value is WebModulePackage {
  if (!isRecord(value) || typeof value.package !== "string") return false;
  const { ifaces, modules, styles } = value;
  return (
    isRecord(ifaces) &&
    isRecord(ifaces.ifaces) &&
    isRecord(ifaces.types) &&
    Array.isArray(modules) &&
    modules.every(
      (m: unknown) => isRecord(m) && isRecord(m.manifest) && typeof m.url === "string",
    ) &&
    isStringArray(styles)
  );
}

/** The forwarded web modules last written, and for whom; null when there are none to use. */
export function readWebModuleCache(): { userId: string; packages: WebModulePackage[] } | null {
  if (isSafeMode()) return null;
  const doc = readDoc(WEB_MODULES_KEY, {});
  if (doc === null) return null;
  const { userId, packages } = doc;
  if (
    typeof userId !== "string" ||
    !Array.isArray(packages) ||
    !packages.every(isWebModulePackage)
  ) {
    drop(WEB_MODULES_KEY);
    return null;
  }
  return { userId, packages };
}

/** Replaces the forwarded web modules with the server's answer for `userId`. */
export function writeWebModuleCache(userId: string, packages: readonly WebModulePackage[]): void {
  writeDoc(WEB_MODULES_KEY, { userId, packages });
}

/** Removes every list this browser keeps for `userId` — on logout. */
export function clearListCache(userId: string): void {
  const sessions = `${SESSIONS_PREFIX}${encodeURIComponent(userId)}/`;
  const orgs = orgsKey(userId);
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // The forwarded web modules go too, whoever they were written for: the next boot asks.
      if (key !== null && (key.startsWith(sessions) || key === orgs || key === WEB_MODULES_KEY))
        doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    // Blocked storage holds nothing to clear.
  }
}
