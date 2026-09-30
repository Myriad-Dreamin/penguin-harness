# A machine connect says which stage its time went to

- **Date:** 2026-09-30
- **Type:** feature
- **Scope:** `server`
- **PR:** [Myriad-Dreamin/penguin-harness#115](https://github.com/Myriad-Dreamin/penguin-harness/pull/115)

[中文版](2026-09-30-machine-connection-stage-timings.zh.md)

A connect job in `GET /api/projects/:projectId/machines` now carries `stages`: each connect stage it ran (`probe`, `start-server`, `reprobe`, `hold`, `sync-models`, `sync-plugins`), with `startedAt`, `endedAt` and `ok`. Stages a connect does not need are not listed. A successful connect's result adds `connectedAt`, the moment the connection was held. Both fields are optional in the API types, because a machine running an older server does not send them.

The machine layer now has telemetry collection points that report to a sink. The sink is empty until telemetry is switched on, and nothing switches it on yet. When it is on:

- each connect stage is a `machine.connect.stage` sample, and the whole connect is a `machine.connect` sample, re-holds included;
- the ssh session coming up is a `machine.ssh.open` sample;
- each command on the session is a `machine.ssh.command` sample with its wait, run time, exit code and stdin bytes, never its text;
- SOCKS handshakes are tallied per machine every 10 s into one `machine.socks.handshake` sample.

When the sink is empty, each point costs one check: no clock read, no allocation, no timer.
