# Machine connection timings reach the telemetry buffer

- **Date:** 2026-09-30
- **Type:** feature
- **Scope:** `server`, `cli`

[中文版](2026-09-30-machine-connection-telemetry-wiring.zh.md)

The machine collection points from [the stage-timings entry](2026-09-30-machine-connection-stage-timings.md) now follow the telemetry switch. While it is on, their samples (`machine.connect`, `machine.connect.stage`, `machine.ssh.open`, `machine.ssh.command`, `machine.socks.handshake`) go into the server's telemetry buffer with the machine's address as `keys.machine`. When it is switched off, the machine layer is back to one check per point.

`GET /api/telemetry?view=machine` adds `machines`: one row per machine the buffer names, newest first, with each probe's count, failures, summed count (a SOCKS window's handshakes), total and longest duration. `machine.connect.stage` is split by stage, so a slow connect reads as the stage it spent its time in. `penguin telemetry --by machine` prints these rows after the sessions.

The `Telemetry` mechanism gains `watch(listener)`, which reports the switch now and on every change.
