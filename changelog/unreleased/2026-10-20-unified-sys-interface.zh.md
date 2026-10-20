# 沙盒、机器、云电脑统一在一个 Sys 能力接口后面

- **Date:** 2026-10-20
- **Type:** feature
- **Scope:** `core`, `server`, `desktop`

[English](2026-10-20-unified-sys-interface.md)

活儿发生的地方——本机、沙盒、机器、云电脑——各自带一套自己的抽象：文件工具走自己的端口，沙盒改写一次 exec 的 argv，机器带着自己的传输与命令集。现在一套能力接口站在它们全部后面：`Sys`，一个能力逐项可选的世界——文件（`fs`）、命令执行（`exec`）、网络端点（`listen`）——经 `@prismshadow/penguin-core/sys` 子路径取用，那里只有形状。

## 接口

- `Fs` 就是文件工具已经在走的那一个面（stat 事实、整读与区间读、原子写、一次 fetch），加上把一个程序铺进世界的唯一原语 `copyFile`，以及告诉错误措辞一次拒绝是不是一次围堵的 `sandboxed` 标记。
- `Exec` 跑一条精确的 argv——从不是 shell 字符串——带两条流、可等待的退出与 kill；`Listen` 开端点（端口 0 让提供方挑）并连端点。Sys 带某个成员就是用它能做这件事、不带就是说它不能；需要的能力不在时，调用方抛 `SYS_CAPABILITY_ABSENT` 并点名缺哪个，从不安静改道别处重跑。接口靠增加可选成员生长。
- 除错误工厂外不产出任何运行时代码：实现住在它们运行的地方，所以只与 Sys 打交道的包对着契约编译而不拖上一个运行时。

## 宿主与 Sys 上的服务端

- `HostSys`（`createSys()`，`@prismshadow/penguin-server/sys`）是宿主的默认世界——本进程的文件（文件工具的本机端口加整文件拷贝）、本进程的子进程、本机的 loopback。它是默认而非基类：其它提供方在它旁边实现同一个接口。
- `runServer(sys, port)` 经 `sys.fs.copyFile` 把一个程序（文件，目录递归）铺进一个世界——打包的 bundle、它的原生模块、web dist、以及打包应用带着的 `package.json` 与插件包（那是服务端启动时解析的库）——再在服务端入口所读的环境（`HOST`、`PORT`、`PENGUIN_HOME`、`PENGUIN_PORT_FILE`）下启动它的入口，从宣告文件读回端口——那是服务端启动的最后一步，所以读到端口就是 App 已起。`PORT=0` 交给操作系统，宣告里的数字就是答案。启动前会先清空上一次的宣告；先死掉的程序带着自己最后的输出拒绝。
- `runServer` 交回的是那个服务端在那个世界上的 shell：`exec` 以数据根为 `PENGUIN_HOME`；`installPlugin` 驱动世界自己的 `penguin` CLI 对着服务端的 loopback 地址装插件。那里不需要密码：服务端启动时把本机 API token 写进数据根（`<root>/api-token`），那就是 CLI 在任何宿主上本来就在用的机器本地管理员凭据。
- 桌面外壳用一个 `HostSys` 起内嵌服务端，并经 `sys.fs` 读端口宣告——外壳与提供方共用一条抵达服务端的路。

## 测试

- core 钉住契约：fail-closed 错误、一个能力都不带／只带一个／全带的世界、以及子路径只发形状与错误工厂。
- server 驱动真东西：宿主的文件回环与拷贝、精确 argv 的执行与两条流／退出码／kill／程序不存在、loopback 的 listen/connect 与 close/abort 契约；以及 `runServer` 对着一个 stub 服务端程序（树拷贝、端口宣告、陈旧宣告、先死的入口、经 stub CLI 装插件、以及它的拒绝）。
