/**
 * The boot's list of plugin web modules (plugins/forwarded.ts) and the cache it boots from
 * (lib/list-cache.ts).
 *
 * - Without a cached list the boot waits for the answer and boots from it; the shell's answer
 *   for the user writes it for the next boot and, being the same, reloads nothing.
 * - With a cached list the boot answers at once, before the request does; an answer with the
 *   same list changes nothing, another rewrites the cache and reloads once — not again within
 *   the guard, so a list that never settles cannot loop.
 * - A boot with no plugins (an empty cached list) waits on nothing.
 * - A signed-out boot (401) that assembled a cached list reloads once signed in.
 * - Safe mode asks and reads nothing; logout drops the cached list; junk is no cache.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContributionsResponse, WebModulePackage } from "@prismshadow/penguin-server/api";
import { setSafeMode } from "../src/rescue/safe-mode";
import { memoryStorage, stubLocalStorage } from "./helpers/storage";
import type { MemoryStorage } from "./helpers/storage";

const CACHE_KEY = "penguin.listCache.webModules";
const music: WebModulePackage = {
  package: "@acme/music",
  version: "1.0.0",
  ifaces: { ifaces: {}, types: {} },
  modules: [{ manifest: { name: "Music" }, url: "/api/plugins/@acme/music/web/0123/Music.js" }],
  styles: [],
};
const rebuilt: WebModulePackage = {
  ...music,
  modules: [{ manifest: { name: "Music" }, url: "/api/plugins/@acme/music/web/4567/Music.js" }],
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

/** A fresh copy of the module: its state is per page. */
const load = () => import("../src/plugins/forwarded");
const cache = (userId: string, packages: WebModulePackage[]) =>
  storage.map.set(CACHE_KEY, JSON.stringify({ v: 1, installId: "root-a", userId, packages }));
const cached = () => JSON.parse(storage.map.get(CACHE_KEY) ?? "null");

describe("the boot's web module list", () => {
  it("without a cached list, waits for the answer, then writes it and reloads nothing", async () => {
    const f = await load();
    const booting = f.bootWebModules();
    answer(200, answerOf([music]));
    expect(await booting).toEqual([music]);
    f.reconcileWebModules(await f.takeBootContributions()!, "u");
    expect(cached()).toMatchObject({ userId: "u", packages: [music] });
    expect(reload).not.toHaveBeenCalled();
  });

  it("with a cached list, boots from it before the request is answered", async () => {
    cache("u", [music]);
    const f = await load();
    expect(await f.bootWebModules()).toEqual([music]);
    expect(fetch).toHaveBeenCalledOnce();
    answer(200, answerOf([music]));
    f.reconcileWebModules(await f.takeBootContributions()!, "u");
    expect(reload).not.toHaveBeenCalled();
  });

  it("an answer with another list rewrites the cache and reloads once, never in a loop", async () => {
    cache("u", [music]);
    const f = await load();
    await f.bootWebModules();
    f.reconcileWebModules(answerOf([rebuilt]), "u");
    expect(cached().packages).toEqual([rebuilt]);
    expect(reload).toHaveBeenCalledOnce();
    // The reloaded page still disagrees (the list moved again): no second reload in the guard.
    vi.resetModules();
    cache("u", [rebuilt]);
    const again = await load();
    await again.bootWebModules();
    again.reconcileWebModules(answerOf([music]), "u");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("with no plugins, waits on nothing", async () => {
    cache("u", []);
    const f = await load();
    expect(await f.bootWebModules()).toEqual([]);
    f.reconcileWebModules(answerOf([]), "u");
    expect(reload).not.toHaveBeenCalled();
  });

  it("a signed-out boot that assembled the cached list reloads once signed in", async () => {
    cache("u", [music]);
    const f = await load();
    await f.bootWebModules();
    answer(401);
    expect(await f.takeBootContributions()).toBeNull();
    f.reconcileWebModules(answerOf([music]), "u");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("in safe mode, asks and reads nothing", async () => {
    cache("u", [music]);
    setSafeMode(true);
    try {
      const f = await load();
      expect(await f.bootWebModules()).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      setSafeMode(false);
    }
  });

  it("is dropped on logout, and junk or another data root is no cache", async () => {
    const { clearListCache, readWebModuleCache } = await import("../src/lib/list-cache");
    cache("u", [music]);
    clearListCache("someone-else");
    expect(storage.map.has(CACHE_KEY)).toBe(false);
    storage.map.set(CACHE_KEY, JSON.stringify({ v: 1, installId: "root-a", userId: "u" }));
    expect(readWebModuleCache()).toBeNull();
    storage.map.set(
      CACHE_KEY,
      JSON.stringify({ v: 1, installId: "root-b", userId: "u", packages: [music] }),
    );
    expect(readWebModuleCache()).toBeNull();
  });
});
