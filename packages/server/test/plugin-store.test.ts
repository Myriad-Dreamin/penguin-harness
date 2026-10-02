/**
 * The plugin store (src/plugin/store.ts): one content-addressed entry per plugin tarball under
 * `<root>/plugin-store/packages/[<@scope>/]<bucket>/<name>/<version>/<key>/`, complete only
 * with its `.stored`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discardDir,
  fetchIntoStore,
  PluginIntegrityMismatch,
  pluginStoreDir,
  programEntry,
  readStore,
  shippedNames,
  storeSources,
  storeTarball,
  syncPluginStore,
} from "../src/plugin/store.js";
import { createHash } from "node:crypto";
import {
  entryDir,
  entryKey,
  nameSegments,
  tarballIntegrity,
} from "../../../scripts/plugin-entry.mjs";
import { PluginInstallError } from "../src/plugin/install.js";
import { integrityOf, packDir } from "./plugin-fixtures.js";

let dir: string;
let root: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-store-"));
  root = path.join(dir, "root");
  await fs.mkdir(root);
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function write(base: string, files: Record<string, string>, mode = 0o644): Promise<void> {
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(base, ...rel.split("/"));
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, text);
    await fs.chmod(abs, rel.endsWith("/bin/tool") ? 0o755 : mode);
  }
}

/** The plugin's package directory under `at`: a package.json and its entry. */
async function packageAt(
  at: string,
  { version = "1.0.0", body = "export default {};" } = {},
): Promise<string> {
  await write(at, {
    "package.json": JSON.stringify({
      name: "@acme/sandbox-x",
      version,
      description: "A sandbox backend",
      author: "Ada <ada@example.com>",
      license: "MIT",
      categories: ["sandbox"],
    }),
    "dist/index.js": body,
  });
  return at;
}

/** The plugin packed into a tarball under `at`: the file and its npm integrity. */
async function packed(at: string, options?: Parameters<typeof packageAt>[1]) {
  const file = path.join(at, "x.tgz");
  const integrity = await packDir(await packageAt(path.join(at, "src"), options), file);
  return { file, integrity };
}

/** Stores the plugin packed by `packed`. */
async function store(at: string, options?: Parameters<typeof packageAt>[1]) {
  const { file, integrity } = await packed(at, options);
  return storeTarball(root, file, integrity);
}

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(
    () => true,
    () => false,
  );
}

