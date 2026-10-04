/**
 * Plugin web modules on the server side (plugin/web-modules.ts): the server forwards the modules
 * a package's table places on the web side, with the URLs of their built files, and reads nothing
 * else of them.
 *
 * - Only `side: "web"` modules are forwarded, each manifest as the table carries it, with the
 *   table's interfaces and types; a package without a web module, without a table or without a
 *   build is not listed.
 * - The URLs name a build id that hashes the built files: a byte changed is a new id.
 * - The stylesheet the build emits is listed beside the modules.
 * - A data-only web module (no `file`) is forwarded without a URL; its package needs no build.
 * - GET /api/contributions without plugins forwards none.
 * - A Workspace audio file — what a file renderer plays through files/content — is read with its
 *   audio content type.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ContributionsResponse } from "../src/api/types.js";
import { webBuildId, webModulesOf } from "../src/plugin/web-modules.js";
import { WorkspaceFilesService } from "../src/services/workspace-files-service.js";
import { apiClient, createTestApp, loginAdmin, makeTempRoot } from "./helpers.js";
import { WEB_MANIFEST, writeWebPackage } from "./plugin-fixtures.js";
import type { TestApp } from "./helpers.js";

describe("web modules", () => {
  let t: TestApp | undefined;
  const roots: string[] = [];
  afterEach(async () => {
    await t?.cleanup();
    t = undefined;
    for (const r of roots.splice(0)) await fs.rm(r, { recursive: true, force: true });
  });
  const tmp = async () => {
    const r = await makeTempRoot();
    roots.push(r);
    return r;
  };

  it("forwards a package's web modules with their file URLs, its table and its stylesheet", async () => {
    const dir = await tmp();
    const entry = await writeWebPackage(dir);
    const build = webBuildId(dir);
    expect(build).toMatch(/^[0-9a-f]{16}$/);
    const [part, ...rest] = webModulesOf([entry, entry, null]);
    expect(rest).toEqual([]);
    expect(part).toEqual({
      package: "@acme/player",
      version: "1.2.3",
      hash: "abc",
      ifaces: { ifaces: { "@acme/player#Thing": { name: "Thing", methods: {} } }, types: {} },
      modules: [
        { manifest: WEB_MANIFEST, url: `/api/plugins/@acme/player/web/${build}/Player.js` },
      ],
      styles: [`/api/plugins/@acme/player/web/${build}/styles.css`],
    });
  });

  it("names the build by its content", async () => {
    const dir = await tmp();
    await writeWebPackage(dir);
    const before = webBuildId(dir);
    await fs.writeFile(path.join(dir, "dist", "web", "chunk-AB.js"), "export const x = 22;");
    expect(webBuildId(dir)).not.toBe(before);
  });

  it("lists no package without a web module, a table or a build", async () => {
    const noWeb = await tmp();
    const noTable = await tmp();
    const noBuild = await tmp();
    const entries = [
      await writeWebPackage(noWeb, { web: false }),
      await writeWebPackage(noTable, { name: "no-table" }),
      await writeWebPackage(noBuild, { name: "no-build", styles: false }),
    ];
    await fs.rm(path.join(noTable, "ifaces.json"));
    await fs.rm(path.join(noBuild, "dist", "web"), { recursive: true });
    expect(webModulesOf(entries)).toEqual([]);
  });

  it("forwards a data-only web module without a URL, with no build to serve", async () => {
    const dir = await tmp();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "@acme/removal", version: "1.0.0", type: "module" }),
    );
    const manifest = {
      name: "Removal",
      kind: "module",
      requires: {},
      provides: {},
      contributes: { "ShellModule.pageRemovals": [{ id: "r.benchmark", key: "benchmark" }] },
      children: [],
      side: "web",
      source: "src/index.ts",
    };
    await fs.writeFile(
      path.join(dir, "ifaces.json"),
      JSON.stringify({
        hash: "h",
        ifaces: {},
        types: {},
        modules: { Removal: manifest },
        plugin: { modules: ["Removal"], replaces: [] },
      }),
    );
    expect(webBuildId(dir)).toBeNull();
    expect(webModulesOf([path.join(dir, "dist", "index.js")])).toEqual([
      {
        package: "@acme/removal",
        version: "1.0.0",
        hash: "h",
        ifaces: { ifaces: {}, types: {} },
        modules: [{ manifest }],
        styles: [],
      },
    ]);
  });

  it("forwards none without plugins", async () => {
    t = await createTestApp();
    const admin = apiClient(t.app, (await loginAdmin(t.app)).cookie);
    const res = await admin.get("/api/contributions");
    expect(res.status).toBe(200);
    const body = (await res.json()) as ContributionsResponse;
    expect(body.webModules).toEqual([]);
    expect("fileRenderers" in body).toBe(false);
    expect("pageRemovals" in body).toBe(false);
  });

  it("reads a Workspace audio file with its audio content type", async () => {
    const ws = await tmp();
    const types: Record<string, string> = {
      "a.mp3": "audio/mpeg",
      "b.WAV": "audio/wav",
      "c.ogg": "audio/ogg",
      "d.m4a": "audio/mp4",
    };
    for (const [file, type] of Object.entries(types)) {
      await fs.writeFile(path.join(ws, file), "RIFF");
      expect((await new WorkspaceFilesService().read(ws, file)).contentType, file).toBe(type);
    }
  });
});
