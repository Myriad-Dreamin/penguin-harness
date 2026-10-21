# 沙盒、机器、云电脑统一在一个 Sys 能力接口后面

- **Date:** 2026-10-20
- **Type:** feature
- **Scope:** `core`, `hmr`, `server`, `desktop`

[English](2026-10-20-unified-sys-interface.md)

活儿发生的地方——本机、沙盒、机器、云电脑——各自带一套自己的抽象：文件工具走自己的端口，沙盒改写一次 exec 的 argv，机器带着自己的传输与命令集。现在一套能力接口站在它们全部后面：`Sys`，一个能力逐项可选的世界——文件（`fs`）、命令执行（`exec`）、网络端点（`listen`）与端口转发（`forward`）——经 `@prismshadow/penguin-core/sys` 子路径取用，那里只有形状。

## 接口

- `Fs` 就是文件工具已经在走的那一个面（stat 事实、整读与区间读、原子写、一次 fetch），加上把一个程序铺进世界的唯一原语 `copyFile`，以及告诉错误措辞一次拒绝是不是一次围堵的 `sandboxed` 标记。
- `Exec` 跑一条精确的 argv——从不是 shell 字符串——带两条流、可等待的退出与 kill；`Listen` 开端点（端口 0 让提供方挑）并连端点。Sys 带某个成员就是用它能做这件事、不带就是说它不能；需要的能力不在时，调用方抛 `SYS_CAPABILITY_ABSENT` 并点名缺哪个，从不安静改道别处重跑。接口靠增加可选成员生长。
- `Forward` 让一个开在**那边**的端口在**这边**可及：宿主上的转发就是地址本身，而经连接抵达的世界会把那个端口顺着这条连接隧穿回来。调用方不必为「Sys 起的程序」再自带一套传输。
- 除错误工厂外不产出任何运行时代码：实现住在它们运行的地方，所以只与 Sys 打交道的包对着契约编译而不拖上一个运行时。

## 宿主与 Sys 上的服务端

- `HostSys`（`createSys()`，`@prismshadow/penguin-server/sys`）是宿主的默认世界——本进程的文件（文件工具的本机端口加整文件拷贝）、本进程的子进程、本机的 loopback，以及那个平凡的转发。它是默认而非基类：其它提供方在它旁边实现同一个接口。
- `runServer(sys, port)` 经 `sys.fs.copyFile` 把一个程序（文件，目录递归）铺进一个世界——打包的 bundle、它的原生模块、web dist、以及打包应用带着的 `package.json` 与插件包（那是服务端启动时解析的库）——再在服务端入口所读的环境（`HOST`、`PORT`、`PENGUIN_HOME`、`PENGUIN_PORT_FILE`）下启动它的入口，从宣告文件读回端口——那是服务端启动的最后一步，所以读到端口就是 App 已起。`PORT=0` 交给操作系统，宣告里的数字就是答案。启动前会先清空上一次的宣告；先死掉的程序带着自己最后的输出拒绝。
- `runServer` 交回的是那个服务端在那个世界上的 shell：`exec` 以数据根为 `PENGUIN_HOME`；`installPlugin` 驱动世界自己的 `penguin` CLI 对着服务端的 loopback 地址装插件。那里不需要密码：服务端启动时把本机 API token 写进数据根（`<root>/api-token`），那就是 CLI 在任何宿主上本来就在用的机器本地管理员凭据。
- 桌面外壳用一个 `HostSys` 起内嵌服务端，并经 `sys.fs` 读端口宣告——外壳与提供方共用一条抵达服务端的路。

## 首次安装：在还没有服务端可推送之前

- 一个从没跑过 Penguin 的世界没有东西能接收版本：会接推送的那个服务端正是要被装进去的东西。所以先铺在那里的是一个文件——HMR bootstrap（`hmr-server.mjs`），由 server 包构建、需要的一切都内联在里面。它跑在安装处已有的那个 Node 上，不带 node_modules，只服务一个端点：升级流；其余请求一律答 503。它绑 loopback，把自己拿到的端口写进一个文件供安装方轮询，并把一个版本收进数据根的 HMR store——只存，不 boot。
- store 可以先于任何 platform 存在：`HmrHost` 可以不带打包 bundle，`install(parts)` 像一次推送那样提交一个版本——platform 与 CLI 两份 bundle、按 blob 名给的 web 表与 asset 集、摘要与被持久化的代；在什么都没装进来之前要求 boot，会以 `HMR_NO_GENERATION` 具名失败，而不是一个找不到文件的错。store 里没有任何东西运行，直到下一个程序启动——那个程序就是这次安装刚提交的服务端。
- 版本以流的方式过去：一条 WebSocket 承载 platform 与 CLI 两份 bundle、web dist 与 assets，按 1 MB 的原始二进制块发送，节奏由 socket 自己的缓冲决定，没有逐文件的请求与逐文件的确认。先一次 probe 回答 store 已经有什么，所以一次重装几乎不传东西；part 之间没有逐个确认，commit 就是屏障——有 part 没落地，commit 就失败。blob 在到达时即按内容寻址，所以同一个原生模块或插件文件再推一次不写任何东西。
- `Sys.forward` 让这条流可及：宿主上那个端口本来就是调用方的。`installOverSys` 是「带 `fs` 与 `exec` 的世界」上的那串动作——把 bootstrap 铺进数据根、用那里已有的 Node 起它、转发它宣告的端口、经它推送版本、停掉它、再启动装好的服务端；服务端的首次启动恢复的正是刚提交的那个版本。机器不是这样的世界：它只带 `forward`（服务端就在那台机器上装、在那台机器上跑，本侧经它的 API 抵达），所以机器的安装是它自己安装器的事，forward 承载的是之后所有同它说话的东西。
- 这个顺序就是要点：服务端跑起来的时候，web dist、内置插件与 node-pty 已经作为 assets 到了，并解到了数据根。首次启动不再要求程序旁边先装好 node-pty 或插件库——terminal 不再是「服务端起不来就因为它没装」的那个包。

## 测试

- core 钉住契约：fail-closed 错误、一个能力都不带／只带一个／全带的世界、以及子路径只发形状与错误工厂。
- server 驱动真东西：宿主的文件回环与拷贝、精确 argv 的执行与两条流／退出码／kill／程序不存在、loopback 的 listen/connect 与 close/abort 契约；以及 `runServer` 对着一个 stub 服务端程序（树拷贝、端口宣告、陈旧宣告、先死的入口、经 stub CLI 装插件、以及它的拒绝）。
