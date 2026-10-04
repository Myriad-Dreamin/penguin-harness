/**
 * Which plugin web modules the boot assembles into the module tree (plugins/assemble.ts), and
 * when a page must reload because that list changed.
 *
 * The list is GET /api/contributions' `webModules`. The boot asks for it at once, beside
 * `GET /api/me` and the install reconcile, and does not wait for it when this browser has the
 * list from the last answer (lib/list-cache.ts — per data root, versioned, dropped on logout,
 * not read in safe mode): the tree is assembled from that at once, and the module files it
 * names are content-addressed and cached by the browser for good. Only a browser without the
 * list (the first visit, after a logout, a new data root) waits for the answer — bounded: one
 * that has not come by BOOT_WAIT_MS boots the app without plugins.
 *
 * The boot's request is the shell's first contributions answer (shell/contributions.tsx takes it
 * once instead of asking again), and each answer the shell gets for its signed-in user is held
 * against what the tree was assembled from (`reconcileWebModules`): the same list changes
 * nothing; another list is written for the next boot and reloads the page once, so the tree
 * holds it. That covers a list that changed on the server, a boot that got no answer in time,
 * and a sign-in after a signed-out boot (401: the tree's module files could not be fetched).
 * The tree is assembled once per page — re-assembling in place is not done. A reload for the
 * same reason is not repeated within RELOAD_GUARD_MS, so a list that never settles cannot loop.
 *
 * Nothing is asked or read in safe mode; entering it while plugin modules are assembled reloads
 * without them.
 */
import type { ContributionsResponse, WebModulePackage } from "@prismshadow/penguin-server/api";
import { readWebModuleCache, writeWebModuleCache } from "../lib/list-cache";
import { canonicalJson } from "../lib/verify-plugins";
import { isSafeMode, onSafeModeChange } from "../rescue/safe-mode";

/** How long a boot without the list waits for the answer before it boots without plugins. */
const BOOT_WAIT_MS = 5000;

/** The boot's request, until the shell takes it. */
let request: Promise<ContributionsResponse | null> | null = null;
/** What the tree was assembled from (none in safe mode); null before the boot has run. */
let booted: readonly WebModulePackage[] | null = null;
/** The boot's request was refused for want of a session: the tree could not load any module file. */
let signedOut = false;

async function ask(): Promise<ContributionsResponse | null> {
  try {
    // Not through the api client: its 401 handler signs the app out, and a signed-out boot is
    // not a failure here.
    const res = await fetch("/api/contributions");
    if (res.status === 401) signedOut = true;
    if (!res.ok) return null;
    return (await res.json()) as ContributionsResponse;
  } catch {
    return null;
  }
}

/**
 * The web modules the boot assembles: the cached list at once when there is one, else the
 * answer (none in safe mode, signed out, on any failure, or after BOOT_WAIT_MS).
 */
export async function bootWebModules(): Promise<readonly WebModulePackage[]> {
  if (isSafeMode()) return (booted = []);
  request = ask();
  const cached = readWebModuleCache();
  if (cached !== null) return (booted = cached.packages);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => (timer = setTimeout(resolve, BOOT_WAIT_MS, null)));
  const answer = await Promise.race([request, late]);
  clearTimeout(timer);
  return (booted = answer?.webModules ?? []);
}

/** The boot's request, handed out once (to the shell's contributions store); null after that. */
export function takeBootContributions(): Promise<ContributionsResponse | null> | null {
  const taken = request;
  request = null;
  return taken;
}

const RELOAD_KEY = "penguin.pluginReload";
/** A reload for the same reason within this window is not repeated: no loop if the cause stays. */
const RELOAD_GUARD_MS = 15_000;

function reloadOnce(): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
    if (Date.now() - last < RELOAD_GUARD_MS) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // No storage: reload anyway; the reloaded boot reads the list just written and stops here.
  }
  location.reload();
}

/**
 * Called with each of the shell's answers for the signed-in user: writes the list for the next
 * boot when it or its user changed, and reloads once when it is not what the tree holds.
 */
export function reconcileWebModules(
  answer: ContributionsResponse | null,
  userId: string | null,
): void {
  if (answer === null || userId === null || booted === null) return;
  const fresh = answer.webModules ?? [];
  const text = canonicalJson(fresh);
  const cached = readWebModuleCache();
  if (cached?.userId !== userId || canonicalJson(cached.packages) !== text) {
    writeWebModuleCache(userId, fresh);
  }
  const assembled = signedOut ? [] : booted;
  if (canonicalJson(assembled) !== text) reloadOnce();
}

/** After the boot: entering safe mode while plugin modules are assembled reloads without them. */
export function reloadOnSafeModeChange(assembledPlugins: boolean): void {
  onSafeModeChange((safe) => {
    if (safe && assembledPlugins) location.reload();
  });
}
