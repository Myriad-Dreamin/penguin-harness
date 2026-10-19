/**
 * Sandbox settings are a settings group: the sandbox's policy is listed, validated and stored
 * through /api/admin/plugin-config like any module's settings and applied at the next spawn,
 * surviving a restart. A backend with settings of its own declares its own group inside the
 * sandbox's and reads it itself through PluginConfig — nothing hands it a bag of values.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseManifest } from "@prismshadow/penguin-core/kernel";
import type { ModuleDef } from "@prismshadow/penguin-core/kernel";
import type { SandboxDimension, SandboxPolicy } from "@prismshadow/penguin-core/plugin";
import type { PluginConfigResponse } from "../src/api/types.js";
import type { PluginConfig } from "../src/plugin/config.js";
import { PluginHost } from "../src/plugin/host.js";
import type { SandboxService } from "../src/sandbox/service.js";
import { apiClient, createTestApp, loginAdmin } from "./helpers.js";
import type { TestApp } from "./helpers.js";

/** What the backend saw at each confine: the policy, and the runner it read from its own group. */
interface Seen {
  policy: SandboxPolicy;
  runner: unknown;
}

/**
 * A backend declaring a group inside the sandbox's and reading it at each confine. The knobs
 * are the dimensions it declares (all but localhost-only network by default), the name it
 * confines under, and what it records — one more backend shape is one more call.
 */
function backend({
  seen = [],
  label = "test-backend",
  dimensions = ["fs-write", "network", "mask-paths", "closed-temp", "readonly-roots"],
}: {
  seen?: Seen[];
  label?: string;
  dimensions?: readonly SandboxDimension[];
} = {}): ModuleDef {
  return {
    manifest: parseManifest({
      name: "TestBackend",
      requires: {
        config: { iface: "@prismshadow/penguin-server#PluginConfig", from: "PluginConfigModule" },
      },
      provides: {},
      contributes: {
        "SandboxModule.providers": [
          { id: "test.provider", name: label, dimensions: [...dimensions] },
          // Installed for another platform: it declines here, and says nothing on the card.
          { id: "elsewhere.provider", name: "other-platform", dimensions: ["fs-write"] },
        ],
        "PluginConfigProvider.groups": [
          {
            id: "sandbox-test",
            parent: "sandbox",
            title: "Test backend",
            properties: { runner: { type: "string", title: "Runner", default: "runner-a" } },
          },
        ],
      },
      children: [],
    }),
    create({ use }) {
      const config = use.config as PluginConfig;
      return {
        api: {},
        bind: {
          "elsewhere.provider": Promise.resolve(null),
          "test.provider": {
            dimensions: [...dimensions],
            confine(argv: readonly string[], policy: SandboxPolicy) {
              seen.push({ policy, runner: config.get("sandbox-test").runner });
              return {
                argv: ["confined", ...argv],
                enforcement: "full",
                denialSignatures: [],
                runnerFailureRules: [],
              };
            },
          },
        },
      };
    },
  };
}

/**
 * An app with the given backend modules mounted as plugins: the admin client, the sandbox
 * card (and every entry, for the groups nested inside it), a save into a settings group, and
 * a spawn through the sandbox's confiner.
 */
async function appWith(modules: ModuleDef[], dbPath?: string) {
  const host = new PluginHost();
  host.use({ specifier: "test-backend", modules, replaces: [] });
  const t = await createTestApp({ plugins: host, ...(dbPath ? { config: { dbPath } } : {}) });
  const admin = apiClient(t.app, (await loginAdmin(t.app)).cookie);
  const sandbox = t.deps.tree.api<SandboxService>("SandboxModule", "sandbox");
  await sandbox.whenReady();
  const list = async () =>
    ((await (await admin.get("/api/admin/plugin-config")).json()) as PluginConfigResponse).plugins;
  return {
    t,
    admin,
    sandbox,
    list,
    card: async () => (await list()).find((e) => e.name === "sandbox")!,
    save: (name: string, values: Record<string, unknown>) =>
      admin.put("/api/admin/plugin-config", { name, values }),
    spawn: () => sandbox.confiner()(["true"], { workspaceDir: "/w" } as never),
  };
}

