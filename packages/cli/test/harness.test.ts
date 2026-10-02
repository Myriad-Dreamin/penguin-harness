/**
 * Which harness runs (src/harness.ts): the pushed one, reached through the `penguin-hmr`
 * loader, when the data root records a usable pushed CLI; the installed one otherwise.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveHarness } from "../src/harness.js";

let dir: string;
let root: string;
let installed: string;
let loader: string;
let bundle: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "penguin-harness-"));
  root = path.join(dir, "root");
  const dist = path.join(dir, "lib", "dist");
  installed = path.join(dist, "penguin.js");
  loader = path.join(dist, "penguin-hmr.js");
  bundle = path.join(root, "hmr", "store", "cli", "x.mjs");
  await fs.mkdir(dist, { recursive: true });
  await fs.writeFile(installed, "");
  await fs.writeFile(loader, "");
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

/** Records a pushed CLI in `<root>/hmr/harness.json`, the bundle file itself present or not. */
async function pushCli(opts: { present: boolean }): Promise<void> {
  await fs.mkdir(path.dirname(bundle), { recursive: true });
  if (opts.present) await fs.writeFile(bundle, "");
  await fs.writeFile(
    path.join(root, "hmr", "harness.json"),
    JSON.stringify({ cli: { bundle: "store/cli/x.mjs" } }),
  );
}

describe("resolveHarness", () => {
  it("is the pushed harness, through the loader, when the root has a pushed CLI", async () => {
    await pushCli({ present: true });
    expect(await resolveHarness(installed, root)).toEqual({
      source: "pushed",
      cliEntry: loader,
      bundle,
    });
  });

  it("is the installed harness when nothing was pushed", async () => {
    expect(await resolveHarness(installed, root)).toEqual({
      source: "installed",
      cliEntry: installed,
      bundle: null,
    });
  });

  it("is the installed harness when the record names a bundle the store no longer has", async () => {
    await pushCli({ present: false });
    expect((await resolveHarness(installed, root)).source).toBe("installed");
  });

  it("is the installed harness when the installation has no loader beside it", async () => {
    await pushCli({ present: true });
    await fs.rm(loader);
    expect(await resolveHarness(installed, root)).toEqual({
      source: "installed",
      cliEntry: installed,
      bundle: null,
    });
  });

  it("is the pushed harness for a process that runs through the loader", async () => {
    await pushCli({ present: true });
    expect(await resolveHarness(loader, root)).toEqual({
      source: "pushed",
      cliEntry: loader,
      bundle,
    });
  });

  it("has no CLI to offer when node cannot re-run the process (a tsx run, a link without .js)", async () => {
    await pushCli({ present: true });
    for (const own of ["/repo/packages/cli/src/penguin.ts", "/usr/local/bin/penguin", undefined]) {
      expect(await resolveHarness(own, root)).toEqual({
        source: "installed",
        cliEntry: null,
        bundle: null,
      });
    }
  });
});
