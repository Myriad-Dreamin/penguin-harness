# WebSocket upgrade 交给平台，终端握手随推送送达

- **Date:** 2026-10-01
- **Type:** refactor
- **Scope:** `server`, `docs`

[English](2026-10-01-upgrade-seam.md)

- 每个监听器经 upgrade 接缝（与 HTTP 接缝对应）把 WebSocket upgrade 原样转交给当前这一代平台，不读其中任何内容。平台不接的路径答 404，没有当前一代时答 503。
- 终端流的握手搬进平台：路径、Origin 检查、会话 Cookie 与 owner 核对。其中任何一项的修改，现在都随热推送送达安装。
- 早于本改动的平台没有 `upgrade`，在带本改动的入口上，它的终端流以 404 被拒。平台为早于本改动的入口保留 `terminals()` 与 `attachStream()`。
