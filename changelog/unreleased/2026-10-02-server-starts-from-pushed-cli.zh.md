# server 从推送来的 CLI 启动，运行中的 harness 只解析一次、作为上下文传递

- **Date:** 2026-10-02
- **Type:** fix
- **Scope:** `cli`, `server`, `desktop`, `core`, `docs`
- **Breaking:** `PENGUIN_CLI_ENTRY` 已移除；导入 `@prismshadow/penguin-server` 不再启动 server

[English](2026-10-02-server-starts-from-pushed-cli.md)

- 「哪一份 harness 在运行」现在只有一条规则、一处实现（`resolveHarness`）。数据根里记有可用的推送 CLI 时，运行的是推送版，经 `penguin-hmr` 加载器进入；否则运行安装版。
- `penguin server` / `penguin web` 的 supervisor 用运行中 harness 的 CLI 拉起 server 子进程，包括首次启动、server 每次请求的重启，以及 CLI 在没有运行中的 server 时自行拉起的那一个。桌面端拉起内嵌 server 的方式相同。
- server 入口一侧的代码（比如进程入口、终端 WebSocket 握手）现在随推送加一次重启送达安装，不必重装。推送本身仍不重启 server。
- CLI 每个进程只解析一次运行中的 harness，作为上下文交给 `server` 命令。server 的端口、主机和这份 harness 的 CLI 都作为 `startServer` 的参数传入，不再经进程自身的环境变量传递。Agent 运行的 `<root>/bin/penguin` 和自更新任务都用这份 CLI。
- `penguin update` 改为按进程实际运行的脚本识别安装方式，而不是按自身模块的位置识别。所以从数据根的仓里运行的推送版 CLI 也能找到自己所在的安装。
- 桌面应用打包了 `penguin-hmr` 加载器，所以在桌面端，Agent 的 `penguin` 也能进入推送来的 CLI。

## 兼容性

- `PENGUIN_CLI_ENTRY` 不再有任何作用：server 不再读取它，CLI 和桌面应用不再设置它，桌面端的登录 shell 导入列表和命令环境也不再列出它。取代它的是已解析的 harness，没有需要迁移的东西。
- `@prismshadow/penguin-server` 导出 `startServer(options)`，导入这个包不再启动 server。`pnpm start` 改为运行 `dist/start.js`，`pnpm dev` 改为运行 `src/start.ts`。
