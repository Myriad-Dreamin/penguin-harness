# Machine traffic rides the machine's one forward

- **Date:** 2026-10-20
- **Type:** refactor
- **Scope:** `server`, `web`

[中文版](2026-10-20-machines-over-one-forward.zh.md)

A machine's server is reached over the forward held to it in its ssh session — a loopback listener whose every connection is one channel inside that session — instead of a socket of the machines' own. The request proxy, the API client, the terminal relay and the machines' aggregate event stream now dial that one address with node:http and `ws`, the way they would any local server, so nothing below them knows what ssh is. The machine socket cache, its API-socket relay and the event hub over them were retired, and the browser-visible API socket fact went with them.

## Details

- One forward is kept per machine and port: opened on first use, dropped when that machine's session is replaced, when its server moves to another port, when it disconnects, and with the generation on its way out. A failed dial is not remembered.
- The aggregate stream opens one streaming call on each watched machine's API socket, over its forward, asking `/api/events`, and re-tags every `server_event` as `machine_event`, keeping its own `id` per frame so a tab's stream stays resumable across machines. Each machine's reader resumes with that machine's own last event id, with a backoff from 500 ms to 10 s; a tab that comes back is answered with `resync_required` rather than replayed from a buffer this server no longer keeps.
- A machine's API socket is reached the same way: one WebSocket per stream through the forward, carrying the socket's `call`, `stream`, `event` and `end` frames, so a machine's events arrive already framed and nothing on this side parses text/event-stream. A socket is opened for its stream and closed with it — the ssh session under the forward is already the multiplexer, so there is no pool to keep.
- `MachineApi` and the hot-update push take the forward's endpoint and the server's port over there separately: the socket goes to the endpoint, the `Host` header names the port the machine's server listens on, which the canonical-host guard requires.
- The Machines detail dialog no longer shows an API socket line: the fact it read is gone.

## Compatibility

- The `socket` field of `MachineInfo` (`GET …/machines`) is no longer served. A client that read it finds no fact; nothing else in the API changed.