describe("plugin store", () => {
  it("integrity is npm's: the sha512 of the tarball's bytes, and the entry key is its first 16 base64 characters, path safe", async () => {
    const tarball = path.join(dir, "x-1.0.0.tgz");
    await fs.writeFile(tarball, Buffer.from("a tarball's bytes"));
    const digest = createHash("sha512").update("a tarball's bytes").digest();
    const integrity = await tarballIntegrity(tarball);
    expect(integrity).toBe(`sha512-${digest.toString("base64")}`);
    expect(entryKey(integrity)).toBe(digest.toString("base64url").slice(0, 16));
    expect(entryKey(`sha512-${"+/".repeat(43)}==`)).toBe("-_".repeat(8));
    // Anything else is not a key: the sha256 form the store used before, or a truncated value.
    expect(entryKey(`sha256-${"ab".repeat(32)}`)).toBeNull();
    expect(entryKey(integrity.slice(0, -4))).toBeNull();
  });

  it("stores a tarball as one entry keyed by its content: the tarball itself, its manifest, its marker", async () => {
    const entry = await store(path.join(dir, "a"));
    expect(entry.dir).toBe(
      path.join(
        pluginStoreDir(root),
        "packages",
        "@acme",
        "sa",
        "nd",
        "sandbox-x",
        "1.0.0",
        entryKey(entry.integrity)!,
      ),
    );
    expect((await fs.readdir(entry.dir)).sort()).toEqual([
      ".stored",
      "manifest.toml",
      "package.tgz",
    ]);
    // The stored bytes are the tarball's: they hash to the entry's integrity at any time.
    expect(await tarballIntegrity(path.join(entry.dir, "package.tgz"))).toBe(entry.integrity);
    const manifest = parseToml(await fs.readFile(path.join(entry.dir, "manifest.toml"), "utf8"));
    expect(manifest).toMatchObject({
      name: "@acme/sandbox-x",
      description: "A sandbox backend",
      authors: ["Ada <ada@example.com>"],
      categories: ["sandbox"],
      integrity: entry.integrity,
    });

    // The same tarball again is the same entry; another content under the same version, or
    // another version, is another.
    const again = await storeTarball(root, path.join(dir, "a", "x.tgz"), entry.integrity);
    expect(again.dir).toBe(entry.dir);
    await store(path.join(dir, "c"), { body: "x" });
    await store(path.join(dir, "d"), { version: "1.1.0" });
    expect((await readStore(root)).map((r) => r.version)).toEqual(["1.0.0", "1.0.0", "1.1.0"]);
  });

  it("refuses a tarball whose bytes do not hash to the integrity it came with", async () => {
    const { file } = await packed(path.join(dir, "a"));
    const other = integrityOf("@acme/sandbox-x", "1.0.0", "other");
    await expect(storeTarball(root, file, other)).rejects.toBeInstanceOf(PluginIntegrityMismatch);
    expect(await readStore(root)).toEqual([]);
  });

  it("files a name under packages/, in the bucket its name spells", () => {
    // The same vectors run in the index repository's tests: one rule, two copies.
    const vectors: Array<[string, string]> = [
      ["a", "packages/1/a"],
      ["ab", "packages/2/ab"],
      ["abc", "packages/3/a/abc"],
      ["abcd", "packages/ab/cd/abcd"],
      ["Sandbox-Bwrap", "packages/sa/nd/Sandbox-Bwrap"],
      ["@penguinharness/x", "packages/@penguinharness/1/x"],
      ["@penguinharness/fs", "packages/@penguinharness/2/fs"],
      ["@penguinharness/git", "packages/@penguinharness/3/g/git"],
      ["@penguinharness/sandbox-bwrap", "packages/@penguinharness/sa/nd/sandbox-bwrap"],
    ];
    for (const [name, want] of vectors) expect(nameSegments(name).join("/")).toBe(want);
    const integrity = `sha512-${Buffer.alloc(64, 0xab).toString("base64")}`;
    expect(entryDir("/t", "@penguinharness/sandbox-bwrap", "0.2.2", integrity)).toBe(
      path.join("/t", "packages/@penguinharness/sa/nd/sandbox-bwrap/0.2.2", "q6urq6urq6urq6ur"),
    );
  });

  it("reads entries under packages/ alone: one elsewhere, or in the wrong bucket, is not an entry", async () => {
    const entry = await store(path.join(dir, "a"));
    const key = path.basename(entry.dir);
    // An earlier layout's copy at the top of the store, and a copy filed in a bucket its name
    // does not spell: both complete, neither read.
    const storeDir = pluginStoreDir(root);
    const elsewhere = [
      path.join(storeDir, "@acme", "sandbox-x", "1.0.0", key),
      path.join(storeDir, "packages", "@acme", "zz", "zz", "sandbox-x", "1.0.0", key),
    ];
    for (const copy of elsewhere) await fs.cp(entry.dir, copy, { recursive: true });
    expect((await readStore(root)).map((e) => e.integrity)).toEqual([entry.integrity]);
  });

  it("an entry without its completion marker does not exist, and the next write replaces it", async () => {
    const entry = await store(path.join(dir, "a"));
    await fs.rm(path.join(entry.dir, ".stored"));
    await fs.writeFile(path.join(entry.dir, "package.tgz"), "half written");
    expect(await readStore(root)).toEqual([]);

    await store(path.join(dir, "b"));
    expect(await tarballIntegrity(path.join(entry.dir, "package.tgz"))).toBe(entry.integrity);
    // The entry arrived with its marker in one rename; the leftover went through `.staging/`.
    expect(await fs.readdir(entry.dir)).toContain(".stored");
    expect(await fs.readdir(path.join(pluginStoreDir(root), ".staging"))).toEqual([]);
  });

  it("discardDir removes a directory in one step, through .staging/", async () => {
    const entry = await store(path.join(dir, "a"));
    await discardDir(root, entry.dir);
    expect(await exists(entry.dir)).toBe(false);
    expect(await readStore(root)).toEqual([]);
    expect(await fs.readdir(path.join(pluginStoreDir(root), ".staging"))).toEqual([]);
    // Gone already is not an error.
    await discardDir(root, entry.dir);
  });

  it("a fetch stores the registry's tarball when it hashes to the index's integrity, and nothing else", async () => {
    const { file, integrity } = await packed(path.join(dir, "registry"));
    // What `npm pack <spec>` leaves in the staging directory: the registry's tarball.
    const fetch = async (_: string, cwd: string) => {
      await fs.copyFile(file, path.join(cwd, "acme-sandbox-x-1.0.0.tgz"));
    };
    const entry = await fetchIntoStore(root, "@acme/sandbox-x@1.0.0", {
      fetch,
      expected: integrity,
    });
    expect(entry).toMatchObject({ name: "@acme/sandbox-x", version: "1.0.0", integrity });

    // The index names another content: refused. npm left no tarball: refused.
    const other = integrityOf("@acme/sandbox-x", "1.0.0", "index");
    await expect(
      fetchIntoStore(root, "@acme/sandbox-x@1.0.0", { fetch, expected: other }),
    ).rejects.toBeInstanceOf(PluginIntegrityMismatch);
    await expect(
      fetchIntoStore(root, "@acme/sandbox-x@1.0.0", { fetch: async () => {}, expected: integrity }),
    ).rejects.toBeInstanceOf(PluginInstallError);
    expect((await readStore(root)).map((e) => e.integrity)).toEqual([integrity]);
    expect(await fs.readdir(path.join(pluginStoreDir(root), ".staging"))).toEqual([]);
  });
});

