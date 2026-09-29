# Web App renderers: one registry, generated from the manifest

- **Date:** 2026-09-29
- **Type:** refactor
- **Scope:** `web`

[中文版](2026-09-29-web-renderer-registry.zh.md)

The Web App kept four hand-written lists of what it can draw: the page manifest (`src/module.json`), the router's page renderers, the company-mode nav rows of contributed pages, and the session surface renderers. They are now one section of `src/module.json`, `renderers`, and `scripts/gen-renderers.ts` generates the code from it.

## Details

- `renderers.pages` and `renderers.surfaces` name each renderer and the module whose entry exports it; `renderers.orgNav` lists the company-mode rows in their order, with label and kind. `pnpm --filter @prismshadow/penguin-web gen:renderers` writes `src/lib/renderers.gen.ts` (names and rows, no imports) and `src/renderers.gen.ts` (the components, read only by the router).
- The generator refuses a manifest with a page that names an undeclared renderer, a renderer whose module has no entry, a duplicate name, or a builtin nav row that names no page renderer. A new test fails while either generated file is out of date.
- A page whose `builtin` renderer this build does not carry, such as a page from a newer plugin, now opens at its URL with a notice naming the renderer. Before, it was dropped from the routes and the address went to `/chat` without saying why.
- Session surface renderers now reach the chat page through `ContributionsProvider`, instead of from a list inside the chat module.
