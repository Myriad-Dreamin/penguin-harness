/**
 * A plugin's two sides at build time (scripts/lib/plugin-sides.mjs, scripts/build-plugin.mjs).
 *
 * - A module runs on the side it declares (`@Module({ side: "web" })`), the platform when it
 *   declares none; a side that is neither is an error. Every web module gets its built file.
 *   One source file holding both sides is an error.
 * - A web module requiring an interface its own package restates (declares, provides nowhere)
 *   is an error naming the interface: it must import the web app's declaration. A module
 *   requiring the other host's interface is on the wrong side.
 * - With the host tables at hand, a module naming a module only the other host has (a slot's
 *   owner, a `from`) is declared on the wrong side; without them, that check is skipped.
 * - The build emits the main entry with the platform modules only and one browser module per web
 *   module — an empty one included — with a lazy component in its own chunk; the browser module
 *   carries no copy of React, the kernel or the UI package — imported with a page's shared
 *   instances in place, it decorates through and renders with those very instances.
 * - A web module importing a Node builtin, a package that is not shared, the full kernel (the
 *   page shares only its arktype-free runtime entry) or a UI name outside the app's shared surface
 *   fails the build; a shared UI name resolves to the page's instance.
 * - A web stylesheet's classes go under a prefix the build derives from the package name
 *   (plugin-classes.test.ts).
 * - The plugin pack's cache key folds in the host inputs: the plugin-facing types, the UI
 *   surface, and the host tables by their hash.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import * as Kernel from "@prismshadow/penguin-core/kernel/runtime";
import { moduleDefOf } from "@prismshadow/penguin-core/kernel/runtime";
import type { ManifestTable, ModuleClass } from "@prismshadow/penguin-core/kernel/runtime";
import { assignSides, mixedFiles } from "../../../scripts/lib/plugin-sides.mjs";
import type { Hosts } from "../../../scripts/lib/plugin-sides.mjs";
import { uiSurfaceNames } from "../../../scripts/lib/web-shared.mjs";
import { buildPlugin } from "../../../scripts/build-plugin.mjs";
import { hashBuildInputs } from "../../../scripts/build-plugins.mjs";
import { makeTempRoot } from "./helpers.js";

const hosts: Hosts = {
  server: { modules: { SandboxModule: { provides: { sandbox: "server#Sandbox" } } } },
  web: { modules: { ChatModule: { provides: { chat: "web#Chat" } } } },
};

const m = (name: string, more: object = {}) => ({
  name,
  requires: {} as Record<string, { iface: string; from?: string }>,
  provides: {} as Record<string, string>,
  contributes: {},
  ...more,
});

/** assignSides over `manifests`, each module in its own file; returns the errors and the result. */
const assign = (
  manifests: Record<string, ReturnType<typeof m>>,
  declared: Record<string, string>,
  opts: Parameters<typeof assignSides>[3] = {},
) => {
  const sources = new Map(Object.keys(manifests).map((n) => [n, `src/${n}.ts`]));
  const errors = assignSides(manifests, sources, new Map(Object.entries(declared)), opts);
  return {
    errors,
    out: manifests as Record<string, { side?: string; file?: string; source?: string }>,
  };
};