describe("sandbox settings group", () => {
  const apps: TestApp[] = [];
  afterEach(async () => {
    for (const t of apps.splice(0)) await t.cleanup();
  });

  it("lists the sandbox with its backends' notice (a backend for another platform is not a notice), and a backend's group inside it", async () => {
    const { t, list } = await appWith([backend()]);
    apps.push(t);
    const entries = await list();
    const sandbox = entries.find((e) => e.name === "sandbox")!;
    expect(entries[0]).toBe(sandbox);
    // Nothing saved: the switch reads off, and the default preset is the shipped one.
    expect(sandbox.values).toEqual({
      enabled: false,
      defaultPreset: "workspace-write",
      writableTemp: true,
    });
    expect(sandbox.notices).toEqual([
      expect.objectContaining({
        tone: "muted",
        // What this machine enforces, by the backend that serves (no mechanism declared: its name).
        text: "Enforced here: file writes, network isolation, masked paths, closing the temporary directory and holding the agent state read-only, by test-backend. Not enforced here: localhost-only network.",
      }),
    ]);
    const child = entries.find((e) => e.name === "sandbox-test")!;
    expect(child.parent).toBe("sandbox");
    expect(child.values).toEqual({ runner: "runner-a" });
  });

  /**
   * Greyed-out cells: a column no mounted backend serves is unavailable on the card, and
   * saving that cell is refused with nothing stored. One more unsupported column is one
   * more row.
   */
  it.each([
    {
      name: "the local network level is unavailable where no backend supports it, and saving it is refused",
      modules: [backend()],
      unavailable: [
        expect.objectContaining({ field: "presets", column: "network", value: "local" }),
      ],
      cell: { presets: { "read-only": { network: "local" } } },
      refused: "presets.read-only.network",
    },
    {
      name: "the state-read-only cells are greyed out where no backend declares the dimension, and saving them is refused",
      modules: [backend({ label: "fs-only", dimensions: ["fs-write"] })],
      unavailable: expect.arrayContaining([
        expect.objectContaining({ field: "presets", column: "stateReadonly", value: "true" }),
      ]),
      cell: { presets: { "workspace-write": { stateReadonly: true } } },
      refused: "presets.workspace-write.stateReadonly",
    },
  ])("$name", async ({ modules, unavailable, cell, refused }) => {
    const { t, sandbox, card, save } = await appWith(modules);
    apps.push(t);
    expect((await card()).unavailable).toEqual(unavailable);
    const refusedCell = await save("sandbox", cell);
    expect(refusedCell.status).toBe(400);
    expect(await refusedCell.text()).toContain(refused);
    // Nothing was stored: the service still runs the defaults, and the card shows no cell value.
    expect(sandbox.currentSettings()).toEqual({ mode: "danger-full-access" });
    expect((await card()).values.presets).toBeUndefined();
  });

  /** Each shipped default preset: what a new Session starts from when it is the default. */
  it.each([
    ["read-only", { mode: "read-only" }],
    ["workspace-write-state-readonly", { mode: "workspace-write", stateReadonly: true }],
    ["full-access", { mode: "danger-full-access" }],
  ] as const)("starts new Sessions from the %s preset", async (defaultPreset, starts) => {
    const { t, sandbox, save } = await appWith([backend()]);
    apps.push(t);
    expect((await save("sandbox", { enabled: true, defaultPreset })).status).toBe(200);
    expect(sandbox.currentSettings()).toEqual(starts);
  });

  it("a remapped default row is what new Sessions get, with the card's masked paths beside it", async () => {
    const { t, sandbox, save } = await appWith([backend()]);
    apps.push(t);
    expect(
      (await save("sandbox", { enabled: true, defaultPreset: "read-only", maskPaths: ["/secret"] }))
        .status,
    ).toBe(200);
    expect(sandbox.currentSettings()).toEqual({ mode: "read-only", maskPaths: ["/secret"] });
    expect(
      (
        await save("sandbox", {
          presets: { "read-only": { mode: "workspace-write", network: "none" } },
        })
      ).status,
    ).toBe(200);
    expect(sandbox.currentSettings()).toEqual({
      mode: "workspace-write",
      network: "none",
      maskPaths: ["/secret"],
    });
  });

  it("the state-read-only row's cell saves and un-saves", async () => {
    const { t, sandbox, save, card } = await appWith([backend()]);
    apps.push(t);
    expect(
      (await save("sandbox", { enabled: true, defaultPreset: "workspace-write-state-readonly" }))
        .status,
    ).toBe(200);
    // New Sessions start from Workspace Write with the agent state held read-only; turning
    // the row's cell off makes the same start plain Workspace Write.
    expect(
      (
        await save("sandbox", {
          presets: { "workspace-write-state-readonly": { stateReadonly: false } },
        })
      ).status,
    ).toBe(200);
    expect(sandbox.currentSettings()).toEqual({ mode: "workspace-write" });
    expect((await card()).values.presets).toEqual({
      "workspace-write-state-readonly": { stateReadonly: false },
    });
    // And back on again.
    expect(
      (
        await save("sandbox", {
          presets: { "workspace-write-state-readonly": { stateReadonly: true } },
        })
      ).status,
    ).toBe(200);
    expect(sandbox.currentSettings()).toEqual({ mode: "workspace-write", stateReadonly: true });
  });

  it("applies a saved policy to the next spawn; the backend reads its own saved group", async () => {
    const seen: Seen[] = [];
    const { t, sandbox, spawn, save } = await appWith([backend({ seen })]);
    apps.push(t);
    expect(
      (
        await save("sandbox", {
          enabled: true,
          defaultPreset: "workspace-write",
          presets: { "workspace-write": { network: "none" } },
          maskPaths: [" /etc/x ", "/etc/x", ""],
        })
      ).status,
    ).toBe(200);
    expect(sandbox.currentSettings()).toEqual({
      mode: "workspace-write",
      network: "none",
      maskPaths: ["/etc/x"],
    });
    expect((await save("sandbox-test", { runner: "runner-b" })).status).toBe(200);
    expect(spawn()).toEqual({ argv: ["confined", "true"] });
    expect(seen.at(-1)).toEqual({
      policy: {
        mode: "workspace-write",
        workspaceRoot: "/w",
        network: "none",
        maskPaths: ["/etc/x"],
        writableTemp: true,
      },
      runner: "runner-b",
    });

    await save("sandbox", { defaultPreset: "read-only", maskPaths: [], writableTemp: false });
    expect(sandbox.currentSettings()).toEqual({ mode: "read-only", writableTemp: false });
    spawn();
    expect(seen.at(-1)?.policy).toEqual({ mode: "read-only", workspaceRoot: "/w" });
    expect(sandbox.parkedSettings()).toEqual({ mode: "read-only", writableTemp: false });

    // A preset that is not one of the shipped ones never saves.
    expect((await save("sandbox", { defaultPreset: "wide-open" })).status).toBe(400);
    // A relative masked path would resolve against the server's working directory.
    expect((await save("sandbox", { maskPaths: ["/etc/x", ".ssh"] })).status).toBe(400);
    expect(sandbox.currentSettings().maskPaths).toBeUndefined();
    expect(sandbox.currentSettings().mode).toBe("read-only");
  });

  it("names a failed backend with its reason and the ones meant for another platform, and warns when the saved mode cannot be enforced", async () => {
    const failing: ModuleDef = {
      manifest: parseManifest({
        name: "WrongPlatformBackend",
        requires: {},
        provides: {},
        contributes: {
          "SandboxModule.providers": [
            { id: "wrong.provider", name: "wrong-backend", dimensions: ["fs-write"] },
            { id: "elsewhere.provider", name: "other-platform", dimensions: ["fs-write"] },
          ],
        },
        children: [],
      }),
      create: () => ({
        api: {},
        bind: {
          "wrong.provider": Promise.reject(new Error("'bwrap' is missing")),
          // A backend for another platform declines: not a failure, and not named on its own.
          "elsewhere.provider": Promise.resolve(null),
        },
      }),
    };
    const { t, card, save } = await appWith([failing]);
    apps.push(t);
    await save("sandbox", { enabled: true });
    const notices = (await card()).notices!.map((n) => [n.tone, n.text]);
    expect(notices).toEqual([
      [
        "attention",
        "The saved mode needs fs-write, and no usable backend implements it: every agent command and hook script is refused until one does.",
      ],
      [
        "attention",
        "This deployment has no usable sandbox backend: until one for this platform is installed from the Plugins page, every mode but Full access refuses every agent command and hook script. other-platform is installed, but for another platform.",
      ],
      ["attention", "wrong-backend is not in use: 'bwrap' is missing"],
    ]);
  });

  it("loads a backend that failed its check again when its group is saved, and answers with the outcome", async () => {
    const probed: ModuleDef = {
      manifest: parseManifest({
        name: "ProbedBackend",
        requires: {
          config: {
            iface: "@prismshadow/penguin-server#PluginConfig",
            from: "PluginConfigModule",
          },
        },
        provides: {},
        contributes: {
          "SandboxModule.providers": [
            { id: "probed.provider", name: "probed", dimensions: ["fs-write"] },
          ],
          "PluginConfigProvider.groups": [
            {
              id: "sandbox-probed",
              parent: "sandbox",
              title: "Probed backend",
              properties: {
                runner: { type: "string", title: "Runner", default: "/opt/bwarp" },
              },
            },
          ],
        },
        children: [],
      }),
      create({ use }) {
        const config = use.config as PluginConfig;
        return {
          api: {},
          bind: {
            // A loader, the way bwrap binds one: it checks the runner its group names.
            "probed.provider": async () => {
              const runner = config.get("sandbox-probed").runner;
              if (runner !== "/usr/bin/bwrap") throw new Error(`'${String(runner)}' is missing`);
              return {
                confine: (argv: readonly string[]) => ({
                  argv: ["probed", ...argv],
                  enforcement: "full" as const,
                  denialSignatures: [],
                  runnerFailureRules: [],
                }),
              };
            },
          },
        };
      },
    };
    const { t, sandbox, save } = await appWith([probed]);
    apps.push(t);
    expect(sandbox.failures()).toEqual([{ name: "probed", reason: "'/opt/bwarp' is missing" }]);

    const saved = await save("sandbox-probed", { runner: "/usr/bin/bwrap" });
    expect(saved.status).toBe(200);
    const card = ((await saved.json()) as PluginConfigResponse).plugins.find(
      (e) => e.name === "sandbox",
    )!;
    expect(card.notices?.map((n) => n.text)).toEqual([
      "Enforced here: file writes, by probed. Not enforced here: network isolation, localhost-only network, masked paths, closing the temporary directory and holding the agent state read-only.",
    ]);
    // Nothing failed any more: nothing to disclose under it.
    expect(card.notices?.[0]?.details).toBeUndefined();
    expect(sandbox.failures()).toEqual([]);
    sandbox.configure({ mode: "read-only" });
    expect(sandbox.confiner()(["true"], { workspaceDir: "/w" } as never).argv).toEqual([
      "probed",
      "true",
    ]);
  });

  it("keeps what was saved across a restart", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "penguin-sandbox-settings-"));
    const dbPath = path.join(dir, "web.db");
    let second: Awaited<ReturnType<typeof appWith>> | undefined;
    try {
      const first = await appWith([backend()], dbPath);
      await first.save("sandbox", { enabled: true, defaultPreset: "read-only" });
      await first.save("sandbox-test", { runner: "runner-c" });
      await first.t.cleanup();

      const seen: Seen[] = [];
      second = await appWith([backend({ seen })], dbPath);
      expect(second.sandbox.currentSettings()).toEqual({ mode: "read-only" });
      second.spawn();
      expect(seen.at(-1)?.runner).toBe("runner-c");
    } finally {
      // The database lives outside either app's root, so it is only removable once the app
      // holding it is closed: Windows refuses to unlink an open file (EBUSY on web.db-shm),
      // and fs.rm retries that past the test's timeout.
      await second?.t.cleanup();
      await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
});
