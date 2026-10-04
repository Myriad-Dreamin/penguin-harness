/**
 * The boot's list of plugin web modules (plugins/forwarded.ts).
 *
 * - The boot asks for the list at once and boots from the answer; the shell takes the same
 *   request once instead of asking again.
 * - An answer that has not come by BOOT_WAIT_MS boots without plugins; a late answer changes
 *   nothing about the boot.
 * - Nothing is kept across loads: no list is written to storage, and no later answer reloads.
 * - A signed-out boot (401) reloads once on a sign-in seen in this document, and never in a
 *   document that was never seen signed out.
 * - Safe mode asks nothing; after a safe-mode boot, the first answer with plugins once it is left
 *   reloads; entering safe mode reloads only when plugins were assembled.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContributionsResponse, WebModulePackage } from "@prismshadow/penguin-server/api";
import { setSafeMode } from "../src/rescue/safe-mode";
import { memoryStorage, stubLocalStorage } from "./helpers/storage";
import type { MemoryStorage } from "./helpers/storage";

const music: WebModulePackage = {
  package: "@acme/music",
  version: "1.0.0",
  ifaces: { ifaces: {}, types: {} },
  modules: [{ manifest: { name: "Music" }, url: "/api/plugins/@acme/music/web/0123/Music.js" }],
  styles: [],
};
const answerOf = (webModules: WebModulePackage[]) =>
  ({ pages: [], pageRemovals: [], webModules }) as unknown as ContributionsResponse;

let storage: MemoryStorage;
let reload: ReturnType<typeof vi.fn>;
/** Answers the boot's request when called; until then it is in flight. */
let answer: (status: number, body?: unknown) => void;

beforeEach(() => {
  vi.resetModules();
  storage = stubLocalStorage(memoryStorage({ "penguin.installId": "root-a" }));
  vi.stubGlobal("sessionStorage", memoryStorage());
  reload = vi.fn();
  vi.stubGlobal("location", { reload });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve) => {
          answer = (status, body) =>
            resolve({ status, ok: status < 300, json: async () => body } as Response);
        }),
    ),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

/** A fresh copy of the module: its state is per page. */
const load = () => import("../src/plugins/forwarded");
/** The safe-mode switch the fresh copy listens to (its listeners are per module instance). */
const pageSafeMode = () => import("../src/rescue/safe-mode");

describe("the boot's web module list", () => {
  it("is asked at once and booted from the answer, which the shell then takes once", async () => {
    const f = await load();
    const booting = f.bootWebModules();
    // Asked synchronously, in the same tick as the boot's other requests (main.tsx).
    expect(fetch).toHaveBeenCalledTimes(1);
    answer(200, answerOf([music]));
    expect(await booting).toEqual([music]);
    expect(await f.takeBootContributions()).toEqual(answerOf([music]));
    expect(f.takeBootContributions()).toBeNull();
  });

  it("boots without plugins once BOOT_WAIT_MS has passed, and a late answer changes nothing", async () => {
    vi.useFakeTimers();
    const f = await load();
    const booting = f.bootWebModules();
    await vi.advanceTimersByTimeAsync(f.BOOT_WAIT_MS);
    expect(await booting).toEqual([]);
    answer(200, answerOf([music]));
    // The shell still gets the late answer as its first one.
    expect(await f.takeBootContributions()).toEqual(answerOf([music]));
    expect(reload).not.toHaveBeenCalled();
  });

  it("keeps nothing across loads", async () => {
    const f = await load();
    const booting = f.bootWebModules();
    answer(200, answerOf([music]));
    await booting;
    expect([...storage.map.keys()]).toEqual(["penguin.installId"]);
  });

  it("after a signed-out boot, reloads once on a sign-in seen in this document", async () => {
    const f = await load();
    const booting = f.bootWebModules();
    answer(401);
    expect(await booting).toEqual([]);
    f.reloadOnSignIn(undefined);
    f.reloadOnSignIn("u");
    // Not seen signed out yet: an initializing state that resolves to a user is the boot's own.
    expect(reload).not.toHaveBeenCalled();
    f.reloadOnSignIn(null);
    f.reloadOnSignIn("u");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload on sign-in after a signed-in boot", async () => {
    const f = await load();
    const booting = f.bootWebModules();
    answer(200, answerOf([]));
    await booting;
    f.reloadOnSignIn(null);
    f.reloadOnSignIn("u");
    expect(reload).not.toHaveBeenCalled();
  });

  it("in safe mode, asks nothing; once left, the first answer with plugins reloads", async () => {
    setSafeMode(true);
    try {
      const f = await load();
      expect(await f.bootWebModules()).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
      f.reloadForSkippedPlugins(answerOf([music]));
      // Still in safe mode: nothing.
      expect(reload).not.toHaveBeenCalled();
      (await pageSafeMode()).setSafeMode(false);
      f.reloadForSkippedPlugins(answerOf([]));
      expect(reload).not.toHaveBeenCalled();
      f.reloadForSkippedPlugins(answerOf([music]));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      setSafeMode(false);
    }
  });

  it("after a boot outside safe mode, an answer with plugins reloads nothing", async () => {
    const f = await load();
    const booting = f.bootWebModules();
    answer(200, answerOf([]));
    await booting;
    f.reloadForSkippedPlugins(answerOf([music]));
    expect(reload).not.toHaveBeenCalled();
  });

  it("entering safe mode reloads only when plugins were assembled", async () => {
    const f = await load();
    const booting = f.bootWebModules();
    answer(200, answerOf([]));
    await booting;
    f.reloadOnSafeModeChange(false);
    const safe = await pageSafeMode();
    try {
      safe.setSafeMode(true);
      expect(reload).not.toHaveBeenCalled();
      safe.setSafeMode(false);
      expect(reload).not.toHaveBeenCalled();
    } finally {
      setSafeMode(false);
    }
  });
});
