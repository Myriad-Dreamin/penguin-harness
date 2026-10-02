# A server starts from the pushed CLI, and the running harness is resolved once and passed as context

- **Date:** 2026-10-02
- **Type:** fix
- **Scope:** `cli`, `server`, `desktop`, `core`, `docs`
- **Breaking:** `PENGUIN_CLI_ENTRY` is gone; importing `@prismshadow/penguin-server` no longer starts a server

[中文版](2026-10-02-server-starts-from-pushed-cli.zh.md)

- Which harness runs now has one rule and one implementation (`resolveHarness`). When the data root records a usable pushed CLI, the pushed harness runs, reached through the `penguin-hmr` loader. Otherwise the installed harness runs.
- The `penguin server` / `penguin web` supervisor starts its server child on the CLI of the running harness. This covers the first start, every restart the server requests, and the server the CLI starts on its own when none is running. The desktop app starts its embedded server the same way.
- Code on the server's entry side, such as the process entry and the terminal WebSocket handshake, now reaches an installation with a push followed by a restart, without a reinstall. A push still does not restart the server.
- The CLI resolves the running harness once per process and hands it to the `server` command as context. The server receives its port, its host and that harness's CLI as arguments to `startServer`. Nothing is passed through the process's own environment any more. The `<root>/bin/penguin` an Agent runs and the self-update job both use that CLI.
- `penguin update` identifies the installation from the script the process runs rather than from its own module. A pushed CLI running from the data root's store therefore still finds its installation.
- The desktop app bundles the `penguin-hmr` loader, so an Agent's `penguin` there also reaches a pushed CLI.

## Compatibility

- `PENGUIN_CLI_ENTRY` no longer has any effect. The server no longer reads it, the CLI and the desktop app no longer set it, and the desktop's login-shell import and the command environment no longer list it. Its replacement is the resolved harness, so there is nothing to migrate.
- `@prismshadow/penguin-server` exports `startServer(options)`. Importing the package no longer starts a server. `pnpm start` runs `dist/start.js`, and `pnpm dev` runs `src/start.ts`.