describe("the declared side", () => {
  it("is the platform unless the module declares the web; every web module gets its file", () => {
    const { errors, out } = assign(
      {
        Box: m("Box", { contributes: { "SandboxModule.providers": [{ id: "b" }] } }),
        Player: m("Player", { contributes: { "ChatModule.fileRenderers": [{ id: "p" }] } }),
        Removal: m("Removal", { contributes: { "ShellModule.pageRemovals": [{ id: "r" }] } }),
      },
      { Player: "web", Removal: "web" },
    );
    expect(errors).toEqual([]);
    expect(out.Box).toMatchObject({ side: "server", source: "src/Box.ts" });
    expect(out.Box!.file).toBeUndefined();
    expect(out.Player).toMatchObject({ side: "web", file: "dist/web/Player.js" });
    expect(out.Removal).toMatchObject({ side: "web", file: "dist/web/Removal.js" });
  });

  it("refuses a side that is neither", () => {
    const { errors } = assign({ Odd: m("Odd") }, { Odd: "browser" });
    expect(errors).toEqual([`Odd: side 'browser' is neither "server" nor "web"`]);
  });

  it("refuses one file holding modules of both sides", () => {
    expect(
      mixedFiles(
        { Box: "src/a.ts", Player: "src/a.ts", Other: "src/b.ts" },
        { Box: "server", Player: "web", Other: "web" },
      ),
    ).toEqual([
      "src/a.ts: holds web module(s) [Player] and platform module(s) [Box] — one side per file",
    ]);
  });

  it("refuses a web module requiring a restated copy of a host interface, naming it", () => {
    const { errors } = assign(
      {
        Copy: m("Copy", { requires: { lang: { iface: "@acme/p#Language" } } }),
        Host: m("Host", { requires: { lang: { iface: "@prismshadow/penguin-web#Language" } } }),
        Own: m("Own", { requires: { thing: { iface: "@acme/p#Thing" } } }),
        Maker: m("Maker", { provides: { thing: "@acme/p#Thing" } }),
        // On the platform a requirement is met structurally: a consumer-declared shape is fine.
        Shaped: m("Shaped", { requires: { lang: { iface: "@acme/p#Shape" } } }),
      },
      { Copy: "web", Host: "web", Own: "web", Maker: "web" },
      { pkgName: "@acme/p" },
    );
    expect(errors).toEqual([
      expect.stringMatching(
        /^Copy: requires\.lang names '@acme\/p#Language', an interface this package declares and none of its modules provides .*@prismshadow\/penguin-web\/plugin-types$/,
      ),
    ]);
  });

  it("refuses a module requiring the other host's interface", () => {
    const { errors } = assign(
      { Lost: m("Lost", { requires: { lang: { iface: "@prismshadow/penguin-web#Language" } } }) },
      {},
    );
    expect(errors).toEqual([
      `Lost: requires.lang is the web app's interface '@prismshadow/penguin-web#Language', but the module is declared for the platform — declare @Module({ side: "web" })`,
    ]);
  });

  it("refuses, with the host tables, a module naming a module only the other host has", () => {
    const manifests = () => ({
      Player: m("Player", { contributes: { "ChatModule.fileRenderers": [{ id: "p" }] } }),
      Box: m("Box", { requires: { s: { iface: "x#S", from: "SandboxModule" } } }),
      Elsewhere: m("Elsewhere", { contributes: { "OtherPlugin.actions": [{ id: "e" }] } }),
    });
    const { errors } = assign(manifests(), { Box: "web" }, { hosts });
    expect(errors).toEqual([
      `Player: its contribution to 'ChatModule.fileRenderers' names the web app's module 'ChatModule', but the module is declared for the platform — declare @Module({ side: "web" })`,
      `Box: its requirement 's' names the platform's module 'SandboxModule', but the module is declared for the web app — declare @Module({ side: "server" })`,
    ]);
    // Without both tables (a plugin built before the hosts) the check is skipped.
    expect(assign(manifests(), { Box: "web" }, { hosts: { web: hosts.web } }).errors).toEqual([]);
  });
});

/** A plugin package as gen-ifaces leaves it: sources and a table with sides decided. */
async function writePackage(dir: string, player: string): Promise<void> {
  await fs.mkdir(path.join(dir, "src"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "@acme/both",
      version: "1.0.0",
      type: "module",
      // External on the platform side, like a runtime dependency (nothing to resolve here).
      peerDependencies: { "@prismshadow/penguin-core": "*" },
    }),
  );
  await fs.writeFile(
    path.join(dir, "src", "box.ts"),
    `import { Module } from "@prismshadow/penguin-core/plugin";
@Module({ contributes: { "SandboxModule.providers": [{ id: "b" }] } })
export class Box {}
`,
  );
  await fs.writeFile(path.join(dir, "src", "player.ts"), player);
  await fs.writeFile(
    path.join(dir, "src", "view.ts"),
    `export default function View() { return "the player"; }\n`,
  );
  const manifest = (name: string, side: string, source: string, contributes: object) => ({
    name,
    kind: "module",
    requires: {},
    provides: {},
    contributes,
    children: [],
    side,
    source,
    ...(side === "web" ? { file: `dist/web/${name}.js` } : {}),
  });
  await fs.writeFile(
    path.join(dir, "ifaces.json"),
    JSON.stringify({
      hash: "h",
      ifaces: {},
      types: {},
      modules: {
        Box: manifest("Box", "server", "src/box.ts", { "SandboxModule.providers": [{ id: "b" }] }),
        Player: manifest("Player", "web", "src/player.ts", {
          "ChatModule.fileRenderers": [{ id: "p", extensions: ["mp3"] }],
        }),
      },
      plugin: { modules: ["Box", "Player"], replaces: [] },
    }),
  );
}

const PLAYER = `import { lazy } from "react";
import { Bind, Module } from "@prismshadow/penguin-core/plugin";
@Module({ contributes: { "ChatModule.fileRenderers": [{ id: "p", extensions: ["mp3"] }] } })
export class Player {
  @Bind("p") view = lazy(() => import("./view"));
}
`;

