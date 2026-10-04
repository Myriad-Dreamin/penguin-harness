/**
 * Plugin web modules joining the app's module tree (plugins/assemble.ts, web-root.ts): what
 * GET /api/contributions forwards is loaded, checked and booted beside the app's own modules.
 *
 * - A forwarded module joins: its class is created and its contribution reaches the chat page's
 *   `fileRenderers` slot, rule and component in one.
 * - A package whose module does not fit (data of the wrong shape, a slot no module has, a name
 *   the app already uses) or whose file fails to load is left out with the reason, and the app
 *   boots without it; of two packages with one module name, the later is left out.
 * - Nothing forwarded (safe mode, signed out) boots the app's own tree.
 * - The app shares its own React, JSX runtime, kernel and UI package with plugin modules, under
 *   the keys the plugin build resolves them to (scripts/lib/web-shared.mjs).
 */
import * as React from "react";
import * as JsxRuntime from "react/jsx-runtime";
import * as Kernel from "@prismshadow/penguin-core/kernel";
import { Bind, Module } from "@prismshadow/penguin-core/kernel";
import type { ClassCtx, Contributed } from "@prismshadow/penguin-core/kernel";
import * as Ui from "@prismshadow/penguin-ui";
import type { WebModulePackage } from "@prismshadow/penguin-server/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SHARED, SHARED_GLOBAL as BUILD_GLOBAL } from "../../../scripts/lib/web-shared.mjs";
import { bootWeb } from "../src/web-root";
import { pluginModuleFailures } from "../src/plugins/assemble";
import { SHARED_GLOBAL, SHARED_MODULES, shareHostModules } from "../src/plugins/shared";
import { fileRenderersOf } from "../src/features/chat/deps";
import { ChatModule } from "../src/features/chat/module";

const Player = () => null;
let created: string[] = [];
let renderers: readonly Contributed[] = [];

@Module({
  contributes: {
    "ChatModule.fileRenderers": [{ id: "music.audio", extensions: ["mp3", "WAV"] }],
  },
})
class MusicPlugin {
  @Bind("music.audio") audio = Player;
  setup() {
    created.push("MusicPlugin");
  }
}

/** A module that contributes nothing of its own; manifests below give it a stray slot. */
@Module({})
class SlotProbe {
  setup() {
    created.push("SlotProbe");
  }
}

/** A plugin module named like one of the app's own. */
const Clash = (() => {
  @Module({})
  class ChatModule {}
  return ChatModule;
})();

const manifest = (name: string, contributes: Record<string, unknown[]> = {}) => ({
  name,
  kind: "module",
  requires: {},
  provides: {},
  contributes,
  children: [],
  side: "web",
  file: `dist/web/${name}.js`,
});

const pkg = (name: string, modules: Array<{ manifest: object; url: string }>): WebModulePackage => ({
  package: name,
  version: "1.0.0",
  hash: "h",
  ifaces: { ifaces: {}, types: {} },
  modules: modules as WebModulePackage["modules"],
  styles: [],
});

const MUSIC_MANIFEST = manifest("MusicPlugin", {
  "ChatModule.fileRenderers": [{ id: "music.audio", extensions: ["mp3", "WAV"] }],
});

const classes: Record<string, unknown> = {
  "/music.js": MusicPlugin,
  "/probe.js": SlotProbe,
  "/clash.js": Clash,
};
const load = async (url: string) => {
  if (!(url in classes)) throw new Error(`404 ${url}`);
  return { default: classes[url] };
};

