/**
 * A boot with plugin web modules stays off arktype when every plugin table was verified before
 * (web-root-runtime.test.ts is the same proof for the builtin tree; arktype registers itself as
 * `globalThis.$ark` the moment it is evaluated). Its own file: nothing else here may have loaded
 * the full kernel.
 *
 * - A package whose table is in the verified cache boots, joins the tree and loads no arktype.
 * - An unverified package makes the boot load the full check once: accepted, recorded, joined.
 */
import { describe, expect, it, vi } from "vitest";
// Aliased: gen-ifaces must not read these stand-ins into the app's own table.
import { Bind, Module as PluginModule } from "@prismshadow/penguin-core/kernel/runtime";
import type { WebModulePackage } from "@prismshadow/penguin-server/api";
import table from "../src/ifaces.json";
import { bootWeb } from "../src/web-root";
import { pluginModuleFailures } from "../src/plugins/assemble";
import { hostIdentity, tableKey } from "../src/lib/verify-plugins";
import type { HashedTable } from "../src/lib/verify-plugins";
import { readVerified, recordVerified } from "../src/lib/verified-cache";
import { memoryStorage, stubLocalStorage } from "./helpers/storage";

const created: string[] = [];

const manifest = (name: string, id: string) => ({
  name,
  kind: "module",
  requires: {},
  provides: {},
  contributes: { "ChatModule.fileRenderers": [{ id, extensions: ["mp3"] }] },
  children: [],
  side: "web",
  file: `dist/web/${name}.js`,
});

@PluginModule({})
class SeenBefore {
  @Bind("seen.audio") audio = () => null;
  setup() {
    created.push("SeenBefore");
  }
}

@PluginModule({})
class FirstSight {
  @Bind("first.audio") audio = () => null;
  setup() {
    created.push("FirstSight");
  }
}

const pkg = (name: string, m: ReturnType<typeof manifest>, url: string): WebModulePackage => ({
  package: name,
  version: "1.0.0",
  ifaces: { ifaces: {}, types: {} },
  modules: [{ manifest: m, url }],
  styles: [],
});
const classes: Record<string, unknown> = { "/seen.js": SeenBefore, "/first.js": FirstSight };
const load = async (url: string) => ({ default: classes[url] });

const SEEN = manifest("SeenBefore", "seen.audio");
const FIRST = manifest("FirstSight", "first.audio");
const tableOf = (m: ReturnType<typeof manifest>) => ({
  ifaces: {},
  types: {},
  modules: { [m.name]: m },
});

describe("plugin boot through the runtime entry", () => {
  it("boots a verified plugin without arktype, and checks an unverified one once", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubLocalStorage(memoryStorage());
    const host = hostIdentity(table as unknown as HashedTable);
    const seenKey = (await tableKey(tableOf(SEEN)))!;
    recordVerified(host, new Map([[seenKey, []]]));

    expect("$ark" in globalThis).toBe(false);
    await bootWeb([pkg("@acme/seen", SEEN, "/seen.js")], { load });
    expect(created).toEqual(["SeenBefore"]);
    expect(pluginModuleFailures().size).toBe(0);
    expect("$ark" in globalThis).toBe(false);

    created.length = 0;
    await bootWeb(
      [pkg("@acme/seen", SEEN, "/seen.js"), pkg("@acme/first", FIRST, "/first.js")],
      { load },
    );
    expect(created.sort()).toEqual(["FirstSight", "SeenBefore"]);
    expect(pluginModuleFailures().size).toBe(0);
    expect("$ark" in globalThis).toBe(true);
    const firstKey = (await tableKey(tableOf(FIRST)))!;
    expect([...readVerified(host).keys()].sort()).toEqual([firstKey, seenKey].sort());
  });
});
