/**
 * @penguinharness/example-hello-page — the smallest plugin that adds a page to the web app, drawn
 * by its own React component.
 *
 * Its one module (module.ts) is a WEB module: it contributes to the web app's `ShellModule.pages`
 * slot, so the build places it on the web side and emits it as a browser module
 * (`dist/web/ExampleHelloPage.js`, scripts/build-plugin.mjs). The server only forwards it: GET
 * /api/contributions lists it with the URL of its file, and the web app adds it to its own module
 * tree before it mounts. The page sits under the Evaluation Center (`parent: "benchmark"`).
 */
import type { Plugin } from "@prismshadow/penguin-core/plugin";
import { ExampleHelloPage } from "./module";

const plugin: Plugin = { modules: [ExampleHelloPage] };
export default plugin;
