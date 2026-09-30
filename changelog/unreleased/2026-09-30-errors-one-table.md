# Errors: server and browser errors in one table, readable per session

- **Date:** 2026-09-30
- **Type:** feature
- **Scope:** `server`, `cli`, `web`
- **PR:** PENDING

[中文版](2026-09-30-errors-one-table.zh.md)

The error table (`error_records`) is always on, and now says more about each error and takes in the ones that used to reach only a log or the browser's developer tools. It is not under the telemetry switch.

- **Context on every row.** A migration (20, `error-records-context`, safe on a hot push) adds three nullable columns: `stack` (unexpected errors only: the first 20 lines, at most 4000 characters), `task_id` (the timestamp of the Task's input message — its prompt's timestamp in the Trace) and `request_id` (the request's `x-penguin-request-id`, filled only while telemetry is on). Rows recorded before the migration keep NULL in all three.
- **Dedup per session.** The same error is persisted once per two-second window per source, code, Project **and session**, so one session's storm no longer hides another session's first occurrence. The repeats it drops are counted in memory (never stored; a restart zeroes them).
- **What only reached a log.** The API socket (a call that failed inside the platform, the socket's own error), a connected machine's relay (its socket failing or refused, a stream not opened in time, an event stream gone silent, a terminal relay failing) and the plugins a generation's load skipped are now recorded too, with sources `socket`, `machine` and `plugin`. The warnings `packages/hmr` writes to stderr itself are still not recorded.
- **Browser errors.** `POST /api/errors/browser` takes what a page reports: JSON only, at most 20 reports a request and 60 a user a minute (the rest are counted back as `dropped`), recorded with source `browser`. A `projectId` the caller cannot enter is dropped and the row becomes unattributed (admins only).
- **The read.** `GET /api/projects/:p/usage/errors` takes `sessionId` and `requestId`, returns each row's Agent, session, Task, request, status and stack, and answers `suppressed`: the repeats the dedup dropped for that Project (and session).
- **`penguin telemetry errors`** lists the project's recent errors with the Task, the request id and the stack's first frame; inside a session it shows that session's (`--all`, `--session`, `--request`, `--kind`, `--limit`, `--json`).
- **The Web App** wraps itself in an error boundary (always on: a render error shows a message and a Reload button instead of a blank page) and listens for window errors and unhandled rejections. It reports only what the server cannot see — render errors, unhandled rejections, network-level failures (status 0), the API socket's timeouts and silences — never an `ApiError`, deduplicated and capped in the page, and only while the browser-side switch is on: `localStorage.setItem("penguin.reportErrors", "1")`.
