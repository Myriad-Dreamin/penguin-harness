/**
 * The boot's GET /api/contributions: asked by the entry before the module tree boots, because the
 * enabled plugins' web modules are part of that tree (plugins/assemble.ts). It is asked beside
 * `GET /api/me` and the install reconcile, so it overlaps their wait rather than adding to it,
 * and it is bounded: an answer that has not come by BOOT_WAIT_MS boots the app without plugins.
 *
 * The same answer is the shell's first contributions answer (shell/contributions.tsx takes it
 * once instead of asking again): the list is the server's, the same for every user.
 *
 * Nothing is asked in safe mode, and a signed-out boot (401) or one whose request failed gets no
 * plugins. The tree is assembled once per page — re-assembling in place is not done — so a change
 * of what it should hold is a reload:
 * - the shell's first answer after a boot that got none (a sign-in, leaving safe mode, a failed
 *   boot request) reloads once it shows web modules to assemble;
 * - entering safe mode while plugin modules are assembled reloads without them.
 */
import type { ContributionsResponse } from "@prismshadow/penguin-server/api";
import { isSafeMode, onSafeModeChange } from "../rescue/safe-mode";

/** How long the boot waits for the answer before it boots without plugins. */
const BOOT_WAIT_MS = 5000;

let primed: ContributionsResponse | null = null;
/** Whether the boot's request was answered: the tree then holds what the server forwarded. */
let answered = false;

/** The boot's answer; null in safe mode, signed out, on any failure, or after BOOT_WAIT_MS. */
export async function fetchBootContributions(): Promise<ContributionsResponse | null> {
  if (isSafeMode()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BOOT_WAIT_MS);
  try {
    // Not through the api client: its 401 handler signs the app out, and a signed-out boot is
    // not a failure here.
    const res = await fetch("/api/contributions", { signal: ctrl.signal });
    if (!res.ok) return null;
    primed = (await res.json()) as ContributionsResponse;
    answered = true;
    return primed;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The boot's answer, handed out once (to the shell's contributions store). */
export function takeBootContributions(): ContributionsResponse | null {
  const answer = primed;
  primed = null;
  return answer;
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
    // No storage: reload anyway; the reloaded boot is answered and stops here.
  }
  location.reload();
}

/**
 * Called with each of the shell's answers: after a boot that got none, web modules to assemble
 * mean the tree was booted without them, and a reload boots it with them.
 */
export function assembleIfBootedWithout(answer: ContributionsResponse | null): void {
  if (!answered && (answer?.webModules?.length ?? 0) > 0) reloadOnce();
}

/** After the boot: entering safe mode while plugin modules are assembled reloads without them. */
export function reloadOnSafeModeChange(assembledPlugins: boolean): void {
  onSafeModeChange((safe) => {
    if (safe && assembledPlugins) location.reload();
  });
}
