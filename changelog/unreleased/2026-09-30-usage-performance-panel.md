# The cost center shows telemetry, and the browser's timings join it

- **Date:** 2026-09-30
- **Type:** feature
- **Scope:** `web`, `server`

[中文版](2026-09-30-usage-performance-panel.zh.md)

For an admin, the cost center now has a full-width **Performance** panel below the errors panel. It reads the telemetry buffer (`GET /api/telemetry`) and lists every probe with its count, p50, p95 and maximum, server probes first and the browser's after them, and can be narrowed to one Session. While telemetry is off it says so and how to turn it on. Members are not shown the panel.

The page now records its own half. `/api/me` carries `telemetry`; when it is true the page loads a small collector chunk and sends shape-only samples to a new intake, `POST /api/telemetry/samples`:

- `web.session.open` and `web.turn`: a Session's history load, then each turn, from the socket frame to the rendered commit — reducer time, the coalescing wait, render time, the history request itself for the open.
- `web.socket.connect`: the API socket's handshake to its first reply.
- `web.sessions.fanout`: how many requests a session-list reload sends and how long the slowest one takes.
- `web.boot` (once per page) and `web.longtasks`: navigation, the entry script's download, first paint and first contentful paint from the browser's own timings, and long tasks with their blocking time.

The intake takes any signed-in user's samples but only `web.*` probes of numbers and short strings, at most 200 per request, and answers `409 telemetry_off` while the switch is off, which stops the page's collector. While telemetry is off the page loads no collector code and adds no observer, listener, timer or request.

Admin-only surfaces are now closed in the web app as well as on the server: a member who opens an admin page's URL is sent home, and the version history and its rollback are offered to admins only.
