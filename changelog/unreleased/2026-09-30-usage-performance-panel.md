# The cost center shows telemetry, and the browser's timings join it

- **Date:** 2026-09-30
- **Type:** feature
- **Scope:** `web`, `server`
- **PR:** [Myriad-Dreamin/penguin-harness#120](https://github.com/Myriad-Dreamin/penguin-harness/pull/120)

[中文版](2026-09-30-usage-performance-panel.zh.md)

For an admin, the cost center now has a full-width **Performance** panel below the errors panel. It reads the telemetry buffer (`GET /api/telemetry`) and lists every probe with its count, p50, p95 and maximum, sorted by any column — p95, slowest first, until a header is clicked — and can be narrowed to one Session. While telemetry is off it says so and points to the switch; while it is on, **Clear** empties the buffer (`DELETE /api/telemetry`). Members are not shown the panel. The column is **Name**. Each name opens its section of the new probe reference, `packages/server/src/telemetry/probes.en.md` or `probes.zh.md` by the UI's language, on GitHub at the commit the probe's code was built from; the section says what a sample measures and links on to the line that records it, at the same commit. A **?** beside the name shows the section's one-sentence summary. The build reads every probe site off the source and inlines the table — the server's into its bundle (returned with `GET /api/telemetry?view=probes` as `sites`), the browser's `web.*` into the page, with the summaries — and a build from uncommitted source says the line may be off. `pnpm gen:probe-docs` keeps the reference's site lines current; a test fails when they drift or a probe has no section.

An admin turns telemetry on and off under **Settings → General** (`PUT /api/admin/settings`); the tab that flips it starts or stops its own collector at once. Members do not get the row.

The page now records its own half. `/api/me` carries `telemetry`; when it is true the page loads a small collector chunk and sends shape-only samples to a new intake, `POST /api/telemetry/samples`:

- `web.session.open` and `web.turn`: a Session's history load, then each turn, from the socket frame to the rendered commit — reducer time, the coalescing wait, render time, the history request itself for the open.
- `web.socket.connect`: the API socket's handshake to its first reply.
- `web.sessions.fanout`: how many requests a session-list reload sends and how long the slowest one takes.
- `web.boot` (once per page) and `web.longtasks`: navigation, the entry script's download, first paint and first contentful paint from the browser's own timings, and long tasks with their blocking time.

The intake takes any signed-in user's samples but only `web.*` probes of numbers and short strings, at most 200 per request, and answers `409 telemetry_off` while the switch is off, which stops the page's collector. While telemetry is off the page loads no collector code and adds no observer, listener, timer or request.

Admin-only surfaces are now closed in the web app as well as on the server: a member who opens an admin page's URL is sent home, and the version history and its rollback are offered to admins only.