describe("the plugin build", () => {
  const roots: string[] = [];
  afterEach(async () => {
    delete (globalThis as Record<string, unknown>).__penguinShared;
    for (const r of roots.splice(0)) await fs.rm(r, { recursive: true, force: true });
  });
  const pkgDir = async (player = PLAYER) => {
    const dir = await makeTempRoot();
    roots.push(dir);
    await writePackage(dir, player);
    return dir;
  };

  it("emits the platform entry and one browser module per web module, sharing the page's instances", async () => {
    const dir = await pkgDir();
    expect(await buildPlugin(dir, { minify: false })).toEqual({ web: ["Player"], server: ["Box"] });
    const main = await fs.readFile(path.join(dir, "dist", "index.js"), "utf8");
    expect(main).toContain("Box");
    expect(main).not.toContain("Player");

    const web = await fs.readdir(path.join(dir, "dist", "web"));
    expect(web).toContain("Player.js");
    expect(web.some((f) => /^chunk-.*\.js$/.test(f))).toBe(true);
    let all = "";
    for (const f of web) all += await fs.readFile(path.join(dir, "dist", "web", f), "utf8");
    // No copy of a shared package: no React source, no kernel decorators, no kernel boot.
    expect(all).not.toMatch(/react\.production|__SECRET_INTERNALS|ReactSharedInternals/);
    expect(all).not.toContain("@prismshadow/penguin-core/kernel:meta");
    expect(all).not.toContain("module tree rejected");

    // Imported with a page's instances in place, it uses exactly those.
    const lazyMarker = { lazy: true };
    const react = { lazy: (load: () => unknown) => ({ ...lazyMarker, load }) };
    (globalThis as Record<string, unknown>).__penguinShared = Object.freeze({
      react,
      "@prismshadow/penguin-core/kernel/runtime": Kernel,
    });
    const mod = (await import(pathToFileURL(path.join(dir, "dist", "web", "Player.js")).href)) as {
      default: ModuleClass;
    };
    const table = JSON.parse(await fs.readFile(path.join(dir, "ifaces.json"), "utf8")) as {
      modules: ManifestTable;
    };
    const def = moduleDefOf(mod.default, { manifests: table.modules });
    expect(def.manifest.name).toBe("Player");
    const inst = await def.create(
      {
        use: {},
        contributions: {},
        resources: { register: () => () => {}, claim: () => undefined },
        effect: () => {},
      },
      null,
    );
    const view = inst.bind?.p as { lazy: boolean; load: () => Promise<{ default: () => string }> };
    expect(view.lazy).toBe(true);
    expect((await view.load()).default()).toBe("the player");
  });

  it("emits a browser module for a web module whose class is empty", async () => {
    const dir = await pkgDir(`import { Module } from "@prismshadow/penguin-core/plugin";
@Module({ contributes: { "ChatModule.fileRenderers": [{ id: "p", extensions: ["mp3"] }] } })
export class Player {}
`);
    expect(await buildPlugin(dir)).toEqual({ web: ["Player"], server: ["Box"] });
    const file = path.join(dir, "dist", "web", "Player.js");
    expect((await fs.stat(file)).size).toBeLessThan(4096);
    (globalThis as Record<string, unknown>).__penguinShared = Object.freeze({
      "@prismshadow/penguin-core/kernel/runtime": Kernel,
    });
    const mod = (await import(pathToFileURL(file).href)) as { default: ModuleClass };
    const table = JSON.parse(await fs.readFile(path.join(dir, "ifaces.json"), "utf8")) as {
      modules: ManifestTable;
    };
    expect(moduleDefOf(mod.default, { manifests: table.modules }).manifest.name).toBe("Player");
  });

  it("refuses a table whose web module has no file", async () => {
    const dir = await pkgDir();
    const table = JSON.parse(await fs.readFile(path.join(dir, "ifaces.json"), "utf8")) as {
      modules: Record<string, { file?: string }>;
    };
    delete table.modules.Player!.file;
    await fs.writeFile(path.join(dir, "ifaces.json"), JSON.stringify(table));
    await expect(buildPlugin(dir)).rejects.toThrow(
      "ifaces.json: web module Player has no file 'dist/web/Player.js' — run gen-ifaces",
    );
  });

  it("resolves a shared UI name to the page's instance, and refuses one the app does not share", async () => {
    const using = (name: string) => `import { ${name} } from "@prismshadow/penguin-ui";
import { Bind, Module } from "@prismshadow/penguin-core/plugin";
@Module({ contributes: { "ChatModule.fileRenderers": [{ id: "p", extensions: ["mp3"] }] } })
export class Player {
  @Bind("p") view = ${name};
}
`;
    const shared = uiSurfaceNames()[0]!;
    const dir = await pkgDir(using(shared));
    await buildPlugin(dir, { minify: false });
    const marker = { shared: true };
    (globalThis as Record<string, unknown>).__penguinShared = Object.freeze({
      "@prismshadow/penguin-core/kernel/runtime": Kernel,
      "@prismshadow/penguin-ui": { [shared]: marker },
    });
    const mod = (await import(pathToFileURL(path.join(dir, "dist", "web", "Player.js")).href)) as {
      default: ModuleClass;
    };
    const table = JSON.parse(await fs.readFile(path.join(dir, "ifaces.json"), "utf8")) as {
      modules: ManifestTable;
    };
    const inst = await moduleDefOf(mod.default, { manifests: table.modules }).create(
      {
        use: {},
        contributions: {},
        resources: { register: () => () => {}, claim: () => undefined },
        effect: () => {},
      },
      null,
    );
    expect(inst.bind?.p).toBe(marker);

    const bad = await pkgDir(using("NotOnTheSurface"));
    await expect(buildPlugin(bad)).rejects.toMatchObject({
      errors: [
        expect.objectContaining({
          text: expect.stringMatching(
            /No matching export .*"NotOnTheSurface".*packages\/web\/src\/plugins\/ui-surface\.ts/,
          ),
        }),
      ],
    });
  });

  it("refuses a web module importing a Node builtin", async () => {
    const dir = await pkgDir(`import fs from "node:fs";\n${PLAYER}\nexport const x = fs;\n`);
    await expect(buildPlugin(dir)).rejects.toMatchObject({
      errors: [expect.objectContaining({ text: expect.stringMatching(/Node builtin 'node:fs'/) })],
    });
  });

  it("refuses a web module importing the full kernel", async () => {
    const dir = await pkgDir(
      `import { checkTree } from "@prismshadow/penguin-core/kernel";\n${PLAYER}\nexport const x = checkTree;\n`,
    );
    await expect(buildPlugin(dir)).rejects.toMatchObject({
      errors: [
        expect.objectContaining({
          text: expect.stringMatching(/'@prismshadow\/penguin-core\/kernel' is not shared/),
        }),
      ],
    });
  });

  it("refuses bundling a copy of a package the page does not share", async () => {
    const dir = await pkgDir(
      `import { createPortal } from "react-dom";\n${PLAYER}\nexport const x = createPortal;\n`,
    );
    await expect(buildPlugin(dir)).rejects.toMatchObject({
      errors: [
        expect.objectContaining({ text: expect.stringMatching(/'react-dom' is not shared/) }),
      ],
    });
  });
});

