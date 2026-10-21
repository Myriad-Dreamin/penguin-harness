# A failed forward cools the machine down, instead of being repeated per request

- **Date:** 2026-10-21
- **Type:** fix
- **Scope:** `server`, `web`, `plugins`

[中文版](2026-10-21-machine-forward-cooldown.zh.md)

A machine whose connection is gone no longer answers every request with the same instant failure. The same-origin forward to a machine remembers a failure for five seconds and, inside that window, answers `503` with `Retry-After` without resolving or dialling the machine at all; the first forward that reaches it clears the record. The machine socket cache did the same for a failed dial (an answered refusal keeps its longer record), so a stream no longer re-dials a machine whose channel is down on every retry.

The ssh kind's SOCKS handshake deadline moved from 8 s to 12 s, still under the forward's 15 s answer deadline, so a session that is slow for a few seconds is no longer given up on and retried into the same stall.

One streaming call that does not open in time now cancels only that stream; the socket is kept unless a second stream in a row also fails to open, so one slow endpoint no longer takes every request in flight on that machine's socket with it.

Roadmap list reads accept `items=0`, and the app's roadmap sidebar and a room's roadmap column use it: they read the rows, not every item's brief, which had made the list answer close to a megabyte.
