# Wait for session writers before an incompatible handover

- **Date:** 2026-10-12
- **Type:** fix
- **Scope:** `server`

[中文版](2026-10-12-session-writer-drain.zh.md)

An incompatible session-state handover now waits for aborted writers to actually finish before exposing the successor and restarting interrupted sessions. Passing the normal five-second shutdown budget no longer allows a second writer to start. Process shutdown keeps its bounded wait.
