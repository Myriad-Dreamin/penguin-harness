/**
 * @penguinharness/example-hello-page — the smallest plugin that adds a page to the web app, drawn
 * by its own React component.
 *
 * Its one module is a WEB module (`@Module({ side: "web" })`): it contributes to the web app's
 * `ShellModule.pages` slot, and the build emits it as a browser module
 * (`dist/web/ExampleHelloPage.js`, scripts/build-plugin.mjs). The server only forwards it: GET
 * /api/contributions lists it with the URL of its file, and the web app loads that file and adds
 * the module to its own tree before it mounts.
 *
 * The contribution's data is the page's route and its nav row — its names in both languages, its
 * glyph, and `parent: "benchmark"`, which draws the row indented under the Evaluation Center.
 * Where the row sits among its siblings, who may open the page and whether it is offered are the
 * app's to decide, not the plugin's: the shell places a plugin's page after the app's own, for
 * every role, for as long as the plugin is enabled. The code half is a loader of the page
 * (`Separable`): the module says only that the page's code is separable, and the app decides when
 * its chunk (hello-page.tsx) is fetched — the first time someone opens the page, or a moment
 * before, when the pointer rests on its nav row.
 *
 * What the page needs of the app's state comes through an interface, never an import: the
 * interface language the person picked (`Language`, provided by the web app's settings module).
 * The module `@Use`s it — wired by the interface's own key, so neither this class nor its manifest
 * names the module that provides it — and the page it loads is the component with that store
 * handed to it as a prop, which subscribes to it. Its types come from the web app's plugin-facing
 * types (a type-only export of the web package).
 */
import { createElement } from "react";
import type { ComponentType } from "react";
import { Bind, Module, Use } from "@prismshadow/penguin-core/plugin";
import type { Plugin } from "@prismshadow/penguin-core/plugin";
import type { Language, Separable } from "@prismshadow/penguin-web/plugin-types";

@Module({
  side: "web",
  contributes: {
    "ShellModule.pages": [
      {
        id: "example-hello-page.page",
        key: "example-hello",
        path: "/example-hello",
        frame: "shell",
        nav: "main",
        parent: "benchmark",
        title: "Plugin page",
        titleZh: "插件页面",
        icon: "sparkle",
      },
    ],
  },
})
export class ExampleHelloPage {
  @Use() language!: Language;

  @Bind("example-hello-page.page") page: Separable<ComponentType> = {
    load: async () => {
      const { HelloPage } = await import("./hello-page");
      const language = this.language;
      return function ExampleHello() {
        return createElement(HelloPage, { language });
      };
    },
  };
}

const plugin: Plugin = { modules: [ExampleHelloPage] };
export default plugin;
