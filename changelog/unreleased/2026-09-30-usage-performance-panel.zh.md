# 成本中心显示遥测读数，浏览器侧的耗时也进来

- **Date:** 2026-09-30
- **Type:** feature
- **Scope:** `web`, `server`
- **PR:** [Myriad-Dreamin/penguin-harness#120](https://github.com/Myriad-Dreamin/penguin-harness/pull/120)

[English](2026-09-30-usage-performance-panel.md)

成本中心在错误面板下方为管理员加了一个满宽的**性能**面板。它读遥测缓冲（`GET /api/telemetry`），按采集点列出次数、p50、p95 与最大值，服务端采集点在前、浏览器的在后，可按 Session 筛选；遥测关着时说明开关在哪；开着时可用**清空**按钮清掉缓冲（`DELETE /api/telemetry`）。普通成员看不到这个面板。每个采集点的名称链接到 GitHub 上记录它的那一行，指向构建所用的 commit：构建时从源码读出所有采集点的位置并写进产物——服务端的进其包（随 `GET /api/telemetry?view=probes` 以 `sites` 返回），浏览器的 `web.*` 进页面——构建自未提交改动时会提示行号可能对不上。

管理员在**设置 → 通用**里开关遥测（`PUT /api/admin/settings`），点开关的那个标签页随即启停自己的采集。普通成员看不到这一行。

页面现在也记自己那一半。`/api/me` 带上 `telemetry`；为真时页面加载一小段采集代码，把只记形状的样本发到新的接收口 `POST /api/telemetry/samples`：

- `web.session.open` 与 `web.turn`：会话历史的加载与之后每个 turn，从 socket 帧到渲染提交——reducer 用时、合并点的等待、渲染用时，打开那一次另记历史请求本身。
- `web.socket.connect`：API socket 从握手到首条应答。
- `web.sessions.fanout`：一次 session 列表刷新发出的请求数与最慢一条的用时。
- `web.boot`（每页一次）与 `web.longtasks`：导航、入口脚本的下载、首次绘制与首次内容绘制（取自浏览器自己的计时），以及长任务与阻塞时长。

接收口收任何已登录用户的样本，但只收 `web.*` 采集点、数字与短字符串，每次至多 200 条；开关关着时答 `409 telemetry_off`，页面的采集随之停下。遥测关着时页面不加载采集代码，也不加观察器、监听、定时器或请求。

仅限管理员的界面现在在 Web App 里也关上了：成员打开管理员页面的 URL 会被送回首页，版本史与回滚只对管理员提供。
