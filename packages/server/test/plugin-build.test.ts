/**
 * A plugin's two sides at build time (scripts/lib/plugin-sides.mjs, scripts/build-plugin.mjs).
 *
 * - gen-ifaces' side decision: a module contributing to a platform slot is a platform module, one
 *   contributing to a web slot a web module; one naming a module neither host has, or a slot its
 *   owner lacks, is an error naming the module; one wired to both sides is an error; a module that
 *   names no module stays on the platform; a module wired to another of the package's modules, or
 *   to a module of a plugin it depends on, takes its side; one source file holding both sides is an error.
 * - The build emits the main entry with the platform modules only and one browser module per web
 *   module, with a lazy component in its own chunk; the browser module carries no copy of React,
 *   the kernel or the UI package — imported with a page's shared instances in place, it decorates
 *   through and renders with those very instances.
 * - A web module importing a Node builtin, or a package that is not shared, fails the build.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import * as Kernel from "@prismshadow/penguin-core/kernel";
import { moduleDefOf } from "@prismshadow/penguin-core/kernel";
import type { ManifestTable, ModuleClass } from "@prismshadow/penguin-core/kernel";
import { decideSides, mixedFiles } from "../../../scripts/lib/plugin-sides.mjs";
import type { HostTable } from "../../../scripts/lib/plugin-sides.mjs";
import { buildPlugin } from "../../../scripts/build-plugin.mjs";
import { makeTempRoot } from "./helpers.js";

const hosts: { server: HostTable; web: HostTable } = {
  server: {
    modules: { SandboxModule: { provides: { sandbox: "server#Sandbox" } } },
    ifaces: { "server#Sandbox": { slots: { providers: {} } } },
  },
  web: {
    modules: { ChatModule: { provides: { chat: "web#Chat" } } },
    ifaces: { "web#Chat": { slots: { fileRenderers: {} } } },
  },
};

const m = (name: string, more: object = {}) => ({ name, requires: {}, contributes: {}, ...more });

describe("the side decision", () => {
  it("places a module by the slots it contributes to and the modules it is wired to", () => {
    const { sides, errors } = decideSides(
      {
        Box: m("Box", { contributes: { "SandboxModule.providers": [{ id: "b" }] } }),
        Player: m("Player", { contributes: { "ChatModule.fileRenderers": [{ id: "p" }] } }),
        Plain: m("Plain"),
        Helper: m("Helper", { requires: { player: { iface: "x#P", from: "Player" } } }),
        Sibling: m("Sibling", { contributes: { "OtherPlugin.actions": [{ id: "s" }] } }),
      },
      { ...hosts, plugins: { OtherPlugin: "server" } },
    );
    expect(errors).toEqual([]);
    expect(sides).toEqual({
      Box: "server",
      Player: "web",
      Plain: "server",
      Helper: "web",
      Sibling: "server",
    });
  });

  it("decides a module name both hosts have by the slot, then by the interface required", () => {
    const both = {
      server: {
        modules: {
          ...hosts.server.modules,
          AgentsModule: { provides: { agents: "server#Agents" } },
        },
        ifaces: { ...hosts.server.ifaces, "server#Agents": {} },
      },
      web: {
        modules: { ...hosts.web.modules, AgentsModule: { provides: { tabs: "web#Tabs" } } },
        ifaces: { ...hosts.web.ifaces, "web#Tabs": { slots: { tabs: {} } } },
      },
    };
    const { sides, errors } = decideSides(
      {
        Tab: m("Tab", { contributes: { "AgentsModule.tabs": [{ id: "t" }] } }),
        User: m("User", { requires: { a: { iface: "server#Agents", from: "AgentsModule" } } }),
        Shaped: m("Shaped", { requires: { a: { iface: "own#Agents", from: "AgentsModule" } } }),
      },
      both,
    );
    expect(errors).toEqual([]);
    expect(sides).toEqual({ Tab: "web", User: "server", Shaped: "server" });
  });

  it("refuses a module that fits neither side, naming it", () => {
    const { errors } = decideSides(
      {
        Lost: m("Lost", { contributes: { "Nowhere.things": [{ id: "l" }] } }),
        Typo: m("Typo", { contributes: { "ChatModule.fileRenderer": [{ id: "t" }] } }),
      },
      hosts,
    );
    expect(errors).toEqual([
      "Lost: its contribution to 'Nowhere.things' names module 'Nowhere', which neither the platform nor the web app has",
      "Typo: its contribution to 'ChatModule.fileRenderer': the web app's module 'ChatModule' has no slot 'fileRenderer' (no-such-slot)",
    ]);
  });

  it("refuses a module wired to both sides", () => {
    const { errors } = decideSides(
      {
        Both: m("Both", {
          contributes: {
            "SandboxModule.providers": [{ id: "a" }],
            "ChatModule.fileRenderers": [{ id: "b" }],
          },
        }),
      },
      hosts,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^Both: wired to both sides/);
  });

  it("refuses one file holding modules of both sides", () => {
    expect(
      mixedFiles(
        { Box: "src/a.ts", Player: "src/a.ts", Other: "src/b.ts" },
        {
          Box: "server",
          Player: "web",
          Other: "web",
        },
      ),
    ).toEqual([
      "src/a.ts: holds web module(s) [Player] and platform module(s) [Box] — one side per file",
    ]);
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
      "@prismshadow/penguin-core/kernel": Kernel,
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

  it("refuses a web module importing a Node builtin", async () => {
    const dir = await pkgDir(`import fs from "node:fs";\n${PLAYER}\nexport const x = fs;\n`);
    await expect(buildPlugin(dir)).rejects.toMatchObject({
      errors: [expect.objectContaining({ text: expect.stringMatching(/Node builtin 'node:fs'/) })],
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
