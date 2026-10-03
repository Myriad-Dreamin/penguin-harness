# 成本中心显示遥测读数，浏览器侧的耗时也进来

- **Date:** 2026-09-30
- **Type:** feature
- **Scope:** `web`, `server`
- **PR:** [Myriad-Dreamin/penguin-harness#120](https://github.com/Myriad-Dreamin/penguin-harness/pull/120)

[English](2026-09-30-usage-performance-panel.md)

成本中心在错误面板下方为管理员加了一个满宽的**性能**面板。它读遥测缓冲（`GET /api/telemetry`），按采集点列出次数、p50、p95 与最大值，各列均可排序——默认按 p95 从高到低，点表头切换——可按 Session 筛选；遥测关着时说明开关在哪；开着时可用**清空**按钮清掉缓冲（`DELETE /api/telemetry`）。普通成员看不到这个面板。该列名为**名称**。每个名称打开新增的采集点说明中它那一节——按界面语言是 `packages/server/src/telemetry/probes.zh.md` 或 `probes.en.md`——在 GitHub 上、指向采集点代码构建所用的 commit；这一节说明一条样本量的是什么，并链接到记录它的那一行，同一个 commit。名称旁的 **?** 显示这一节的一句概述。构建时从源码读出所有采集点的位置并写进产物——服务端的进其包（随 `GET /api/telemetry?view=probes` 以 `sites` 返回），浏览器的 `web.*` 连同概述进页面——源码有未提交改动时会提示行号可能对不上。`pnpm gen:probe-docs` 保持说明里的位置行最新；行号过时或有采集点缺节时测试会失败。

管理员在**设置 → 通用**里开关遥测（`PUT /api/admin/settings`），点开关的那个标签页随即启停自己的采集。普通成员看不到这一行。

页面现在也记自己那一半。`/api/me` 带上 `telemetry`；为真时页面加载一小段采集代码，把只记形状的样本发到新的接收口 `POST /api/telemetry/samples`：

- `web.session.open`：从打开会话到它的历史出现在屏幕上，另记历史请求本身的时间（`fetchMs`）。
- `web.turn`：一条回复，从第一段流式内容到最后一次渲染。
- `web.socket.connect`：API socket 从打开到收到服务端第一条消息。
- `web.sessions.fanout`：一次会话列表刷新，另记其中最慢的请求（`slowestMs`）。
- `web.boot`（每页一次）：到首次内容绘制，另记到服务端第一个字节的时间（`ttfbMs`）；`web.longtasks`：主线程上超过 50 ms 的阻塞，记次数与最长一次。

接收口收任何已登录用户的样本，但只收 `web.*` 采集点、数字与短字符串，每次至多 200 条；开关关着时答 `409 telemetry_off`，页面的采集随之停下。遥测关着时页面不加载采集代码，也不加观察器、监听、定时器或请求。

仅限管理员的界面现在在 Web App 里也关上了：成员打开管理员页面的 URL 会被送回首页，版本史与回滚只对管理员提供。
