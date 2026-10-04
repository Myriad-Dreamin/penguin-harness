/**
 * Plugin table verification (lib/verify-plugins.ts) and the verdicts it remembers
 * (lib/verified-cache.ts).
 *
 * - A load whose plugins were all verified under this host loads no full check.
 * - Only the plugins not verified before are checked, each with the plugins it depends on.
 * - A dependency whose table changed invalidates what was verified with it.
 * - Failures are reported and never remembered; a missing dependency is refused unchecked.
 * - A plugin table is keyed by its own canonical content: a `hash` it claims is ignored, and the
 *   same content in another key order is the same key.
 * - Kept: the current host and the most recently used before it, so going back hits; a write
 *   drops plugin hashes no longer installed, but a load that lists nothing writes nothing, and a
 *   plugin refused for a missing dependency keeps its verdict.
 * - Junk, another version, or blocked storage behave as an empty cache; safe mode neither
 *   reads nor writes.
 * - With the real kernel, a plugin that does not fit the host is refused with the problem.
 */
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Manifest, Problem } from "@prismshadow/penguin-core/kernel/runtime";
import { hostIdentity, tableKey, verifyPlugins } from "../src/lib/verify-plugins";
import type { FullCheck, HashedTable, PluginTable } from "../src/lib/verify-plugins";
import { KEPT_HOSTS, VERIFIED_CACHE_KEY, VERIFIED_CACHE_VERSION } from "../src/lib/verified-cache";
import { setSafeMode } from "../src/rescue/safe-mode";
import { blockedStorage, memoryStorage, stubLocalStorage } from "./helpers/storage";
import type { MemoryStorage } from "./helpers/storage";

const manifest = (m: Partial<Manifest> & { name: string }): Manifest => ({
  requires: {},
  provides: {},
  contributes: {},
  children: [],
  ...m,
});

/** A table as gen-ifaces writes it: canonical body, hash over it. */
function hashed(body: Omit<HashedTable, "hash">): HashedTable {
  const canonical = { ifaces: body.ifaces, types: body.types, modules: body.modules };
  const hash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  return { hash, ...canonical };
}

const Sessions = {
  name: "Sessions",
  methods: { statusOf: { params: [{ data: "string" }], returns: { data: "string" } } },
  slots: { tabs: { data: { title: "string" } } },
};
const host = (salt = "") =>
  hashed({
    ifaces: { "core#Sessions": { ...Sessions, name: `Sessions${salt}` } },
    types: {},
    modules: {
      root: manifest({ name: "root", children: ["core"] }),
      core: manifest({ name: "core", provides: { sessions: "Sessions" } }),
    },
  });
const plugin = (name: string, title: unknown = "T", dependsOn?: string[]): PluginTable => ({
  name,
  dependsOn,
  table: hashed({
    ifaces: {},
    types: {},
    modules: {
      [name]: manifest({
        name,
        contributes: { "core.tabs": [{ id: `${name}.tab`, title } as never] },
      }),
    },
  }),
});

/** A stand-in for the full kernel: records which plugin tables it was asked about. */
function fakeCheck(failing: ReadonlySet<string> = new Set()) {
  const checked: string[][] = [];
  const check: FullCheck = {
    checkTables: (_host, extras = []) => {
      const names = extras.map((t) => Object.keys(t.modules)[0]!);
      checked.push(names);
      const problems: Problem[] = [
        { path: `/root/${names.at(-1)}`, kind: "no-such-slot", slotKey: "x.y" },
      ];
      return failing.has(names.at(-1)!) ? problems : [];
    },
    describeProblem: (p) => `${p.path}: ${p.kind}`,
  };
  const loadCheck = vi.fn(async () => check);
  return { checked, loadCheck };
}
const names = (ps: readonly { name: string }[]) => ps.map((p) => p.name);

let storage: MemoryStorage;
beforeEach(() => {
  storage = stubLocalStorage(memoryStorage());
});
afterEach(() => setSafeMode(false));

