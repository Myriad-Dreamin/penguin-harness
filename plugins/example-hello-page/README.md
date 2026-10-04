# Example: a plugin page

The smallest plugin that adds a page to the PenguinHarness web app, drawn by its own React
component. It demonstrates:

- **A web module.** The plugin's one module (`src/index.ts`, beside the plugin's declaration) contributes to the web app's
  `ShellModule.pages` slot, so the build places it on the web side: gen-ifaces writes
  `side: "web"` and its built file into `ifaces.json`, and `scripts/build-plugin.mjs` emits
  `dist/web/ExampleHelloPage.js` for the browser, with React, the kernel and the UI package left to
  the web app's own instances. The server only forwards it (`GET /api/contributions`,
  `webModules`); the web app checks it against its module tree and boots it with its own modules.
- **The nav row is data, the page is code.** The contribution's data — the route
  `/example-hello`, the row's names ("插件页面" / "Plugin page"), its glyph and
  `parent: "benchmark"`, which draws it indented under the Evaluation Center — is declared in the
  module, so the plugin writes no navigation code; the row appears once the web app has loaded the
  plugin's module file, before it mounts. The page component (`src/hello-page.tsx`) is lazy: its
  chunk is fetched the first time someone opens the page, and the content area shows the app's
  loading line meanwhile. A page whose parent is absent is shown
  nowhere; pages nest one level only.
- **A first-class page.** It sits in the app's frame with the app's own `PageFrame` and
  `PageHeader` (shared from the UI package), and its cards use the host's theme tokens, so it
  follows the theme, light/dark mode and the accent.
- **App state through an interface.** The page's words follow the app's interface language. The
  module reads it through `Language`, an interface the web app's settings module provides: a
  `@Use()` field on the module class, wired by the interface's key (no module named), handed to
  the component as a prop. `Language` is a store (`get` / `subscribe`): the component reads it
  with React's `useSyncExternalStore`, so a language switch in Settings re-draws the page without
  a reload. Its type comes from the web app's plugin-facing types
  (`packages/web/src/plugin-types.ts`, mapped in `tsconfig.json`, imported as a type only).
- **Its own stylesheet.** `src/styles.css` compiles the page's Tailwind utilities against the web
  app's theme as a reference. Its classes carry the plugin's prefix (`hp:flex`): the build fails
  on a compiled class outside the prefix, and on two plugins built together with one prefix, so
  no plugin sheet repeats one of the host's utilities later in the cascade. The web app attaches
  the sheet before it mounts.

The package is private, so it is not published, and it is not shipped with the builtin plugins
(`scripts/build-plugins.mjs` skips the `plugins/example-*` directories), so no install offers it.

## Build it

`pnpm --filter @penguinharness/example-hello-page build` runs gen-ifaces and then
`scripts/build-plugin.mjs`; `pnpm --filter @penguinharness/example-hello-page test` runs its tests.

## Enable it

A plugin is loaded by its package name only, from the bundled plugin directory a build stages.
Stage the examples into it with the builtin plugins, then list the package in a Project's
`.project_config.toml` and restart the server:

```sh
PENGUIN_PLUGIN_EXAMPLES=1 node scripts/build-plugins.mjs --out packages/server/plugins
```

```toml
[plugins]
"@penguinharness/example-hello-page" = "*"
```

What a Project lists is loaded for the whole server, so every user sees the page. Reload the web
app after enabling it: the app assembles plugin web modules once per page load. In safe mode it
assembles none. With `plugins/example-no-evaluation-center` enabled too, the Evaluation Center is
removed and this page with it: removing a page drops the pages under it. The web e2e suite
enables it this way (`packages/web/e2e/run.sh`).
