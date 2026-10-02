/**
 * Plugin activation: a process loads the store entries one file names, `<root>/plugins/current`
 * (the selection); the selection is resolved from the closure.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  activatePlugins,
  chooseEntry,
  readCurrent,
  selectedPackageDir,
} from "../src/plugin/activation.js";
import type { PluginAsk } from "../src/plugin/activation.js";
import { storeEntryDir, storePackage } from "../src/plugin/store.js";
import type { StoreIndexEntry } from "../src/plugin/store.js";
import { integrityOf, writeClassPackage, writeShippedIndex } from "./plugin-fixtures.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "penguin-activation-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A package in an assets directory's `plugins/` prefix, listed in its index: what a push ships. */
async function ship(assets: string, name: string, module: string, version = "1.0.0") {
  const prefix = path.join(assets, "plugins");
  await writeClassPackage(path.join(prefix, "node_modules", ...name.split("/")), {
    name,
    module,
    version,
  });
  const file = path.join(prefix, "package.json");
  const manifest = JSON.parse(await readFile(file, "utf8").catch(() => "{}")) as {
    dependencies?: Record<string, string>;
  };
  manifest.dependencies = { ...manifest.dependencies, [name]: version };
  await writeFile(file, JSON.stringify(manifest));
  await writeShippedIndex(prefix);
}

/** A package fetched from the registry, stored the way a fetch stores it. */
async function fetched(name: string, module: string, version: string) {
  const prefix = path.join(root, "fetched", `${module}-${version}`);
  await mkdir(prefix, { recursive: true });
  await writeFile(path.join(prefix, "package.json"), "{}");
  const dir = path.join(prefix, "node_modules", ...name.split("/"));
  await writeClassPackage(dir, { name, module, version });
  return storePackage(root, dir, prefix, integrityOf(name, version, `fetched:${module}`));
}

const asks = (entries: Record<string, PluginAsk[]>) => new Map(Object.entries(entries));

describe("the selection", () => {
  it("names store entries, is rewritten only when it changes, and records the one before it", async () => {
    const assets = path.join(root, "hmr", "store", "assets", "a");
    await ship(assets, "@acme/one", "One");
    await ship(assets, "@acme/two", "Two");
    const first = await activatePlugins(root, asks({ "@acme/one": [{}] }), assets);
    expect(first.changed).toBe(true);
    expect(readCurrent(root)).toEqual(first.current);
    expect(first.current.previous).toBeNull();
    const [row] = first.current.plugins;
    expect(selectedPackageDir(root, row!)).toBe(
      path.join(storeEntryDir(root, row!.name, row!.version, row!.integrity), "package"),
    );
    // Nothing but the selection file is written under plugins/.
    expect(await readdir(path.join(root, "plugins"))).toEqual(["current"]);

    const file = path.join(root, "plugins", "current");
    const written = (await stat(file)).mtimeMs;
    const same = await activatePlugins(root, asks({ "@acme/one": [{}] }), assets);
    expect(same.changed).toBe(false);
    expect((await stat(file)).mtimeMs).toBe(written);

    const both = await activatePlugins(
      root,
      asks({ "@acme/one": [{}], "@acme/two": [{}] }),
      assets,
    );
    expect(both.changed).toBe(true);
    expect(both.current.previous).toEqual(first.current.plugins);
    expect(both.current.plugins.map((e) => e.name)).toEqual(["@acme/one", "@acme/two"]);
  });

  it("switches to the content a push brings under an unchanged name and version", async () => {
    const before = path.join(root, "hmr", "store", "assets", "before");
    const after = path.join(root, "hmr", "store", "assets", "after");
    await ship(before, "@acme/one", "Before");
    await ship(after, "@acme/one", "After");
    const first = await activatePlugins(root, asks({ "@acme/one": [{}] }), before);
    const second = await activatePlugins(root, asks({ "@acme/one": [{}] }), after);
    expect(second.current.plugins[0]!.integrity).not.toBe(first.current.plugins[0]!.integrity);
    const index = await readFile(
      path.join(selectedPackageDir(root, second.current.plugins[0]!), "index.js"),
      "utf8",
    );
    expect(index).toContain("After");
  });

  it("reads an earlier layout's pointer as no selection, and replaces it", async () => {
    await mkdir(path.join(root, "plugins", "0123456789abcdef"), { recursive: true });
    await writeFile(path.join(root, "plugins", "current"), "0123456789abcdef\n");
    expect(readCurrent(root)).toBeNull();
    await fetched("@acme/one", "One", "1.0.0");
    const done = await activatePlugins(root, asks({ "@acme/one": [{}] }), null);
    expect(done).toMatchObject({ changed: true, before: null });
    expect(readCurrent(root)?.plugins.map((e) => e.name)).toEqual(["@acme/one"]);
  });

  it("reports what it cannot place, and places the rest", async () => {
    await fetched("@acme/old", "Old", "1.0.0");
    const { missing } = await activatePlugins(
      root,
      asks({ "@acme/old": [{ version: "^2.0.0" }], "@acme/absent": [{}] }),
      null,
    );
    expect(missing.get("@acme/absent")).toMatch(/not in the plugin store/);
    expect(missing.get("@acme/old")).toMatch(/no stored '@acme\/old' satisfies \^2\.0\.0/);
  });
});

describe("choosing an entry", () => {
  const entry = (version: string, hex: string): StoreIndexEntry => ({
    name: "@acme/p",
    version,
    description: "",
    authors: [],
    license: "",
    integrity: integrityOf("@acme/p", version, hex),
  });

  it("takes a pin, else the highest version every ask admits, the build's content within one", () => {
    const v1 = entry("1.0.0", "1");
    const v12 = entry("1.2.0", "2");
    const v12fetched = entry("1.2.0", "0");
    const v2 = entry("2.0.0", "3");
    const stored = [v1, v12fetched, v12, v2];
    const none = new Set<string>();
    expect(chooseEntry("@acme/p", [{}], stored, none)).toBe(v2);
    expect(
      chooseEntry(
        "@acme/p",
        [{ version: "^1.0.0" }, { version: "<2.0.0" }],
        stored,
        new Set([v12.integrity]),
      ),
    ).toBe(v12);
    expect(chooseEntry("@acme/p", [{ integrity: v1.integrity }], stored, none)).toBe(v1);
    expect(
      chooseEntry(
        "@acme/p",
        [{ integrity: v1.integrity }, { integrity: v2.integrity }],
        stored,
        none,
      ),
    ).toMatchObject({ missing: expect.stringMatching(/pinned to 2 different contents/) });
  });
});