describe("verifyPlugins", () => {
  it("checks what it has not seen, then loads no check for the same host and plugins", async () => {
    const h = host();
    const plugins = [plugin("a"), plugin("b")];
    const first = fakeCheck();
    const out = await verifyPlugins(h, plugins, { loadCheck: first.loadCheck });
    expect(names(out.accepted)).toEqual(["a", "b"]);
    expect(first.checked).toEqual([["a"], ["b"]]);
    const again = fakeCheck();
    const second = await verifyPlugins(h, plugins, { loadCheck: again.loadCheck });
    expect(names(second.accepted)).toEqual(["a", "b"]);
    expect(again.loadCheck).not.toHaveBeenCalled();
  });

  it("checks only the unverified plugin, together with its dependencies", async () => {
    const h = host();
    await verifyPlugins(h, [plugin("a"), plugin("b")], { loadCheck: fakeCheck().loadCheck });
    const next = fakeCheck();
    const out = await verifyPlugins(h, [plugin("a"), plugin("b"), plugin("c", "T", ["a"])], {
      loadCheck: next.loadCheck,
    });
    expect(names(out.accepted)).toEqual(["a", "b", "c"]);
    expect(next.checked).toEqual([["a", "c"]]);
  });

  it("re-checks what was verified with a dependency whose table changed", async () => {
    const h = host();
    await verifyPlugins(h, [plugin("a"), plugin("c", "T", ["a"])], {
      loadCheck: fakeCheck().loadCheck,
    });
    const next = fakeCheck();
    await verifyPlugins(h, [plugin("a", "Changed"), plugin("c", "T", ["a"])], {
      loadCheck: next.loadCheck,
    });
    expect(next.checked).toEqual([["a"], ["a", "c"]]);
  });

  it("reports failures and never remembers them; refuses a missing dependency unchecked", async () => {
    const h = host();
    const run = () => fakeCheck(new Set(["bad"]));
    const first = run();
    const out = await verifyPlugins(h, [plugin("bad"), plugin("lonely", "T", ["ghost"])], {
      loadCheck: first.loadCheck,
    });
    expect(out.accepted).toEqual([]);
    expect(out.rejected.map((r) => [r.plugin.name, r.problems])).toEqual([
      ["bad", ["/root/bad: no-such-slot"]],
      ["lonely", ["depends on 'ghost', which is not installed"]],
    ]);
    expect(first.checked).toEqual([["bad"]]);
    const second = run();
    await verifyPlugins(h, [plugin("bad")], { loadCheck: second.loadCheck });
    expect(second.checked).toEqual([["bad"]]);
  });

  it("keys a table by its own content: a claimed hash is ignored, key order does not matter", async () => {
    const h = host();
    const a = plugin("a");
    await verifyPlugins(h, [a], { loadCheck: fakeCheck().loadCheck });
    const { modules, types, ifaces } = a.table;
    const reordered = {
      ...a,
      table: { hash: plugin("b").table.hash!, modules, types, ifaces },
    };
    const run = fakeCheck();
    await verifyPlugins(h, [reordered], { loadCheck: run.loadCheck });
    expect(run.loadCheck).not.toHaveBeenCalled();
    expect(await tableKey(reordered.table)).toBe(await tableKey(a.table));
  });
});

