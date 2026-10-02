# server 从推送来的 CLI 启动，入口随推送加一次重启更新

- **Date:** 2026-10-02
- **Type:** fix
- **Scope:** `cli`, `desktop`

[English](2026-10-02-server-starts-from-pushed-cli.md)

- 数据根里有推送来的 CLI 时，`penguin server` / `penguin web` 的 supervisor 经它（`penguin-hmr`）启动 server 子进程，包括首次启动、server 每次请求的重启，以及 CLI 在没有运行中的 server 时自行拉起的那一个。没有推送过，或记录指向的 bundle 已不在仓里时，仍用安装时的 CLI 启动。
- 桌面端拉起内嵌 server 的方式相同：数据根里有推送来的 CLI 就经它启动，没有就用随应用打包的 server。
- server 入口一侧的代码（比如进程入口、终端 WebSocket 握手）现在随推送加一次重启送达安装，不必重装。推送本身仍不重启 server。
- 经推送来的 CLI 启动的 server，导出的 `PENGUIN_CLI_ENTRY` 就是推送来的 CLI（`penguin-hmr` 加载器），所以推送落地后，Agent 调用的 `penguin` 与 Web App 的自更新都运行推送来的 CLI；`penguin update` 改为按进程实际运行的脚本识别安装方式，从加载器找到所在的安装。桌面应用一并打包了这个加载器。
