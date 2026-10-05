/**
 * A plugin's two hosts at build time (scripts/lib/plugin-sides.mjs, scripts/build-plugin.mjs).
 *
 * - A module's host is derived from its wiring: a requirement keyed by a host package, or a
 *   module its contribution, `from` or replacement names that exactly one host table carries.
 *   Web wiring alone makes a web module (with its built file), platform wiring alone a platform
 *   one; both are an error naming the two wirings; none (no wiring, wiring only to siblings,
 *   another plugin or a module no tree has) is the platform, as every server plugin always was.
 *   One source file holding both hosts is an error.
 * - A web module requiring an interface its own package restates (declares, provides nowhere)
 *   is an error naming the interface: it must import the web app's declaration.
 * - The build emits the main entry with the platform modules only and one browser module per web
 *   module — an empty one included — with a lazy component in its own chunk; the browser module
 *   carries no copy of React, the kernel or the UI package — imported with a page's shared
 *   instances in place, it decorates through and renders with those very instances.
 * - A web module importing a Node builtin, a package that is not shared, the full kernel (the
 *   page shares only its arktype-free runtime entry) or a UI name outside the app's shared surface
 *   fails the build; a shared UI name resolves to the page's instance.
 * - A web stylesheet names its Tailwind prefix; a compiled class outside it, or two plugins with
 *   one prefix, is an error.
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
import { assignSides, mixedFiles, readHostTables } from "../../../scripts/lib/plugin-sides.mjs";
import type { Hosts } from "../../../scripts/lib/plugin-sides.mjs";
import { uiSurfaceNames } from "../../../scripts/lib/web-shared.mjs";
import {
  buildPlugin,
  prefixClashes,
  stylePrefixOf,
  unprefixedClasses,
} from "../../../scripts/build-plugin.mjs";
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
  opts: Partial<Parameters<typeof assignSides>[2]> = {},
) => {
  const sources = new Map(Object.keys(manifests).map((n) => [n, `src/${n}.ts`]));
  const errors = assignSides(manifests, sources, { hosts, ...opts });
  return {
    errors,
    out: manifests as Record<string, { side?: string; file?: string; source?: string }>,
  };
};

describe("the derived host", () => {
  it("is the web app for web wiring alone, and every web module gets its file", () => {
    const { errors, out } = assign({
      Player: m("Player", { contributes: { "ChatModule.fileRenderers": [{ id: "p" }] } }),
      Lang: m("Lang", { requires: { lang: { iface: "@prismshadow/penguin-web#Language" } } }),
    });
    expect(errors).toEqual([]);
    expect(out.Player).toMatchObject({ side: "web", file: "dist/web/Player.js" });
    expect(out.Lang).toMatchObject({ side: "web", file: "dist/web/Lang.js" });
    // A replacement names the host module it stands in for.
    const swap = assign({ ChatModule: m("ChatModule") }, { replaces: ["ChatModule"] });
    expect(swap.errors).toEqual([]);
    expect(swap.out.ChatModule).toMatchObject({ side: "web" });
  });

  it("is the platform for platform wiring alone", () => {
    const { errors, out } = assign({
      Box: m("Box", { contributes: { "SandboxModule.providers": [{ id: "b" }] } }),
      Paths: m("Paths", { requires: { p: { iface: "@prismshadow/penguin-server#Paths" } } }),
      Via: m("Via", { requires: { s: { iface: "x#S", from: "SandboxModule" } } }),
    });
    expect(errors).toEqual([]);
    expect(out.Box).toMatchObject({ side: "server", source: "src/Box.ts" });
    expect(out.Box!.file).toBeUndefined();
    expect(out.Paths!.side).toBe("server");
    expect(out.Via!.side).toBe("server");
  });

  it("is the platform with no host wiring, as every server plugin's module always was", () => {
    const both = {
      server: { modules: { ...hosts.server.modules, SessionsModule: {} } },
      web: { modules: { ...hosts.web.modules, SessionsModule: {} } },
    };
    const { errors, out } = assign(
      {
        Bare: m("Bare"),
        Own: m("Own", { requires: { c: { iface: "@acme/p#Config" } } }),
        Sibling: m("Sibling", { contributes: { "Player.extras": [{ id: "s" }] } }),
        Player: m("Player", { contributes: { "ChatModule.fileRenderers": [{ id: "p" }] } }),
        Elsewhere: m("Elsewhere", { contributes: { "OtherPlugin.actions": [{ id: "e" }] } }),
        Shared: m("Shared", { contributes: { "SessionsModule.extras": [{ id: "x" }] } }),
      },
      { hosts: both },
    );
    expect(errors).toEqual([]);
    for (const name of ["Bare", "Own", "Sibling", "Elsewhere", "Shared"])
      expect(out[name]!.side).toBe("server");
    // A sibling's host is not followed: wiring only to a web sibling is no host wiring.
    expect(out.Player!.side).toBe("web");
  });

  it("refuses a module wired into both hosts, naming the two wirings", () => {
    const { errors } = assign({
      Both: m("Both", {
        requires: { p: { iface: "@prismshadow/penguin-server#Paths" } },
        contributes: { "ChatModule.fileRenderers": [{ id: "p" }] },
      }),
    });
    expect(errors).toEqual([
      "Both: its contribution to 'ChatModule.fileRenderers' wires it into the web app and requires.p ('@prismshadow/penguin-server#Paths') into the platform — split it into two modules",
    ]);
  });

  it("leaves a slot owner no tree has to the runtime check of the tree that loads it", () => {
    // No host table carries `Nowhere`: no host wiring, so the platform, whose boot check refuses
    // a contribution to a module it does not have.
    const { errors, out } = assign({
      Typo: m("Typo", { contributes: { "Nowhere.slot": [{ id: "t" }] } }),
    });
    expect(errors).toEqual([]);
    expect(out.Typo!.side).toBe("server");
  });

  it("refuses one file holding modules of both hosts", () => {
    expect(
      mixedFiles(
        { Box: "src/a.ts", Player: "src/a.ts", Other: "src/b.ts" },
        { Box: "server", Player: "web", Other: "web" },
      ),
    ).toEqual([
      "src/a.ts: holds module(s) wired into the web app [Player] and module(s) that run on the platform [Box] — one host per file",
    ]);
    const manifests = {
      Box: m("Box", { contributes: { "SandboxModule.providers": [{ id: "b" }] } }),
      Player: m("Player", { contributes: { "ChatModule.fileRenderers": [{ id: "p" }] } }),
    };
    const sources = new Map([
      ["Box", "src/index.ts"],
      ["Player", "src/index.ts"],
    ]);
    expect(assignSides(manifests, sources, { hosts })).toEqual([
      "src/index.ts: holds module(s) wired into the web app [Player] and module(s) that run on the platform [Box] — one host per file",
    ]);
  });

  it("refuses a web module requiring a restated copy of a host interface, naming it", () => {
    const renders = { "ChatModule.fileRenderers": [{ id: "r" }] };
    const { errors } = assign(
      {
        Copy: m("Copy", {
          requires: { lang: { iface: "@acme/p#Language" } },
          contributes: renders,
        }),
        Own: m("Own", { requires: { thing: { iface: "@acme/p#Thing" } }, contributes: renders }),
        Maker: m("Maker", { provides: { thing: "@acme/p#Thing" }, contributes: renders }),
        // On the platform a requirement is met structurally: a consumer-declared shape is fine.
        Shaped: m("Shaped", { requires: { lang: { iface: "@acme/p#Shape" } } }),
      },
      { pkgName: "@acme/p" },
    );
    expect(errors).toEqual([
      expect.stringMatching(
        /^Copy: requires\.lang names '@acme\/p#Language', an interface this package declares and none of its modules provides .*@prismshadow\/penguin-web\/plugin-types$/,
      ),
    ]);
  });
});

describe("the host tables", () => {
  const roots: string[] = [];
  afterEach(async () => {
    for (const r of roots.splice(0)) await fs.rm(r, { recursive: true, force: true });
  });

  it("are read from the checkout; a missing one says how to generate it", async () => {
    const root = await makeTempRoot();
    roots.push(root);
    await fs.mkdir(path.join(root, "packages", "server", "src"), { recursive: true });
    await fs.writeFile(path.join(root, "packages", "server", "src", "ifaces.json"), "{}");
    expect(() => readHostTables(root)).toThrow(
      /^packages\/web\/src\/ifaces\.json is missing: .*`pnpm gen:ifaces` at the repository root$/,
    );
    await fs.mkdir(path.join(root, "packages", "web", "src"), { recursive: true });
    await fs.writeFile(path.join(root, "packages", "web", "src", "ifaces.json"), "{}");
    expect(readHostTables(root)).toEqual({ server: {}, web: {} });
  });
});

describe("the web stylesheet's prefix", () => {
  it("is read off the Tailwind theme import", () => {
    expect(
      stylePrefixOf(`@import "tailwindcss/theme.css" layer(theme) reference prefix(mp);\n`),
    ).toBe("mp");
    expect(stylePrefixOf(`@import "tailwindcss/theme.css" layer(theme) reference;`)).toBeNull();
    expect(stylePrefixOf(`@import "tailwindcss";`)).toBeNull();
  });

  it("finds compiled classes outside the prefix, not the host classes a variant names", () => {
    const css =
      ".mp\\:flex{display:flex}.mp\\:p-1\\.5{padding:.375rem}" +
      ".mp\\:dark\\:text-red:where(.dark,.dark *){color:red}" +
      "@media (hover:hover){.mp\\:hover\\:x:hover{opacity:.9}}";
    expect(unprefixedClasses(css, "mp")).toEqual([]);
    expect(unprefixedClasses(`${css}.hidden{display:none}.mpx{color:red}`, "mp")).toEqual([
      "hidden",
      "mpx",
    ]);
  });

  it("is unique among the plugins built together", () => {
    expect(
      prefixClashes([
        ["@a/one", "mp"],
        ["@a/two", "hp"],
      ]),
    ).toEqual([]);
    expect(
      prefixClashes([
        ["@a/one", "mp"],
        ["@a/two", "hp"],
        ["@a/three", "mp"],
      ]),
    ).toEqual(["@a/one and @a/three both use the style prefix 'mp:'"]);
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
