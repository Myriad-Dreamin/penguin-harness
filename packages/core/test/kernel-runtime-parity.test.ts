/**
 * The two kernel entries agree, and the runtime one stays arktype-free once built.
 *
 * - For a tree that resolves by identity (or by `from`), the full `bootModules` and the
 *   runtime `bootVerified` create the same modules in the same order, hand the same
 *   contributions and `use`, and expose the same api — through exports too.
 * - A parked context schema is parsed by arktype once, however many boots validate it.
 * - checkTables runs the full check over generated tables: a consistent host passes, a
 *   plugin table mounted under its root is checked against it, a broken one is refused.
 * - Built (dist/): the runtime entry's import graph has no arktype, and a class decorated
 *   through one entry is read through the other — the decorators are one shared module.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { IfaceDecl, Manifest, ModuleDef, Resources } from "../src/kernel/index.js";
import { bootModules, bootVerified, checkTables, defineModule } from "../src/kernel/index.js";

const rawCalls: string[] = [];
vi.mock("arktype", async () => {
  const actual = await vi.importActual<typeof import("arktype")>("arktype");
  const raw = actual.type.raw.bind(actual.type);
  const type = new Proxy(actual.type, {
    get(target, key, receiver) {
      if (key === "raw")
        return (def: unknown) => {
          rawCalls.push(JSON.stringify(def));
          return raw(def as never);
        };
      return Reflect.get(target, key, receiver);
    },
  });
  return { ...actual, type };
});

const resources: Resources = { register: () => () => {}, claim: () => undefined };
const str = { data: "string" } as const;
const Sessions: IfaceDecl = {
  name: "Sessions",
  methods: { statusOf: { params: [str], returns: { data: "string" } } },
  slots: { tabs: { data: { title: "string" }, code: { opaque: "Tab" } } },
};
const Narrow: IfaceDecl = {
  name: "Narrow",
  methods: { statusOf: { params: [str], returns: { data: "string" } } },
  slots: {},
};
const ifaces = { "core#Sessions": Sessions, "client#Narrow": Narrow };

const manifest = (m: Partial<Manifest> & { name: string }): Manifest => ({
  requires: {},
  provides: {},
  contributes: {},
  children: [],
  ...m,
});

/** A tree with exact wiring, a `from` wiring, an export, data and code contributions. */
function tree(log: string[]): ModuleDef {
  const api = { statusOf: (id: string) => `idle:${id}` };
  const record = (name: string) => (ctx: Parameters<ModuleDef["create"]>[0]) => {
    log.push(
      `${name} use=${Object.keys(ctx.use).join(",")} contributions=${JSON.stringify(ctx.contributions)}`,
    );
  };
  return defineModule(manifest({ name: "root", children: ["group", "client", "tabber"] }), {
    create: () => ({ api: {} }),
    children: [
      defineModule(
        manifest({
          name: "group",
          provides: { sessions: "core#Sessions" },
          exports: ["sessions"],
          children: ["core"],
        }),
        {
          create: (ctx) => (record("group")(ctx), { api: {} }),
          children: [
            defineModule(manifest({ name: "core", provides: { sessions: "Sessions" } }), {
              create: (ctx) => (record("core")(ctx), { api: { sessions: api } }),
            }),
          ],
        },
      ),
      defineModule(
        manifest({
          name: "client",
          requires: {
            exact: { iface: "core#Sessions" },
            narrow: { iface: "Narrow", from: "group" },
          },
        }),
        {
          create: (ctx) => {
            record("client")(ctx);
            log.push(`client same=${ctx.use.exact === api && ctx.use.narrow === api}`);
            return { api: {} };
          },
        },
      ),
      defineModule(
        manifest({ name: "tabber", contributes: { "core.tabs": [{ id: "t1", title: "One" }] } }),
        { create: (ctx) => (record("tabber")(ctx), { api: {}, bind: { t1: "TAB" } }) },
      ),
    ],
  });
}

