# 公司面的 JSON 应答走 gzip

- **Date:** 2026-10-21
- **Type:** fix
- **Scope:** `server`

[English](2026-10-21-org-json-packed.md)

调用方声明接受 gzip 时，JSON 应答就以 gzip 回：GET 的 200、JSON 内容类型、至少两 KB——任何路由组都一样，插件页的列表也在内。流式应答（SSE、下载）不动，机器代理 `/server/…` 原样转交机器自己的应答：路由在机器上，编码由它定，浏览器带来的 `Accept-Encoding` 照原样传到。压缩跑在线程池里，不占主事件循环。
