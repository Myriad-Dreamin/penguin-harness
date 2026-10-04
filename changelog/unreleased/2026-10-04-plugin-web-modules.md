# A plugin ships web modules that join the web app's module tree

- **Date:** 2026-10-04
- **Type:** feature
- **Scope:** `web`, `server`, `tooling`
- **Breaking:** yes — `ChatModule.fileRenderers` contributions carry their extensions, and the server's `WebModule.fileRenderers` slot is gone

[中文版](2026-10-04-plugin-web-modules.zh.md)

A plugin package can now carry modules that run in the web app, with code, written the way the app's own modules are. The music example is the first: its audio player moved out of the web app into the plugin.

## Details

- `scripts/gen-ifaces.mjs` decides each module of a plugin package's side from its wiring — the modules it contributes to, is wired from, or replaces must belong to the platform's table or the web app's — and writes `side`, `source` and, for a web module, its built `file` into the package's `ifaces.json`. A module naming a module neither host has, a slot its owner lacks, or both sides is a build error naming it, as is one source file holding both sides. A module that names no module stays on the platform.
- `scripts/build-plugin.mjs` builds a package from that table: the main entry for Node lists the platform modules only; each web module becomes `dist/web/<Module>.js`, an ES module for the browser with lazily imported code split into chunks; `src/styles.css`, when present, is compiled by Tailwind into `dist/web/styles.css`, against the web app's theme as a reference. A web module shares the web app's React, JSX runtime, kernel and UI package (the page puts them on `globalThis.__penguinShared`, the build resolves those imports to it); bundling a copy of any of them, another package of theirs or a Node builtin fails the build.
- `GET /api/contributions` forwards the enabled plugins' web modules as `webModules`: each package's web manifests, its interface and type entries, and the URLs of its built files and stylesheet. The files are served at `/api/plugins/<package>/web/<build>/<file>`, where the build id hashes the built files, with a year-long immutable cache; another build id answers 404.
- The web app asks for that list before its module tree boots (bounded at 5 s, nothing in safe mode), loads each package's files and stylesheet, checks the tree with each package added in turn, and boots its modules as runtime children of `WebRoot`. A package that fails to load or to fit is left out with the reason, logged and shown on the Plugins page; the app boots without it. A sign-in after a signed-out load, and a safe mode switch that changes the tree, reload the page.
- A reply's file renderers come from `ChatModule.fileRenderers` contributions alone: each carries its extensions as data and its component as code, and is drawn in a Suspense and an error boundary. Renderers receive the interface language (`locale`).
- `plugins/example-music` is a web module contributing the audio player (card, seek bar, clock, its states and its words in both languages), styled by its own sheet whose utilities carry an `mp:` prefix, so none shares a selector with the host's. The web app's `features/audio/` and `AudioModule` were removed, as were the server's `WebModule.fileRenderers` slot, the `fileRenderers` field of the contributions answer and the web app's name-based renderer lookup.

## Compatibility

- A module contributing to the server's `WebModule.fileRenderers` slot no longer fits the platform's tree. Contribute a web module to `ChatModule.fileRenderers` instead, with `extensions` in the contribution's data and the component bound with `@Bind`.
- `ChatModule.fileRenderers` contributions carry `extensions` instead of `name`.
