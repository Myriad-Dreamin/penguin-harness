# Example: no Evaluation Center

The smallest plugin that removes a page from the PenguinHarness web app — with no code at all. It
demonstrates:

- **A data-only web module.** The plugin's one module contributes `{ key: "benchmark" }` to the
  web app's `ShellModule.pageRemovals` slot. Its class is empty and the slot has no code half,
  so gen-ifaces gives the module no built file and `scripts/build-plugin.mjs` emits no browser
  code for it; the server forwards its manifest alone (`GET /api/contributions`, `webModules`),
  and the web app adds it to its module tree without importing anything.
- **A page goes with what belongs to it.** The Evaluation Center loses its row in the sidebar
  and in the collapsed rail, and its route. The routes under its path go too (one Benchmark's
  page, `/benchmark/:benchmarkId`), and so do the pages under it in the nav (such as the page of
  `plugins/example-hello-page`). Opening any of those URLs leads home: the chat page in
  development mode, the organizations in company mode.
- **Some pages cannot be removed.** Home — the page that answers `/` and every path the app
  has no page for — and the pages it leads to (the chat page, the organizations page) stay
  whatever a removal names, so a removal can never leave the app without a page to land on. The
  login page is not in the page table at all.

The removal is part of the module tree from the first render: after a reload the Evaluation Center
never shows, not even for a moment.

The package is private, so it is not published, and as a `plugins/example-*` directory it is not
shipped with the builtin plugins either (`scripts/build-plugins.mjs` skips the examples unless
`PENGUIN_PLUGIN_EXAMPLES=1`), so no install enables it.

## Build it

`pnpm --filter @penguinharness/example-no-evaluation-center build` runs gen-ifaces and then
`scripts/build-plugin.mjs`, which writes the platform entry (listing no module) and nothing for
the web.

## Enable it

A plugin is loaded by its package name only, from the bundled plugin directory a build stages.
Stage the examples into it with the builtin plugins, then list the package in a Project's
`.project_config.toml` and restart the server:

```sh
PENGUIN_PLUGIN_EXAMPLES=1 node scripts/build-plugins.mjs --out packages/server/plugins
```

```toml
[plugins]
"@penguinharness/example-no-evaluation-center" = "*"
```

What a Project lists is loaded for the whole server, so every user loses the page. Reload the web
app after enabling it: the app assembles plugin web modules once per page load. The web e2e suite
enables it this way, with the other two examples, on a data root of its own
(`packages/web/e2e/run.sh`).

## Get the page back

- **For good:** remove the line from `.project_config.toml` and restart the server, then reload
  the web app.
- **For now:** open the app in safe mode — add `?safe` to the URL, or run "safe mode" from the
  command palette (`Ctrl+Shift+P` / `⇧⌘P`). Safe mode assembles no plugin, so nothing is
  removed; leaving it reloads the app with the plugins, and the page is removed again.
