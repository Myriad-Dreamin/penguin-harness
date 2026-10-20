# Queued runs start only in the generation actually serving

- **Date:** 2026-10-20
- **Type:** fix
- **Scope:** `server`

[中文版](2026-10-20-queued-runs-wait-for-the-serving-generation.zh.md)

A generation no longer takes over the auto-start of queued work at construction. It holds its claim, and the platform shell installs it only once that boot has become the App actually serving — a cold start, a re-assembly that committed, the restore after a failed one. A candidate still behind its commit boundary starts nothing: a run that ends while a swap is in the air leaves its queued follow-ups and idle-arrival background notices parked, and the generation that comes out serving starts them; nothing queued is lost, started twice, or started in a generation that never served.

The generation a push boots holds off the same way — the slip it takes carries the serving side's promise — and the route that opened the slip hands the queued work over once the push has landed. A push that fails restores the previous generation, which takes the queue back the same way. A rolled-back build older than this change claims at construction as its kind always did, and the landed hand-over call is a no-op on it.
