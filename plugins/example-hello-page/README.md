# Example: a plugin page

The smallest plugin that adds a page to the PenguinHarness web app, drawn by its own React
component. It demonstrates:

- **A web module.** The plugin's one module (`src/index.ts`, beside the plugin's declaration) declares `side: "web"` in its
  `@Module` and contributes to the web app's `ShellModule.pages` slot: gen-ifaces writes
  `side: "web"` and its built file into `ifaces.json`, and `scripts/build-plugin.mjs` emits
  `dist/web/ExampleHelloPage.js` for the browser, with React, the kernel and the UI package left to
  the web app's own instances. The server only forwards it (`GET /api/contributions`,
  `webModules`); the web app checks it against its module tree and boots it with its own modules.
- **The nav row is data, the page is code.** The contribution's data — the route
  `/example-hello`, the row's names ("插件页面" / "Plugin page"), its glyph and
  `parent: "benchmark"`, which draws it indented under the Evaluation Center — is declared in the
  module, so the plugin writes no navigation code; the row appears once the web app has loaded the
  plugin's module file, before it mounts. A page whose parent is absent is shown nowhere; pages
  nest one level only.
- **The app places the page.** The contribution states no place, no admin gate and no release:
  those are the app's decisions. The shell puts a plugin's page after the app's own pages (under
  a parent, after the app's own children; among plugins, by package name), offers it for as long
  as the plugin is enabled, and to every role. A plugin whose page states `order`, `admin` or
  `released` is left out, with that reason on the Plugins page.
- **The page's code is separable; the app decides when it loads.** The module binds a loader of
  the page (`{ load: () => … import("./hello-page") … }`, typed `Separable` from the app's
  plugin-facing types), not a component it wrapped in `React.lazy` itself. The app turns it into
  its own deferred component: the page's chunk is fetched when the pointer rests on the nav row
  (the same prefetch as the app's own pages) or, at the latest, when the page is opened, and the
  content area shows the app's loading line meanwhile.
- **A first-class page.** It sits in the app's frame with the app's own `PageFrame` and
  `PageHeader` (shared from the UI package), and its cards use the host's theme tokens, so it
  follows the theme, light/dark mode and the accent.
- **App state through an interface.** The page's words follow the app's interface language. The
  module reads it through `Language`, an interface the web app's settings module provides: a
  `@Use()` field on the module class, wired by the interface's key (no module named); the loader
  resolves to the page component with that store handed to it as a prop. `Language` is a store (`get` / `subscribe`): the component reads it
  with React's `useSyncExternalStore`, so a language switch in Settings re-draws the page without
  a reload. Its type comes from the web app's plugin-facing types
  (`@prismshadow/penguin-web/plugin-types`, a types-only export of the web package, imported as a
  type only), so the requirement carries the app's own interface key.
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
