# Web E2E (Playwright)

Browser end-to-end tests: chat (thinking + tool approval + tool execution + second-turn
reply), the iconified stats line (cost conversion / copy reply), Session fork (footer action
right of copy, confirm-gated, and no stray request after deleting the fork), Traces (per-Task
timeline + legend + hover-linked highlighting), Workspace file preview (sandboxed HTML
rendering, path hidden by default). The LLM is driven by `mock-llm.mjs` (a mock Anthropic
Messages SSE endpoint) — no network access.

```sh
pnpm --filter @prismshadow/penguin-web test:e2e          # build + start the server + run the tests
SKIP_BUILD=1 pnpm --filter @prismshadow/penguin-web test:e2e   # skip the build
```

The first run requires `npx playwright install chromium`.

The runner starts one server per plugin set, each on a fresh data root, because what one
Project enables in `[plugins]` is loaded for the whole server. The default set enables the
example plugins most specs need; a spec whose plugin changes the app for everyone (such as
`page-removal.spec.mjs`, whose plugin removes the Evaluation Center) gets a set of its own.
`run.sh` lists the sets, `playwright.config.mjs` says which specs belong to which, and
`E2E_PLUGIN_SET=<name>` runs one set alone.

The runner (`run.sh`) is POSIX-only and deliberately stays that way: `pnpm test` never
invokes it (only the separate `test:e2e` script does), so a Windows checkout builds and
tests fine without it. To run the browser e2e on Windows, use Git-Bash
(`bash e2e/run.sh` from `packages/web`).
