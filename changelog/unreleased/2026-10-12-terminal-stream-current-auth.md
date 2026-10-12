# Terminal streams authenticate against the current App

- **Date:** 2026-10-12
- **Type:** fix
- **Scope:** `server`

[中文版](2026-10-12-terminal-stream-current-auth.zh.md)

Terminal WebSocket upgrades now resolve Auth from the same platform instance that serves the terminal and its stream protocol, instead of reading a runtime Auth getter. After a plugin re-assembly, a valid session cookie reaches the current App. A missing or disposed business tree refuses the upgrade with 503 and a terminal log line rather than throwing out of the upgrade handler. Cookie selection, origin checks and terminal ownership checks are unchanged.

This handshake change requires a runtime update; a platform push alone does not replace the socket wiring.
