/**
 * Plugin web modules joining the app's module tree (plugins/assemble.ts, web-root.ts): what
 * GET /api/contributions forwards is verified, loaded and booted (one identity check) beside
 * the app's own modules, through the kernel's runtime entry.
 *
 * - A forwarded module joins: its class is created and its contribution reaches the chat page's
 *   `fileRenderers` slot, rule and component in one; its verdict is remembered.
 * - A package whose module does not fit (data of the wrong shape, a slot no module has, a name
 *   the app already uses) or whose file fails to load is left out with the reason, and the app
 *   boots without it; of two packages with one module name, the later by package name is left
 *   out, whatever order they were forwarded in.
 * - A package whose files do not arrive within the deadline is left out with that reason and the
 *   others boot; its file arriving or failing later changes nothing.
 * - A module requiring a host interface by the host's key, carrying its own copy, wires to the
 *   host's provider by identity — even one that provides several interfaces; a copy the host no
 *   longer satisfies is refused at verification; a requirement only a structural match meets is
 *   refused before the boot, not by it.
 * - Nothing forwarded (safe mode, signed out) boots the app's own tree.
 * - A module whose effect is all data (an empty class) joins from its file like any other: its
 *   page removal reaches the shell's `pageRemovals` slot.
 * - A plugin page joins the shell's `pages` slot with its `parent`, and its module `@Use`s an
 *   interface the app provides (`Language`, by its own key, no `from`, no copy).
 * - The app shares its own React, JSX runtime, kernel runtime entry and the UI package's plugin
 *   surface with plugin modules, under the keys the plugin build resolves them to
 *   (scripts/lib/web-shared.mjs); the surface's instances are the UI package's own, and its names
 *   are exactly the ones the plugin build's stub exports.
 */
import * as React from "react";
import * as JsxRuntime from "react/jsx-runtime";
import * as Kernel from "@prismshadow/penguin-core/kernel/runtime";
// Aliased: gen-ifaces reads every `@Module` class of this package's program, tests included,
// into the app's own table — these stand for plugin modules, whose manifests are forwarded.
import { Bind, Module as PluginModule, Use } from "@prismshadow/penguin-core/kernel/runtime";
import type { ClassCtx, Contributed, IfaceDecl } from "@prismshadow/penguin-core/kernel/runtime";
import * as Ui from "@prismshadow/penguin-ui";
import type { WebModulePackage } from "@prismshadow/penguin-server/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SHARED,
  SHARED_GLOBAL as BUILD_GLOBAL,
  uiSurfaceNames,
} from "../../../scripts/lib/web-shared.mjs";
import { bootWeb } from "../src/web-root";
import table from "../src/ifaces.json";
import { pluginModuleFailures } from "../src/plugins/assemble";
import { SHARED_GLOBAL, SHARED_MODULES, shareHostModules } from "../src/plugins/shared";
import { fileRenderersOf } from "../src/features/chat/deps";
import { ChatModule } from "../src/features/chat/module";
import { tableKey } from "../src/lib/verify-plugins";
import { VERIFIED_CACHE_KEY } from "../src/lib/verified-cache";
import { memoryStorage, stubLocalStorage } from "./helpers/storage";
import { ShellModule } from "../src/shell/module";
import type { Language } from "../src/plugin-types";

const Player = () => null;
let created: string[] = [];
let renderers: readonly Contributed[] = [];