describe("the verified cache", () => {
  const stored = () =>
    JSON.parse(storage.map.get(VERIFIED_CACHE_KEY)!) as {
      v: number;
      hosts: { host: string; plugins: Record<string, string[]> }[];
    };

  it("keeps the current host and the most recently used, so going back hits", async () => {
    const hosts = Array.from({ length: KEPT_HOSTS + 1 }, (_, i) => host(String(i)));
    for (const h of hosts)
      await verifyPlugins(h, [plugin("a")], { loadCheck: fakeCheck().loadCheck });
    expect(stored().hosts.map((e) => e.host)).toEqual(
      hosts
        .slice(1)
        .reverse()
        .map((h) => hostIdentity(h)),
    );
    const back = fakeCheck();
    await verifyPlugins(hosts[1]!, [plugin("a")], { loadCheck: back.loadCheck });
    expect(back.loadCheck).not.toHaveBeenCalled();
    expect(stored().hosts[0]!.host).toBe(hostIdentity(hosts[1]!));
    const gone = fakeCheck();
    await verifyPlugins(hosts[0]!, [plugin("a")], { loadCheck: gone.loadCheck });
    expect(gone.loadCheck).toHaveBeenCalledOnce();
  });

  it("drops plugin hashes that are no longer installed", async () => {
    const h = host();
    await verifyPlugins(h, [plugin("a"), plugin("b")], { loadCheck: fakeCheck().loadCheck });
    await verifyPlugins(h, [plugin("b")], { loadCheck: fakeCheck().loadCheck });
    expect(Object.keys(stored().hosts[0]!.plugins)).toEqual([await tableKey(plugin("b").table)]);
  });

  it("keeps verdicts through a load that lists nothing or refuses a plugin unchecked", async () => {
    const h = host();
    await verifyPlugins(h, [plugin("a"), plugin("b")], { loadCheck: fakeCheck().loadCheck });
    const before = stored().hosts[0]!.plugins;
    await verifyPlugins(h, [], { loadCheck: fakeCheck().loadCheck });
    expect(stored().hosts[0]!.plugins).toEqual(before);
    const missing = { ...plugin("a"), dependsOn: ["gone"] };
    const out = await verifyPlugins(h, [missing, plugin("b")], {
      loadCheck: fakeCheck().loadCheck,
    });
    expect(names(out.rejected.map((r) => r.plugin))).toEqual(["a"]);
    expect(stored().hosts[0]!.plugins).toEqual(before);
    const back = fakeCheck();
    await verifyPlugins(h, [plugin("a"), plugin("b")], { loadCheck: back.loadCheck });
    expect(back.loadCheck).not.toHaveBeenCalled();
  });

  it("treats junk or another version as empty, and replaces it", async () => {
    for (const junk of [
      "{not json",
      JSON.stringify({ v: VERIFIED_CACHE_VERSION + 1, hosts: [] }),
    ]) {
      storage.map.set(VERIFIED_CACHE_KEY, junk);
      const run = fakeCheck();
      await verifyPlugins(host(), [plugin("a")], { loadCheck: run.loadCheck });
      expect(run.checked).toEqual([["a"]]);
      expect(stored().v).toBe(VERIFIED_CACHE_VERSION);
    }
  });

  it("with blocked storage, verifies every time and still answers", async () => {
    stubLocalStorage(blockedStorage());
    for (let i = 0; i < 2; i++) {
      const run = fakeCheck();
      const out = await verifyPlugins(host(), [plugin("a")], { loadCheck: run.loadCheck });
      expect(names(out.accepted)).toEqual(["a"]);
      expect(run.checked).toEqual([["a"]]);
    }
  });

  it("is neither read nor written in safe mode", async () => {
    await verifyPlugins(host(), [plugin("a")], { loadCheck: fakeCheck().loadCheck });
    const before = storage.map.get(VERIFIED_CACHE_KEY);
    setSafeMode(true);
    const run = fakeCheck();
    await verifyPlugins(host(), [plugin("a"), plugin("b")], { loadCheck: run.loadCheck });
    expect(run.checked).toEqual([["a"], ["b"]]);
    expect(storage.map.get(VERIFIED_CACHE_KEY)).toBe(before);
  });
});

describe("verifyPlugins with the real kernel", () => {
  it("refuses a plugin whose contribution does not fit the host's slot", async () => {
    const out = await verifyPlugins(host(), [plugin("good"), plugin("bad", 42)]);
    expect(names(out.accepted)).toEqual(["good"]);
    expect(out.rejected[0]!.plugin.name).toBe("bad");
    expect(out.rejected[0]!.problems[0]).toContain("contribution 'bad.tab' to 'core.tabs'");
  });
});