beforeEach(() => {
  created = [];
  renderers = [];
  (pluginModuleFailures() as Map<string, string>).clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// The chat module hands its slot to its page; the test reads it off the module's setup.
const chatSetup = ChatModule.prototype.setup;
ChatModule.prototype.setup = function (this: InstanceType<typeof ChatModule>, ctx: ClassCtx) {
  renderers = ctx.contributions.fileRenderers ?? [];
  chatSetup.call(this, ctx);
};

describe("plugin web modules in the tree", () => {
  it("a forwarded module joins: created, its rule and component on the chat slot", async () => {
    const Root = await bootWeb([pkg("@acme/music", [{ manifest: MUSIC_MANIFEST, url: "/music.js" }])], load);
    expect(typeof Root).toBe("function");
    expect(created).toContain("MusicPlugin");
    expect(pluginModuleFailures().size).toBe(0);
    expect(fileRenderersOf(renderers)).toEqual([
      { id: "music.audio", extensions: ["mp3", "wav"], Renderer: Player },
    ]);
    expect(renderers.map((c) => c.from)).toEqual(["MusicPlugin"]);
  });

  it("boots the app's own tree when nothing is forwarded", async () => {
    await bootWeb([], load);
    expect(created).toEqual([]);
    expect(renderers).toEqual([]);
  });

  it("leaves out a package whose contribution does not fit its slot, and boots without it", async () => {
    const bad = manifest("MusicPlugin", {
      "ChatModule.fileRenderers": [{ id: "music.audio", extensions: 5 }],
    });
    const Root = await bootWeb([pkg("@acme/bad", [{ manifest: bad, url: "/music.js" }])], load);
    expect(typeof Root).toBe("function");
    expect(created).not.toContain("MusicPlugin");
    expect(renderers).toEqual([]);
    expect(pluginModuleFailures().get("@acme/bad")).toMatch(/music\.audio/);
  });

  it("leaves out a package naming a slot no module has", async () => {
    const stray = manifest("SlotProbe", { "NoSuchModule.things": [{ id: "x" }] });
    await bootWeb([pkg("@acme/stray", [{ manifest: stray, url: "/probe.js" }])], load);
    expect(created).not.toContain("SlotProbe");
    expect(pluginModuleFailures().get("@acme/stray")).toMatch(/NoSuchModule/);
  });

  it("leaves out a package whose file does not load, and keeps the others", async () => {
    await bootWeb(
      [
        pkg("@acme/gone", [{ manifest: manifest("SlotProbe"), url: "/gone.js" }]),
        pkg("@acme/music", [{ manifest: MUSIC_MANIFEST, url: "/music.js" }]),
      ],
      load,
    );
    expect(pluginModuleFailures().get("@acme/gone")).toMatch(/404 \/gone\.js/);
    expect(created).toEqual(["MusicPlugin"]);
  });

  it("of two packages with one module name, leaves out the later", async () => {
    await bootWeb(
      [
        pkg("@acme/music", [{ manifest: MUSIC_MANIFEST, url: "/music.js" }]),
        pkg("@acme/again", [{ manifest: MUSIC_MANIFEST, url: "/music.js" }]),
      ],
      load,
    );
    expect(pluginModuleFailures().has("@acme/music")).toBe(false);
    expect(pluginModuleFailures().get("@acme/again")).toMatch(/MusicPlugin/);
    expect(created).toEqual(["MusicPlugin"]);
  });

  it("leaves out a module named like one of the app's own", async () => {
    const clash = manifest("ChatModule");
    await bootWeb([pkg("@acme/clash", [{ manifest: clash, url: "/clash.js" }])], load);
    expect(pluginModuleFailures().get("@acme/clash")).toMatch(/ChatModule/);
  });
});

describe("shared instances", () => {
  it("shares the app's own React, JSX runtime, kernel and UI package", () => {
    shareHostModules();
    const shared = (globalThis as Record<string, unknown>)[SHARED_GLOBAL] as Record<string, unknown>;
    expect(shared).toBe(SHARED_MODULES);
    expect(shared.react).toBe(React);
    expect(shared["react/jsx-runtime"]).toBe(JsxRuntime);
    expect(shared["@prismshadow/penguin-core/kernel"]).toBe(Kernel);
    expect(shared["@prismshadow/penguin-ui"]).toBe(Ui);
    expect(Object.isFrozen(shared)).toBe(true);
  });

  it("under the keys the plugin build resolves to", () => {
    expect(BUILD_GLOBAL).toBe(SHARED_GLOBAL);
    expect([...new Set(Object.values(SHARED))].sort()).toEqual(Object.keys(SHARED_MODULES).sort());
  });
});
