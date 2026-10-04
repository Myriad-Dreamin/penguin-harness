/**
 * @penguinharness/example-no-evaluation-center — the smallest plugin that takes a page away from
 * the web app, with no code at all.
 *
 * Its one module, a web module (`side: "web"`), contributes `{ key: "benchmark" }` to the web
 * app's `ShellModule.pageRemovals` slot. Its class is empty — the removal is all data — and it is
 * built and forwarded like any web module: a file of under 3 KB the page imports at boot, its
 * manifest beside it (GET /api/contributions, `webModules`). The shell then drops the page keyed
 * `benchmark` — the Evaluation Center — with the routes under its path (one Benchmark's page,
 * /benchmark/:benchmarkId) and the pages under it (such as example-hello-page's), so it has no
 * row in the nav and its URLs lead home. Safe mode assembles no plugin, so it brings the page
 * back.
 */
import { Module } from "@prismshadow/penguin-core/plugin";
import type { Plugin } from "@prismshadow/penguin-core/plugin";

/** The plugin's one module: no body, only the removal it contributes. */
@Module({
  side: "web",
  contributes: {
    "ShellModule.pageRemovals": [
      { id: "example-no-evaluation-center.benchmark", key: "benchmark" },
    ],
  },
})
export class NoEvaluationCenter {}

const plugin: Plugin = { modules: [NoEvaluationCenter] };
export default plugin;
