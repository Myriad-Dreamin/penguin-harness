/**
 * @penguinharness/example-hello-page — the smallest plugin that adds a page to the web app, drawn
 * by its own React component.
 *
 * Its one module is a WEB module: it contributes to the web app's `ShellModule.pages` slot, so the
 * build places it on the web side and emits it as a browser module
 * (`dist/web/ExampleHelloPage.js`, scripts/build-plugin.mjs). The server only forwards it: GET
 * /api/contributions lists it with the URL of its file, and the web app loads that file and adds
 * the module to its own tree before it mounts.
 *
 * The contribution's data is the page's route and its nav row — its names in both languages, its
 * glyph, and `parent: "benchmark"`, which draws the row indented under the Evaluation Center. The
 * code half is the page component, lazy: its chunk (hello-page.tsx) is fetched the first time
 * someone opens the page, inside the shell's page boundary.
 *
 * What the page needs of the app's state comes through an interface, never an import: the
 * interface language the person picked (`Language`, provided by the web app's settings module).
 * The module `@Use`s it — wired by the interface's own key, so neither this class nor its manifest
 * names the module that provides it — and hands it to the component as a prop, which subscribes
 * to it. Its type comes from the web app's plugin-facing types (a type import; see tsconfig.json).
 */
import { createElement, lazy } from "react";
import type { ComponentType } from "react";
import { Bind, Module, Use } from "@prismshadow/penguin-core/plugin";
import type { Plugin } from "@prismshadow/penguin-core/plugin";
import type { Language } from "@prismshadow/penguin-web/plugin-types";

@Module({
  contributes: {
    "ShellModule.pages": [
      {
        id: "example-hello-page.page",
        key: "example-hello",
        path: "/example-hello",
        frame: "shell",
        nav: "main",
        admin: false,
        released: true,
        // After the Evaluation Center's own pages (70, 71): its child row.
        order: 72,
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
  @Bind("example-hello-page.page") page!: ComponentType;

  setup() {
    const language = this.language;
    this.page = lazy(async () => {
      const { HelloPage } = await import("./hello-page");
      return { default: () => createElement(HelloPage, { language }) };
    });
  }
}

const plugin: Plugin = { modules: [ExampleHelloPage] };
export default plugin;
