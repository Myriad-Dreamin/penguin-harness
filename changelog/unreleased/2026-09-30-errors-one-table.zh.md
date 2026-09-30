# 错误面：服务端与浏览器的错误进同一张表，可按会话读

- **Date:** 2026-09-30
- **Type:** feature
- **Scope:** `server`, `cli`, `web`
- **PR:** [Myriad-Dreamin/penguin-harness#122](https://github.com/Myriad-Dreamin/penguin-harness/pull/122)

[English](2026-09-30-errors-one-table.md)

错误表（`error_records`）一直常开；现在每条错误说得更多，今天只进日志或只躺在浏览器开发者工具里的那些也进了表。它不在遥测开关之下。

- **每行多了上下文。** 一次迁移（20，`error-records-context`，热推安全）加三个可空列：`stack`（只有非预期错误：前 20 行、至多 4000 字符）、`task_id`（Task 输入消息的时间戳，即它的 prompt 在 Trace 里的时间戳）与 `request_id`（请求的 `x-penguin-request-id`，只在遥测打开期间有值）。迁移之前记下的行三列都是 NULL。
- **按会话去重。** 同一个错误在两秒窗内按来源、代码、Project **与会话**只落一条，一个会话的风暴不再压掉另一个会话的第一次。被压掉的重复只在内存里计数（不落库，重启归零）。
- **原来只进日志的。** API socket（在平台里失败的调用、socket 自身的错误）、已连接机器的 relay（socket 拨不通或被拒、流限时未开、事件流静默、终端 relay 出错）以及每一代装配跳过的插件，现在也入表，来源分别是 `socket`、`machine`、`plugin`。`packages/hmr` 自己写 stderr 的告警仍然收不到。
- **浏览器的错误。** `POST /api/errors/browser` 接收页面的回传：只收 JSON，一次至多 20 条、每用户每分钟至多 60 条（其余在答复里以 `dropped` 计回），来源记为 `browser`。调用者进不去的 `projectId` 被去掉，这一行成为无归属行（只有管理员可见）。
- **读口。** `GET /api/projects/:p/usage/errors` 多 `sessionId` 与 `requestId` 两个过滤，每行给出 Agent、会话、Task、请求、状态码与栈，并答出 `suppressed`：这个 Project（与会话）被去重压掉的条数。
- **`penguin telemetry errors`** 列出 Project 最近的错误，带 Task、请求 id 与栈的第一帧；在会话里运行时只列这个会话的（`--all`、`--session`、`--request`、`--kind`、`--limit`、`--json`）。
- **Web App** 用一个错误边界包住自己（常开：渲染出错时显示说明与「重新加载」按钮，而不是一片空白），并监听 window 错误与未处理的拒绝。只回传服务端看不到的——渲染错误、未处理的拒绝、网络层失败（status 0）、API socket 的超时与静默——从不回传 `ApiError`；页面里先去重、设上限，且只在浏览器侧开关打开时发送：`localStorage.setItem("penguin.reportErrors", "1")`。
