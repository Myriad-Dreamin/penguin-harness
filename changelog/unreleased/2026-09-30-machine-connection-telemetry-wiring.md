# Machine connection timings reach the telemetry buffer

- **Date:** 2026-09-30
- **Type:** feature
- **Scope:** `server`, `cli`

[中文版](2026-09-30-machine-connection-telemetry-wiring.zh.md)

The machine collection points from [the stage-timings entry](2026-09-30-machine-connection-stage-timings.md) now follow the telemetry switch. While it is on, their samples (`machine.connect`, `machine.connect.stage`, `machine.ssh.command`) go into the server's telemetry buffer with the machine's address as `keys.machine`. When it is switched off, the machine layer is back to one check per point.

The `Telemetry` mechanism gains `watch(listener)`, which reports the switch now and on every change.
