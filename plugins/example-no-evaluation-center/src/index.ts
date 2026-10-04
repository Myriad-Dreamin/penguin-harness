/**
 * @penguinharness/example-no-evaluation-center — the smallest plugin that takes a page away from
 * the web app, with no code at all.
 *
 * Its one module contributes `{ key: "benchmark" }` to the web app's `ShellModule.pageRemovals`
 * slot, so the build places it on the web side; and because the class is empty and the slot has
 * no code half, it is DATA ONLY: gen-ifaces gives it no built file, the build emits nothing for
 * it, the server forwards its manifest alone (GET /api/contributions, `webModules`), and the web
 * app adds it to its module tree without importing anything. The shell then drops the page keyed
 * `benchmark` — the Evaluation Center — with the routes under its path (one Benchmark's page,
 * /benchmark/:benchmarkId) and the pages under it (such as example-hello-page's), so it has no
 * row in the nav and its URLs lead home. Safe mode assembles no plugin, so it brings the page
 * back.
 */
import { Module } from "@prismshadow/penguin-core/plugin";
import type { Plugin } from "@prismshadow/penguin-core/plugin";

/** The plugin's one module: no body, only the removal it contributes. */
@Module({
  contributes: {
    "ShellModule.pageRemovals": [
      { id: "example-no-evaluation-center.benchmark", key: "benchmark" },
    ],
  },
})
export class NoEvaluationCenter {}

const plugin: Plugin = { modules: [NoEvaluationCenter] };
export default plugin;
