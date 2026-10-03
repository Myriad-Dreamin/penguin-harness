# 连接一台机器的耗时按阶段可见

- **Date:** 2026-09-30
- **Type:** feature
- **Scope:** `server`
- **PR:** [Myriad-Dreamin/penguin-harness#115](https://github.com/Myriad-Dreamin/penguin-harness/pull/115)

[English](2026-09-30-machine-connection-stage-timings.md)

`GET /api/projects/:projectId/machines` 里的连接作业多了 `stages`：列出它跑过的每个连接阶段（`probe`、`start-server`、`reprobe`、`hold`、`sync-models`、`sync-plugins`），每项带 `startedAt`、`endedAt` 与 `ok`。连接用不到的阶段不列出。连接成功时，结果多一个 `connectedAt`，即连接被保持住的时刻。两个字段在 API 类型里是可选的，因为跑旧版服务端的机器不会带它们。

机器层加了一组遥测采集点，样本交给一个接收端。遥测打开之前接收端为空，目前也还没有任何地方去打开它。打开后：

- 每个连接阶段记一条 `machine.connect.stage` 样本，整次连接记一条 `machine.connect`，重新保持连接也算；
- 会话上的每条命令记一条 `machine.ssh.command`——从发起到答复，含退出码与 stdin 字节数，超时单独标出——不含命令正文；
- SOCKS 握手按机器每 10 秒汇总成一条 `machine.socks.handshake`。

接收端为空时，每个采集点只做一次判断：不读时钟、不分配内存、不起定时器。
