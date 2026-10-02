# A server starts from the pushed CLI, so its entry updates with a push and a restart

- **Date:** 2026-10-02
- **Type:** fix
- **Scope:** `cli`, `desktop`

[中文版](2026-10-02-server-starts-from-pushed-cli.zh.md)

- When the data root has a pushed CLI, the `penguin server` / `penguin web` supervisor starts its server child through it (`penguin-hmr`). This covers the first start, every restart the server requests, and a server the CLI starts on its own when none is running. When nothing was pushed, or the record names a bundle the store no longer holds, the server starts on the installed CLI as before.
- The desktop app starts its embedded server the same way: through the pushed CLI when the data root has one, otherwise from the server bundled with the app.
- Code on the server's entry side, such as the process entry and the terminal WebSocket handshake, now reaches an installation with a push followed by a restart, without a reinstall. A push still does not restart the server.
