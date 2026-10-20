# 热推送的换装窗口内由老代际继续应答

- **Date:** 2026-10-20
- **Type:** fix
- **Scope:** `server`, `hmr`

[English](2026-10-20-hot-push-keeps-the-old-runtime-answering.md)

平台壳现在按代际捕获 API socket 派发所经的 `http`：调用落在其背后的树已被 dispose 的窗口里——上一代 dispose 到下一代第一次应答之间——由捕获的那一代应答，而不是每次调用都报错。捕获在壳运行的每次 boot 后重新取过；活着的树没有 `http` 面时仍答设计的 503；后继就绪后照旧以 1012 收口老 sockets。

失败推送的回执现在写明接收端做了什么：`recovered: true`——上一版平台已从它的驻留文档重新 boot、恢复服务；`recovered: false`——恢复也失败了，接收端在下一个成功推送或重启之前服务一个半停的 App。`scripts/deploy.mjs` 会打印这一格。

推送在发送任何字节之前先过一道静态兼容门（`scripts/check-push-compat.mjs`），比对要推的树与目标现役树：推送声明的运行时接口需求、它的平台成员面、它的具名迁移台账。有违规即拒绝（`--force` 照推）；这次换装不会整合的资源组会提前列出；目标现役树在本检出对象库读不到时如实记「未检查」，而读不出来的声明让门失败，绝不静默放行。