describe("the plugin pack's cache key", () => {
  const roots: string[] = [];
  afterEach(async () => {
    for (const r of roots.splice(0)) await fs.rm(r, { recursive: true, force: true });
  });
  const FILES = [
    "scripts/gen-ifaces.mjs",
    "scripts/build-plugin.mjs",
    "scripts/lib/plugin-classes.mjs",
    "scripts/lib/plugin-sides.mjs",
    "scripts/lib/web-shared.mjs",
    "packages/web/src/plugin-types.ts",
    "packages/web/src/plugins/ui-surface.ts",
  ];
  const write = async (root: string, rel: string, text: string) => {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), text);
  };
  const key = async (root: string) => {
    const h = createHash("sha256");
    await hashBuildInputs(h, root);
    return h.digest("hex");
  };

  it("changes with the UI surface, the plugin-facing types and a host table's hash", async () => {
    const root = await makeTempRoot();
    roots.push(root);
    for (const f of FILES) await write(root, f, `// ${f}\n`);
    const table = (hash: string, pad = "") =>
      `${JSON.stringify({ hash, ifaces: {}, types: {}, modules: {} }, null, pad.length)}\n`;
    await write(root, "packages/server/src/ifaces.json", table("s1"));
    await write(root, "packages/web/src/ifaces.json", table("w1"));
    const base = await key(root);
    // Regenerated with the same content (same hash, other bytes): the same key.
    await write(root, "packages/web/src/ifaces.json", table("w1", "  "));
    expect(await key(root)).toBe(base);
    await write(root, "packages/web/src/ifaces.json", table("w2"));
    const host = await key(root);
    expect(host).not.toBe(base);
    await write(root, "packages/web/src/plugins/ui-surface.ts", "export { Button } from 'x';\n");
    const surface = await key(root);
    expect(surface).not.toBe(host);
    await write(root, "packages/web/src/plugin-types.ts", "// changed\n");
    const types = await key(root);
    expect(types).not.toBe(surface);
    await fs.rm(path.join(root, "packages/server/src/ifaces.json"));
    expect(await key(root)).not.toBe(types);
  });
});
