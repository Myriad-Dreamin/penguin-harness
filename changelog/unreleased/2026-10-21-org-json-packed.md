# The company surface's JSON answers gzip

- **Date:** 2026-10-21
- **Type:** fix
- **Scope:** `server`

[中文版](2026-10-21-org-json-packed.zh.md)

A JSON answer that the caller says it accepts gzipped comes back gzipped: GET answers of 200 with a JSON content type, at least two kilobytes of them, from any route group — the plugin pages' lists included. What streams is untouched (an SSE feed, a download), and the machine proxy at `/server/…` relays the machine's own answer unchanged: the machine that owns the route decides the encoding, and a browser's `Accept-Encoding` reaches it as it is. The compression runs in the thread pool, not on the event loop.
