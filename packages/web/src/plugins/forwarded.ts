/**
 * Which plugin web modules the boot assembles into the module tree (plugins/assemble.ts).
 *
 * The list is GET /api/contributions' `webModules`. The boot asks for it at once (main.tsx),
 * beside `GET /api/me` and the install reconcile it already waits on, so it adds no round trip
 * of its own: the module files it names are content-addressed and cached by the browser for
 * good, so a warm boot pays only for the list. The wait is bounded — an answer that has not
 * come by BOOT_WAIT_MS boots the app without plugins.
 *
 * The boot's request is the shell's first contributions answer (shell/contributions.tsx takes it
 * once instead of asking again). The tree is assembled once per page and never re-assembled in
 * place, and a later answer is not compared with it: a page that enables or removes a plugin
 * reloads after its own action. The one case the page catches itself is a boot refused for want
 * of a session (401): the tree has no plugins, so a sign-in within this document reloads once
 * (`reloadOnSignIn`).
 *
 * Nothing is asked in safe mode; entering it while plugin modules are assembled reloads without
 * them, and leaving it after a safe-mode boot reloads with them.
 */
import type { ContributionsResponse, WebModulePackage } from "@prismshadow/penguin-server/api";
import { isSafeMode, onSafeModeChange } from "../rescue/safe-mode";

/**
 * How long the boot waits for the list before it boots without plugins: as long as it already
 * waits for the install id (lib/install-scope.ts INSTALL_ID_TIMEOUT_MS), so the two bounded
 * requests that run side by side end together.
 */
export const BOOT_WAIT_MS = 3000;

/** The boot's request, until the shell takes it. */
let request: Promise<ContributionsResponse | null> | null = null;
/** The boot's request was refused for want of a session: the tree holds no plugin. */
let signedOut = false;
/** The boot ran in safe mode and asked for nothing. */
let bootedSafe = false;

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

/** The web modules the boot assembles: none in safe mode, signed out, on any failure, or late. */
export async function bootWebModules(): Promise<readonly WebModulePackage[]> {
  if (isSafeMode()) {
    bootedSafe = true;
    return [];
  }
  request = ask();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => (timer = setTimeout(resolve, BOOT_WAIT_MS, null)));
  const answer = await Promise.race([request, late]);
  clearTimeout(timer);
  return answer?.webModules ?? [];
}

/** The boot's request, handed out once (to the shell's contributions store); null after that. */
export function takeBootContributions(): Promise<ContributionsResponse | null> | null {
  const taken = request;
  request = null;
  return taken;
}

/** Whether this document's auth state has been seen signed out (null, not initializing). */
let sawSignedOut = false;

/**
 * Called with the auth state (`undefined` while initializing, `null` signed out): after a boot
 * refused for want of a session, a sign-in seen within this document reloads once, so the tree
 * takes the user's plugins. Self-limiting without a guard: the reloaded document boots with the
 * session, and a document that never sees itself signed out never reloads.
 */
export function reloadOnSignIn(userId: string | null | undefined): void {
  if (!signedOut) return;
  if (userId === null) sawSignedOut = true;
  else if (userId !== undefined && sawSignedOut) location.reload();
}

/**
 * After the boot: entering safe mode while plugin modules are assembled reloads without them;
 * leaving it after a safe-mode boot reloads, so the tree takes the plugins it skipped.
 */
export function reloadOnSafeModeChange(assembledPlugins: boolean): void {
  onSafeModeChange((safe) => {
    if (safe ? assembledPlugins : bootedSafe) location.reload();
  });
}