/** Runs `fn` with `process.argv[1]` — the program's entry, where the installation is read — set. */
async function withEntry<T>(entry: string, fn: () => Promise<T>): Promise<T> {
  const argv1 = process.argv[1];
  process.argv[1] = entry;
  try {
    return await fn();
  } finally {
    process.argv[1] = argv1!;
  }
}

describe("the installation's prefix", () => {
  it("is found beside the entry's target, not beside a link to it (the Docker image)", async () => {
    // /opt/penguin/lib/{dist/penguin.js, plugins/}, started as /usr/local/bin/penguin → the entry.
    const lib = path.join(dir, "opt", "penguin", "lib");
    await write(lib, { "dist/penguin.js": "" });
    const link = path.join(dir, "usr", "local", "bin", "penguin");
    await fs.mkdir(path.dirname(link), { recursive: true });
    await fs.symlink(path.join(lib, "dist", "penguin.js"), link);
    const real = await fs.realpath(lib);
    expect(programEntry(link)).toBe(path.join(real, "dist", "penguin.js"));
    expect(storeSources(null, link)).toEqual([path.join(real, "plugins")]);
  });

  it("of the CLI's npm package lists plugins without carrying them: they are fetched, not shipped", async () => {
    // <pkg>/{dist/penguin.js, plugins/index.json} and no node_modules: what `npm install -g`
    // leaves (scripts/cli-plugin-index.mjs writes the index).
    const pkg = path.join(dir, "global", "lib", "node_modules", "@prismshadow", "penguin-cli");
    const row = {
      name: "@acme/sandbox-x",
      version: "1.0.0",
      integrity: integrityOf("@acme/sandbox-x", "1.0.0"),
    };
    await write(pkg, { "dist/penguin.js": "", "plugins/index.json": JSON.stringify([row]) });
    const entry = path.join(pkg, "dist", "penguin.js");
    const logged: string[] = [];
    // Not shipped: an install of it is a registry fetch, not a copy from the prefix.
    expect(await withEntry(entry, () => shippedNames(null))).toEqual([]);
    // Nothing to store at boot, and nothing to complain about.
    const shipped = await withEntry(entry, () =>
      syncPluginStore(root, null, (m) => logged.push(m)),
    );
    expect([...shipped]).toEqual([]);
    expect(logged).toEqual([]);
    expect(await readStore(root)).toEqual([]);
  });
});
