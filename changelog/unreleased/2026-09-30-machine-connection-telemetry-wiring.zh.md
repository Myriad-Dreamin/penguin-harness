# 机器连接的耗时进入遥测缓冲

- **Date:** 2026-09-30
- **Type:** feature
- **Scope:** `server`, `cli`

[English](2026-09-30-machine-connection-telemetry-wiring.md)

[阶段耗时那一条](2026-09-30-machine-connection-stage-timings.zh.md)里的机器采集点现在跟随遥测开关：打开期间，它们的样本（`machine.connect`、`machine.connect.stage`、`machine.ssh.command`）进入服务端的遥测缓冲，以机器地址作 `keys.machine`；关掉后，机器层回到每个采集点只做一次判断。

`Telemetry` 机制多一个 `watch(listener)`：当即报告一次开关状态，之后每次变化再报。
