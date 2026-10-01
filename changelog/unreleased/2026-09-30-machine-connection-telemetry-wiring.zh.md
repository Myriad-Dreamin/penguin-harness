# 机器连接的耗时进入遥测缓冲

- **Date:** 2026-09-30
- **Type:** feature
- **Scope:** `server`, `cli`

[English](2026-09-30-machine-connection-telemetry-wiring.md)

[阶段耗时那一条](2026-09-30-machine-connection-stage-timings.zh.md)里的机器采集点现在跟随遥测开关：打开期间，它们的样本（`machine.connect`、`machine.connect.stage`、`machine.ssh.open`、`machine.ssh.command`、`machine.socks.handshake`）进入服务端的遥测缓冲，以机器地址作 `keys.machine`；关掉后，机器层回到每个采集点只做一次判断。

`GET /api/telemetry?view=machine` 多了 `machines`：缓冲里出现过的每台机器一行，新的在前，逐个采集点列出次数、失败数、计数之和（一个 SOCKS 窗口里的握手次数）、总用时与最长用时；`machine.connect.stage` 按阶段分开，连接慢在哪一步直接可读。`penguin telemetry --by machine` 在会话之后打印这些行。

`Telemetry` 机制多一个 `watch(listener)`：当即报告一次开关状态，之后每次变化再报。
