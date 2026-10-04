/**
 * GET /api/plugins/<package>/ui/* — a file an installed plugin ships in its `ui/` directory: the
 * document an `iframe` renderer of its web contributions names (contributions.ts), and whatever
 * that document loads beside it.
 *
 * Only a plugin this process has LOADED is served — an entry of the plugin host, whichever
 * Project asked for it, since there is one module tree and what it contributes is visible to
 * all of them. Its package is the directory of the nearest `package.json` above its resolved
 * entry file (a name resolved from a prefix, or a dev checkout's path alike), and it is named
 * here by that manifest's `name`, so a plugin can write its own frame's `src` before anyone
 * knows how it will be installed. Any other name answers 404, as does a path that leaves the
 * package's `ui/` (http/static-files.ts).
 *
 * Beside it, GET /api/plugins/<package>/web/<build>/* serves the package's built web modules
 * (plugin/web-modules.ts says what the build id is).
 *
 * Like a workflow's `ui/*`, it is a plain authenticated route: the frame is same-origin and
 * carries the user's cookie, which is what lets the app theme it (lib/workflow-theme.ts in web).
 */
import path from "node:path";
import { Hono } from "hono";
import type { Context } from "hono";
import { Bind, Component, Use } from "@prismshadow/penguin-core/kernel";
import type { AppEnv } from "../../auth/middleware.js";
import type { Hmr } from "../../hmr/capabilities.js";
import { pluginHostFrom } from "../../plugin/host.js";
import { PACKAGE_NAME } from "../../plugin/loader.js";
import { packageOf, WEB_DIR, webBuildId } from "../../plugin/web-modules.js";
import { HttpError } from "../errors.js";
import { containedFile, uiFileResponse } from "../static-files.js";

/** Where a plugin's shipped UI lives inside its package. */
const PLUGIN_UI_DIR = "ui";

export interface PluginUiRouteDeps {
  /** The entry file of every plugin this process runs (null for one the installation resolved by bare name). */
  loadedEntries: () => Iterable<string | null | undefined>;
}

const notFound = () =>
  new HttpError(404, "not_found", "No such file in an installed plugin's ui/.");

export function pluginUiRoutes(deps: PluginUiRouteDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  /** The loaded package named `name`, or 404. */
  const loadedPackage = (name: string) => {
    if (!PACKAGE_NAME.test(name)) throw notFound();
    for (const file of deps.loadedEntries()) {
      if (file == null) continue;
      const found = packageOf(file);
      if (found?.name === name) return found;
    }
    throw notFound();
  };
  /** The decoded remainder of the request path after `marker`, or 404. */
  const restAfter = (c: Context<AppEnv>, marker: string) => {
    try {
      return decodeURIComponent(c.req.path.split(marker)[1] ?? "");
    } catch {
      throw notFound();
    }
  };
  const serve = async (c: Context<AppEnv>, name: string) => {
    const pkg = loadedPackage(name);
    const rel = restAfter(c, `/${name}/${PLUGIN_UI_DIR}/`);
    const file = await containedFile(path.join(pkg.dir, PLUGIN_UI_DIR), rel);
    if (file === null) throw notFound();
    return uiFileResponse(c, file);
  };
  /**
   * A built web file (plugin/web-modules.ts): served only under the build id its files hash to
   * now, and then for good — the id names the bytes.
   */
  const serveWeb = async (c: Context<AppEnv>, name: string) => {
    const pkg = loadedPackage(name);
    const build = c.req.param("build");
    if (build === undefined || webBuildId(pkg.dir) !== build) throw notFound();
    const rel = restAfter(c, `/${name}/web/${build}/`);
    const file = await containedFile(path.join(pkg.dir, WEB_DIR), rel);
    if (file === null) throw notFound();
    const res = await uiFileResponse(c, file);
    res.headers.set("cache-control", "private, max-age=31536000, immutable");
    return res;
  };
  app.get("/:scope{@[^/]+}/:name/ui/*", (c) =>
    serve(c, `${c.req.param("scope")}/${c.req.param("name")}`),
  );
  app.get("/:name/ui/*", (c) => serve(c, c.req.param("name")));
  app.get("/:scope{@[^/]+}/:name/web/:build/*", (c) =>
    serveWeb(c, `${c.req.param("scope")}/${c.req.param("name")}`),
  );
  app.get("/:name/web/:build/*", (c) => serveWeb(c, c.req.param("name")));
  return app;
}

@Component({
  contributes: {
    "HttpModule.routes": [
      {
        id: "PluginUiRoutes.routes",
        prefix: "/api/plugins",
        auth: "user",
        // Beside the library group on the same prefix; their patterns never overlap.
        order: 68,
      },
    ],
  },
})
export class PluginUiRoutes {
  @Use() private readonly hmr!: Hmr;
  @Bind("PluginUiRoutes.routes") routes!: Hono<AppEnv>;
  setup() {
    const hmr = this.hmr;
    this.routes = pluginUiRoutes({
      // Claimed per call rather than captured: the host belongs to the process, and a hot
      // swap hands the same one to the next platform.
      loadedEntries: () => [...pluginHostFrom(hmr.resources).entries().values()].map((e) => e.file),
    });
  }
}
