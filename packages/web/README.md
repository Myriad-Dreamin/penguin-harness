# @prismshadow/penguin-web

The PenguinHarness Web App — a React 19 + Vite + Tailwind CSS 4 SPA that renders the OmniMessage stream (same protocol and statistics as the CLI) and manages Agents, Skills, Models, usage and Traces. Feature tour: [Web App Guide](https://penguin.ooo/docs/web-app).

## Layout

```
src/
├── main.tsx / app.tsx / router.tsx / styles.css
├── api/            # fetch wrapper, typed endpoint functions, EventSource (SSE) wrapper
├── state/          # auth / project / sessions / theme / locale contexts
├── lib/
│   ├── omni/       # OmniMessage stream → view-model reducer + connect-first/dedup controller
│   └── …           # formatting, i18n dictionaries (zh/en), attachments, helpers
├── components/     # ui primitives (modal, drawer, select, …) + app layout
└── features/       # chat / agents / plugins / skills / models / usage / traces / benchmark / admin
```

DTO types are imported type-only from `@prismshadow/penguin-server/api`; no server code enters the bundle. Rendering rules for streaming partials (start/delta/stop aggregation, complete-message replacement, origin-chain nesting into subagent cards) live in `lib/omni/stream-model.ts`, which is fully unit-tested.

## Modules

Every directory under `src/features/` is a **module**: a public entry (`index.ts`, the only file outside code may import), its own zh/en dictionary fragments (`strings.ts`, mounted by reference as a section of the app dictionaries, so components still read `S.<section>.*`), and its unit tests under `test/`. `test/web-modules.ts` lists the modules, the dictionary section each fills (`section`, when it is not the module's name; `null` for a module with no copy of its own) and what each may import from the rest of the app (`dependsOn`); `vitest.config.ts` turns every entry into a test project, `test/module-boundaries.test.ts` fails on an import that goes around a module's entry or outside its declared dependencies, and `test/module-entries.test.ts` loads each entry first in a fresh module graph, so a cycle between modules that bites at load time fails there.

```bash
pnpm --filter @prismshadow/penguin-web exec vitest run --project chat   # one module's tests alone
```

A new dependency of a module is added to its `dependsOn` on purpose; another module is named by its entry (`features/<name>/index`). A test that reads source files across the app (an audit of every renderer, of every persisted key) stays in the app's `test/`. A new feature directory is a module from its first commit: entry, fragments, tests, manifest entry.

## Development

Prereqs: Node >= 24, pnpm; run `pnpm install` at the repo root first (core must be built — the root `dev:*` scripts handle that).

```bash
pnpm dev:server   # backend at 127.0.0.1:7368 (dev port, not the installed server's 7364)
pnpm dev:web      # Vite dev server at 127.0.0.1:7365; /api proxied (SSE passes through)
```

The proxy target defaults to `http://127.0.0.1:7368` — the development backend, kept off the installed server's 7364 so the two can run at once (`PORT` moves both, `PENGUIN_API_PROXY` overrides the target outright). Auth is a same-origin HttpOnly cookie, so the proxy keeps everything same-origin.

```bash
pnpm --filter @prismshadow/penguin-web typecheck
pnpm --filter @prismshadow/penguin-web test        # vitest (pure logic)
pnpm --filter @prismshadow/penguin-web test:e2e    # Playwright against a mock LLM
pnpm --filter @prismshadow/penguin-web build       # vite build → dist/
```

## Production

No separate static server needed: `@prismshadow/penguin-server` auto-hosts `packages/web/dist` (or `PENGUIN_WEB_DIST`) with an SPA fallback — build the web app, start the server, done. The published npm packages bundle the built front end.

Part of [PenguinHarness](https://github.com/Prism-Shadow/penguin-harness) · Apache-2.0
