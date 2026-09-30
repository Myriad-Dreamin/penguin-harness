# Claude Code 会话里的程序带上该会话自己的凭据

- **Date:** 2026-09-30
- **Type:** feature
- **Scope:** `plugins`, `server`, `docs`
- **PR:** [Myriad-Dreamin/penguin-harness#128](https://github.com/Myriad-Dreamin/penguin-harness/pull/128)
- **Breaking:** yes — 在 Claude Code 会话里，`penguin` 以该会话的 Agent 身份发请求，不再用数据根上存的登录

[English](2026-09-30-claude-code-session-credential.md)

Claude Code 插件现在启动 `claude` 时，给它的环境与服务器驱动的会话给每条命令的一样：`PENGUIN_API_URL`、作为 `PENGUIN_API_TOKEN` 的该会话自己的凭据、`PENGUIN_PROJECT_ID`、`PENGUIN_AGENT_ID` 和 `PENGUIN_SESSION_ID`，并把 harness 自己的 `penguin` 放在 `PATH` 最前。Claude Code 运行的 `penguin` 命令因此以该会话的 Agent 署名。公司模式下员工排队的 run，这个 Agent 就是该员工，它对提案、工单和频道的写入落在该员工名下。

## 细节

- 这枚凭据能到的范围与会话凭据相同：本 Agent 自己的会话、本 Project 的组织，以及 Agent 的命令会调用的其他少数路由；其余一律以 `403 session_scope` 拒绝。
- 排队 run 的会话不属于组织的会话，所以它的凭据不带组织，能到本 Project 的所有组织。
- 程序仍在沙盒之外运行。
- `SessionEnv` 加入 `@prismshadow/penguin-server/plugin` 的类型，插件从 `SessionRuntimeModule` 取用它。

## 兼容性

- 在 Claude Code 会话里用 `penguin` 跑管理员命令的人，现在在那里会得到 `403 session_scope`。这类命令请在普通终端里跑，CLI 在那里仍用存下的登录。
- 升级前打开的 Claude Code 会话保留它启动时的环境；关掉再打开才会带上凭据。