@PluginModule({
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
@PluginModule({})
class SlotProbe {
  setup() {
    created.push("SlotProbe");
  }
}

const HelloView = () => null;
let helloLanguage: Language | null = null;

/** A plugin page whose module reads the app's interface language. */
@PluginModule({})
class HelloPlugin {
  @Use() language!: Language;
  @Bind("hello.page") page = HelloView;
  setup() {
    helloLanguage = this.language;
    created.push("HelloPlugin");
  }
}

/** A module whose effect is all data: an empty class, its manifest a page removal. */
@PluginModule({})
class NoBenchmark {}

/** A plugin module named like one of the app's own. */
const Clash = (() => {
  @PluginModule({})
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

const pkg = (
  name: string,
  modules: Array<{ manifest: object; url?: string }>,
  ifaces: Record<string, unknown> = {},
): WebModulePackage => ({
  package: name,
  version: "1.0.0",
  ifaces: { ifaces, types: {} },
  modules: modules as WebModulePackage["modules"],
  styles: [],
});

const MUSIC_MANIFEST = manifest("MusicPlugin", {
  "ChatModule.fileRenderers": [{ id: "music.audio", extensions: ["mp3", "WAV"] }],
});

const HELLO_MANIFEST = {
  ...manifest("HelloPlugin", {
    "ShellModule.pages": [
      {
        id: "hello.page",
        key: "example-hello",
        path: "/example-hello",
        frame: "shell",
        nav: "main",
        admin: false,
        released: true,
        order: 72,
        parent: "benchmark",
        title: "Plugin page",
        titleZh: "插件页面",
        icon: "sparkle",
      },
    ],
  }),
  requires: { language: { iface: "@prismshadow/penguin-web#Language" } },
};

const REMOVAL_MANIFEST = manifest("NoBenchmark", {
  "ShellModule.pageRemovals": [{ id: "no-benchmark", key: "benchmark" }],
});

const classes: Record<string, unknown> = {
  "/hello.js": HelloPlugin,
  "/music.js": MusicPlugin,
  "/probe.js": SlotProbe,
  "/clash.js": Clash,
  "/removal.js": NoBenchmark,
};
const load = async (url: string) => {
  if (!(url in classes)) throw new Error(`404 ${url}`);
  return { default: classes[url] };
};
const opts = { load };

beforeEach(() => {
  created = [];
  renderers = [];
  shellSlots = {};
  helloLanguage = null;
  (pluginModuleFailures() as Map<string, string>).clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  stubLocalStorage(memoryStorage());
});

// The chat module hands its slot to its page; the test reads it off the module's setup.
const chatSetup = ChatModule.prototype.setup;
ChatModule.prototype.setup = function (this: InstanceType<typeof ChatModule>, ctx: ClassCtx) {
  renderers = ctx.contributions.fileRenderers ?? [];
  chatSetup.call(this, ctx);
};

// The shell keeps its slots; the test reads them off its setup.
let shellSlots: Record<string, readonly Contributed[]> = {};
const shellSetup = ShellModule.prototype.setup;
ShellModule.prototype.setup = function (this: InstanceType<typeof ShellModule>, ctx: ClassCtx) {
  shellSlots = ctx.contributions;
  shellSetup.call(this, ctx);
};

describe("plugin web modules in the tree", () => {
  it("a forwarded module joins: created, its rule and component on the chat slot", async () => {
    const Root = await bootWeb(
      [pkg("@acme/music", [{ manifest: MUSIC_MANIFEST, url: "/music.js" }])],
      opts,
    );
    expect(typeof Root).toBe("function");
    expect(created).toContain("MusicPlugin");
    expect(pluginModuleFailures().size).toBe(0);
    expect(fileRenderersOf(renderers)).toEqual([
      { id: "music.audio", extensions: ["mp3", "wav"], Renderer: Player },
    ]);
    expect(renderers.map((c) => c.from)).toEqual(["MusicPlugin"]);
  });

  it("a module whose effect is all data joins from its file like any other", async () => {
    await bootWeb(
      [pkg("@acme/no-benchmark", [{ manifest: REMOVAL_MANIFEST, url: "/removal.js" }])],
      opts,
    );
    expect(pluginModuleFailures().size).toBe(0);
    expect(shellSlots.pageRemovals?.map((c) => [c.from, c.data.key])).toEqual([
      ["NoBenchmark", "benchmark"],
    ]);
  });

  it("a plugin page joins with its parent; its module reads the app's language by interface", async () => {
    await bootWeb([pkg("@acme/hello", [{ manifest: HELLO_MANIFEST, url: "/hello.js" }])], opts);
    expect(pluginModuleFailures().size).toBe(0);
    expect(created).toContain("HelloPlugin");
    const page = shellSlots.pages?.find((c) => c.id === "hello.page");
    expect(page?.data).toMatchObject({ key: "example-hello", parent: "benchmark" });
    expect(page?.code).toBe(HelloView);
    expect(["zh", "en"]).toContain(helloLanguage?.get());
  });

  it("boots the app's own tree when nothing is forwarded", async () => {
    await bootWeb([], opts);
    expect(created).toEqual([]);
    expect(renderers).toEqual([]);
  });

  it("leaves out a package whose contribution does not fit its slot, and boots without it", async () => {
    const bad = manifest("MusicPlugin", {
      "ChatModule.fileRenderers": [{ id: "music.audio", extensions: 5 }],
    });
    const Root = await bootWeb([pkg("@acme/bad", [{ manifest: bad, url: "/music.js" }])], opts);
    expect(typeof Root).toBe("function");
    expect(created).not.toContain("MusicPlugin");
    expect(renderers).toEqual([]);
    expect(pluginModuleFailures().get("@acme/bad")).toMatch(/music\.audio/);
  });

  it("leaves out a package naming a slot no module has", async () => {
    const stray = manifest("SlotProbe", { "NoSuchModule.things": [{ id: "x" }] });
    await bootWeb([pkg("@acme/stray", [{ manifest: stray, url: "/probe.js" }])], opts);
    expect(created).not.toContain("SlotProbe");
    expect(pluginModuleFailures().get("@acme/stray")).toMatch(/NoSuchModule/);
  });

  it("leaves out a package whose file does not load, and keeps the others", async () => {
    await bootWeb(
      [
        pkg("@acme/gone", [{ manifest: manifest("SlotProbe"), url: "/gone.js" }]),
        pkg("@acme/music", [{ manifest: MUSIC_MANIFEST, url: "/music.js" }]),
      ],
      opts,
    );
    expect(pluginModuleFailures().get("@acme/gone")).toMatch(/404 \/gone\.js/);
    expect(created).toEqual(["MusicPlugin"]);
  });

  it("of two packages with one module name, leaves out the later by package name", async () => {
    const music = pkg("@acme/music", [{ manifest: MUSIC_MANIFEST, url: "/music.js" }]);
    const again = pkg("@acme/again", [{ manifest: MUSIC_MANIFEST, url: "/music.js" }]);
    for (const order of [
      [music, again],
      [again, music],
    ]) {
      created = [];
      (pluginModuleFailures() as Map<string, string>).clear();
      await bootWeb(order, opts);
      expect(pluginModuleFailures().has("@acme/again")).toBe(false);
      expect(pluginModuleFailures().get("@acme/music")).toMatch(/MusicPlugin/);
      expect(created).toEqual(["MusicPlugin"]);
    }
  });

  it("leaves out a package whose files miss the deadline, and boots the others", async () => {
    let settle: (value: unknown) => void = () => {};
    const late = new Promise((resolve) => (settle = resolve));
    const load = async (url: string) => {
      if (url === "/held.js") return late;
      return { default: classes[url] };
    };
    const Root = await bootWeb(
      [
        pkg("@acme/held", [{ manifest: manifest("SlotProbe"), url: "/held.js" }]),
        pkg("@acme/music", [{ manifest: MUSIC_MANIFEST, url: "/music.js" }]),
      ],
      { load, deadlineMs: 20 },
    );
    expect(typeof Root).toBe("function");
    expect(pluginModuleFailures().get("@acme/held")).toMatch(/did not load within 20 ms/);
    expect(created).toEqual(["MusicPlugin"]);
    // The file arriving after the boot gave up on it is dropped: nothing is created.
    settle({ default: SlotProbe });
    await late;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(created).toEqual(["MusicPlugin"]);
  });

  it("takes a left-out package's stylesheets away with it", async () => {
    const head: Array<{ dataset: Record<string, string>; remove(): void }> = [];
    vi.stubGlobal("document", {
      createElement: () => {
        const link = {
          dataset: {} as Record<string, string>,
          onload: null as null | (() => void),
          onerror: null as null | (() => void),
          remove: () => head.splice(head.indexOf(link), 1),
        };
        return link;
      },
      head: {
        appendChild: (link: (typeof head)[number] & { onload: () => void }) => {
          head.push(link);
          link.onload();
        },
      },
      querySelectorAll: () => [...head],
    });
    const styled = (name: string, url: string, manifest: object): WebModulePackage => ({
      ...pkg(name, [{ manifest, url }]),
      styles: [`/${name}.css`],
    });
    await bootWeb(
      [
        styled("@acme/held", "/held.js", manifest("SlotProbe")),
        styled("@acme/music", "/music.js", MUSIC_MANIFEST),
      ],
      { load: (url) => (url === "/held.js" ? new Promise(() => {}) : load(url)), deadlineMs: 20 },
    );
    expect(pluginModuleFailures().has("@acme/held")).toBe(true);
    expect(head.map((l) => l.dataset.plugin)).toEqual(["@acme/music"]);
  });

  it("swallows a file that fails after the deadline", async () => {
    let fail: (err: Error) => void = () => {};
    const late = new Promise((_, reject) => (fail = reject));
    const load = async () => late;
    await bootWeb([pkg("@acme/held", [{ manifest: manifest("SlotProbe"), url: "/held.js" }])], {
      load,
      deadlineMs: 20,
    });
    expect(pluginModuleFailures().get("@acme/held")).toMatch(/did not load within/);
    // An unhandled rejection here would fail the run.
    fail(new Error("404 /held.js"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pluginModuleFailures().get("@acme/held")).toMatch(/did not load within/);
  });

  it("leaves out a module named like one of the app's own", async () => {
    const clash = manifest("ChatModule");
    await bootWeb([pkg("@acme/clash", [{ manifest: clash, url: "/clash.js" }])], opts);
    expect(pluginModuleFailures().get("@acme/clash")).toMatch(/ChatModule/);
  });
});

describe("verification and wiring by key", () => {
  it("remembers a verified package by the key computed over what it checked", async () => {
    const storage = stubLocalStorage(memoryStorage());
    const music = pkg("@acme/music", [{ manifest: MUSIC_MANIFEST, url: "/music.js" }]);
    await bootWeb([music], opts);
    expect(created).toEqual(["MusicPlugin"]);
    const key = await tableKey({
      ifaces: {},
      types: {},
      modules: { MusicPlugin: MUSIC_MANIFEST },
    });
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(storage.map.get(VERIFIED_CACHE_KEY)).toContain(key!);
  });

  // The chat module provides two interfaces (`chat`, `drafts`): only identity picks one.
  const HOST_KEY = (table.modules as Record<string, { provides: Record<string, string> }>)
    .ChatModule!.provides.drafts!;
  const hostDrafts = (table.ifaces as Record<string, IfaceDecl>)[HOST_KEY]!;
  const copyOf = (methods: string[]): IfaceDecl => ({
    ...hostDrafts,
    methods: Object.fromEntries(
      methods.map((m) => [m, hostDrafts.methods[m] ?? { params: [], returns: { void: true } }]),
    ),
  });
  let seen: unknown = null;
  @PluginModule({})
  class DraftsProbe {
    @Use() drafts!: { newChatId: string };
    setup() {
      seen = this.drafts.newChatId;
      created.push("DraftsProbe");
    }
  }
  classes["/drafts.js"] = DraftsProbe;
  const probe = (iface: string, from?: string) => ({
    ...manifest("DraftsProbe"),
    requires: { drafts: { iface, ...(from === undefined ? {} : { from }) } },
  });

  it("wires a host interface required by the host's key, with the plugin's copy", async () => {
    seen = null;
    const copy = { [HOST_KEY]: copyOf(["removeParked", "forgetSession"]) };
    await bootWeb(
      [pkg("@acme/drafts", [{ manifest: probe(HOST_KEY, "ChatModule"), url: "/drafts.js" }], copy)],
      opts,
    );
    expect(pluginModuleFailures().size).toBe(0);
    expect(created).toEqual(["DraftsProbe"]);
    expect(typeof seen).toBe("string");
  });

  it("refuses at verification a copy the host no longer satisfies", async () => {
    const copy = { [HOST_KEY]: copyOf(["removeParked", "frobnicate"]) };
    await bootWeb(
      [pkg("@acme/stale", [{ manifest: probe(HOST_KEY, "ChatModule"), url: "/drafts.js" }], copy)],
      opts,
    );
    expect(created).toEqual([]);
    expect(pluginModuleFailures().get("@acme/stale")).toMatch(/no longer offers.*frobnicate/);
  });

  it("refuses before the boot a requirement only a structural match meets", async () => {
    const own = "@acme/shape#ChatDrafts";
    await bootWeb(
      [
        pkg("@acme/shape", [{ manifest: probe(own), url: "/drafts.js" }], {
          [own]: copyOf(["removeParked"]),
        }),
      ],
      opts,
    );
    expect(created).toEqual([]);
    expect(pluginModuleFailures().get("@acme/shape")).toMatch(
      /does not wire by interface key.*requires\.drafts/,
    );
  });
});

describe("shared instances", () => {
  it("shares the app's own React, JSX runtime, kernel and UI package", () => {
    shareHostModules();
    const shared = (globalThis as Record<string, unknown>)[SHARED_GLOBAL] as Record<
      string,
      unknown
    >;
    expect(shared).toBe(SHARED_MODULES);
    expect(shared.react).toBe(React);
    expect(shared["react/jsx-runtime"]).toBe(JsxRuntime);
    expect(shared["@prismshadow/penguin-core/kernel/runtime"]).toBe(Kernel);
    const surface = shared["@prismshadow/penguin-ui"] as Record<string, unknown>;
    for (const [name, value] of Object.entries(surface))
      expect(value, name).toBe((Ui as Record<string, unknown>)[name]);
    expect(Object.isFrozen(shared)).toBe(true);
  });

  it("shares exactly the UI names the plugin build's stub exports", () => {
    const surface = SHARED_MODULES["@prismshadow/penguin-ui"] as Record<string, unknown>;
    expect(Object.keys(surface).sort()).toEqual(uiSurfaceNames());
    for (const name of uiSurfaceNames()) expect(surface[name], name).toBeDefined();
  });

  it("under the keys the plugin build resolves to", () => {
    expect(BUILD_GLOBAL).toBe(SHARED_GLOBAL);
    expect([...new Set(Object.values(SHARED))].sort()).toEqual(Object.keys(SHARED_MODULES).sort());
  });
});
