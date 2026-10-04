/**
 * The plugin's one module, a web module: one page on the web app's `ShellModule.pages` slot.
 *
 * The contribution's data is the page's route and its nav row — its names in both languages, its
 * glyph, and `parent: "benchmark"`, which draws the row indented under the Evaluation Center. The
 * nav draws that row from the manifest alone. The code half is the page component, lazy: its chunk
 * is fetched the first time someone opens the page, inside the shell's Suspense boundary.
 *
 * What the page needs of the app's state comes through an interface, never an import: the
 * interface language the person picked (`Language`, provided by the web app's settings module).
 * The module `@Use`s it — wired by the interface's own key, so neither this class nor its manifest
 * names the module that provides it — and hands it to the component by closure. Its type comes
 * from the web app's plugin-facing types (a type import; see tsconfig.json).
 */
import { createElement, lazy } from "react";
import type { ComponentType } from "react";
import { Bind, Module, Use } from "@prismshadow/penguin-core/plugin";
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