describe("bootModules and bootVerified", () => {
  it("create the same modules in the same order with the same inputs and api", async () => {
    const full: string[] = [];
    const runtime: string[] = [];
    const a = await bootModules(tree(full), { ifaces, resources });
    const b = await bootVerified(tree(runtime), { ifaces, resources });
    expect(runtime).toEqual(full);
    expect(full).toContain("client same=true");
    expect(full.find((l) => l.startsWith("core "))).toContain('"code":"TAB"');
    expect(Object.keys(b.park())).toEqual(Object.keys(a.park()));
    expect(b.api<{ statusOf(id: string): string }>("group", "sessions").statusOf("x")).toBe(
      a.api<{ statusOf(id: string): string }>("group", "sessions").statusOf("x"),
    );
    a.dispose();
    b.dispose();
  });
});

describe("a parked context schema", () => {
  it("is parsed by arktype once, however many boots validate it", async () => {
    const schema = { marker: "'context-memo'" };
    const boot = () =>
      bootModules(
        defineModule(manifest({ name: "solo", context: { version: 1, schema } }), {
          create: () => ({ api: {} }),
        }),
        { ifaces: {}, resources, parked: { solo: { v: 1, self: { marker: "context-memo" } } } },
      );
    for (let i = 0; i < 3; i++) (await boot()).dispose();
    expect(rawCalls.filter((c) => c === JSON.stringify(schema))).toHaveLength(1);
  });
});

describe("checkTables", () => {
  const host = {
    hash: "h",
    ifaces,
    types: {},
    modules: {
      root: manifest({ name: "root", children: ["core"] }),
      core: manifest({ name: "core", provides: { sessions: "Sessions" } }),
    },
  };
  const plugin = (requires: Manifest["requires"], contributes: Manifest["contributes"] = {}) => ({
    hash: "p",
    ifaces: { "client#Narrow": Narrow },
    types: {},
    modules: { client: manifest({ name: "client", requires, contributes }) },
  });

  it("passes a consistent host, and a plugin that fits it structurally", () => {
    expect(checkTables(host)).toEqual([]);
    expect(checkTables(host, [plugin({ s: { iface: "Narrow" } })])).toEqual([]);
  });

  it("refuses a plugin whose contribution does not fit the slot, or whose requirement nothing provides", () => {
    const bad = checkTables(host, [plugin({}, { "core.tabs": [{ id: "x", title: 1 }] })]);
    expect(bad.map((p) => p.kind)).toEqual(["bad-contribution"]);
    const unresolved = checkTables(host, [plugin({ s: { iface: "Narrow", from: "nobody" } })]);
    expect(unresolved.map((p) => p.kind)).toEqual(["unresolved"]);
  });

  it("throws on a malformed table", () => {
    expect(() =>
      checkTables({
        ...host,
        modules: { ...host.modules, root: { name: "root", children: ["ghost"] } },
      }),
    ).toThrow(/ghost/);
    const cycle = {
      ...plugin({}),
      modules: {
        a: manifest({ name: "a", children: ["b"] }),
        b: manifest({ name: "b", children: ["a"] }),
      },
    };
    expect(() => checkTables(host, [cycle])).toThrow(/\[a, b\] are reachable only through a cycle/);
  });
});

const dist = join(dirname(fileURLToPath(import.meta.url)), "../dist/kernel");
const built = existsSync(join(dist, "runtime.js"));

describe.skipIf(!built)("the built kernel entries", () => {
  it("the runtime entry's import graph has no arktype", () => {
    const seen = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file) || seen.size > 200) return;
      seen.add(file);
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/from\s*["']arktype["']|import\(\s*["']arktype["']\s*\)/);
      for (const m of text.matchAll(/(?:from|import)\s*["'](\.{1,2}\/[^"']+)["']/g))
        walk(join(dirname(file), m[1]!));
    };
    walk(join(dist, "runtime.js"));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("a class decorated through one entry is read through the other", async () => {
    const runtime = (await import(
      join(dist, "runtime.js")
    )) as typeof import("../src/kernel/runtime.js");
    const full = (await import(join(dist, "index.js"))) as typeof import("../src/kernel/index.js");
    class Shared {}
    runtime.Module()(Shared, { name: "Shared", kind: "class" } as ClassDecoratorContext);
    expect(full.moduleMetaOf(Shared)).toMatchObject({ name: "Shared", kind: "module" });
    expect(full.Module).toBe(runtime.Module);
  });
});
