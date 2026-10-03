# 遥测采集点

性能面板列出的每个采集点（PRFC-0008）：一条样本量的是什么，以及记录它的那一行代码。样本只记形状——耗时、大小、计数、状态——从不记内容。耗时单位为毫秒。

每一节开头是一句概述，面板上采集点名称旁的「?」显示的就是这一句。「记录于」一行由 `pnpm gen:probe-docs` 保持最新，链接打开的是与本页相同的 commit。

## 启动与热更新

每代 App 记一次：进程启动、热推送之后、插件变化重新组装 App 时。遥测打开之前就跑过的采集点会先留着，在这一代创建时一并记下。

### boot.migrate

平台启动时把数据库 schema 升到最新所用的时间。

推送来的平台自带迁移，这是应用它们的耗时；留给运行时下次重启的迁移不计在内。

记录于 [`packages/server/src/hmr/platform.ts:405`](../hmr/platform.ts#L405) <!-- probe-site -->

### plugin.load

启动时加载某一个插件的某一步所用的时间。

`attrs.step` 是哪一步，`attrs.plugin` 是哪个插件；这一步失败、插件被留在这一代之外时 `status` 为 `error`。

记录于 [`packages/server/src/hmr/platform.ts:505`](../hmr/platform.ts#L505) <!-- probe-site -->

### boot.plugins

启动时加载全部已装插件的总时间。

记录于 [`packages/server/src/hmr/platform.ts:511`](../hmr/platform.ts#L511) <!-- probe-site -->

### boot.module

创建服务端模块树中某一个模块所用的时间。

`attrs.module` 是模块名。这里慢的，是构造或启动时就做了实事、拖住 App 开始服务的模块。

记录于 [`packages/server/src/hmr/platform.ts:564`](../hmr/platform.ts#L564) <!-- probe-site -->

### boot.modules

创建整棵模块树的总时间。

记录于 [`packages/server/src/hmr/platform.ts:568`](../hmr/platform.ts#L568) <!-- probe-site -->

### boot.create

从开始创建 App 到它能提供服务的时间。

涵盖上面几步（迁移、插件、模块）以及它们之间的一切。

记录于 [`packages/server/src/hmr/platform.ts:684`](../hmr/platform.ts#L684) <!-- probe-site -->

### boot.quiet

启动之后，后台两项清扫（会话接管与 machine 重连）都结束所用的时间。

这期间 App 已在服务；这一项长，意味着 machine 或被接管的会话回来得晚。

记录于 [`packages/server/src/platform.ts:248`](../platform.ts#L248) <!-- probe-site -->

### hmr.park

热更新时上一代把自己的状态停放好所用的时间。

以上一代为键（`keys.generation`）。由新一代记录，因为旧一代的缓冲随它一起没了。

记录于 [`packages/server/src/hmr/platform.ts:690`](../hmr/platform.ts#L690) <!-- probe-site -->

### hmr.dispose

热更新后上一代关闭所用的时间。

与 `hmr.park` 一样以上一代为键。

记录于 [`packages/server/src/hmr/platform.ts:693`](../hmr/platform.ts#L693) <!-- probe-site -->

### hmr.generation

创建了一代 App：原因，以及这个包在本进程里被创建过几次。

`n` 是代号。`attrs.cause` 为 `boot`、`push` 或 `reassemble`；`attrs.creates` 是同一个包的创建次数，同一个构建被再次创建（重复推送）时 `attrs.repeat` 为 true。

记录于 [`packages/server/src/hmr/platform.ts:697`](../hmr/platform.ts#L697) <!-- probe-site -->

### process.memory

一代刚创建完时进程的内存。

`bytes` 是常驻内存（RSS），`attrs` 带 `heapUsed`、`heapTotal`、`external`。要跨代对比着看：每推一次只涨不落，说明有某一代没有被释放。

记录于 [`packages/server/src/hmr/platform.ts:703`](../hmr/platform.ts#L703) <!-- probe-site -->

### hmr.admit

新一代回答热推送准入检查所用的时间。

这是推送来的一代在被换上之前收到的第一个请求；`attrs.code` 是它回答的状态码。

记录于 [`packages/server/src/hmr/platform.ts:728`](../hmr/platform.ts#L728) <!-- probe-site -->

## 请求

### http.request

回答一个 HTTP 请求所用的时间，从请求到达到响应交回。

`attrs.method` 与 `attrs.route` 以路由模式（从不是路径）标明路由，`attrs.code` 是状态码，`bytes` 是响应大小——流式响应边写边计——`attrs.requestBytes` 是请求体大小。`keys.request` 是页面发来的请求 id，页面上慢的一次操作可以据此对上它的请求。

记录于 [`packages/server/src/http/app.ts:240`](../http/app.ts#L240) <!-- probe-site -->

## 会话与轮次

### sessions.list.sql

会话列表为一个 Agent 查数据库所用的时间。

`n` 是返回的行数。会话列表一次读取分三段，另两段是 `sessions.list.reconcile` 与 `sessions.list.rows`。

记录于 [`packages/server/src/services/session-service.ts:447`](../services/session-service.ts#L447) <!-- probe-site -->

### sessions.list.reconcile

列会话时有行尚未分类，为此对账 Trace 索引所用的时间。

`n` 是找到的 Trace 数。稳定状态下这一步会跳过；经常出现，说明不断有未分类的行进来。

记录于 [`packages/server/src/services/session-service.ts:467`](../services/session-service.ts#L467) <!-- probe-site -->

### sessions.list.rows

把会话列表的行转成页面收到的条目所用的时间。

`n` 是分类或转换过的行数。

记录于 [`packages/server/src/services/session-service.ts:491`](../services/session-service.ts#L491) <!-- probe-site -->

### trace.reconcile

一次把 Trace 索引与磁盘上的文件对齐所用的时间。

跑这一遍的调用 `status` 为 `led`，等着一遍已在进行中的调用为 `shared`；强制的一遍 `attrs.force` 为 true。

记录于 [`packages/server/src/services/trace-index.ts:179`](../services/trace-index.ts#L179) <!-- probe-site -->

### trace.read

从磁盘读一个 Trace 文件所用的时间。

`n` 是读出的消息数，`bytes` 是文件大小。`attrs.shard` 是文件路径的哈希，从不是路径本身。在 `session.messages` 的读取里，它带上那个会话的键。

记录于 [`packages/server/src/services/trace-service.ts:378`](../services/trace-service.ts#L378) <!-- probe-site -->

### session.messages

为页面读一个会话的一窗消息所用的时间。

`n` 是返回的消息数，`bytes` 是从磁盘读的量；`attrs.shards` 是读了几个 Trace 文件，`attrs.kind` 是请求的是哪一窗，`attrs.reachesEnd` 是否读到了最新一条。

记录于 [`packages/server/src/services/trace-service.ts:675`](../services/trace-service.ts#L675) <!-- probe-site -->

### task.accept

接收发给会话的一条消息所用的时间，从调用到答复。

`attrs.lockMs` 是其中等会话锁的部分，`attrs.queued` 是这条消息是否排在一轮正在运行的之后。

记录于 [`packages/server/src/runtime/session-manager.ts:1184`](../runtime/session-manager.ts#L1184) <!-- probe-site -->

### session.ensure

让一个会话准备好运行所用的时间：已在内存、载入或重新载入。

`attrs.outcome` 为 `hit`（已在内存）、`load` 或 `reload`（建于 Agent 上次改配置之前）；载入时另有 `attrs.loadMs`，`n` 是会话恢复时带的历史消息数。

记录于 [`packages/server/src/runtime/session-manager.ts:2094`](../runtime/session-manager.ts#L2094) <!-- probe-site -->

### turn.badge

发布一次会话状态变化所用的时间：列表角标与任务状态一起。

`attrs.state` 是发布的状态。

记录于 [`packages/server/src/runtime/session-manager.ts:2598`](../runtime/session-manager.ts#L2598) <!-- probe-site -->

### turn.run

服务端上一轮的全程，以及其中模型所占的部分。

`n` 是流式消息数。`attrs.modelMs` 是各次模型请求从开始到结束的时间，`attrs.requests` 是请求次数，`attrs.serverMs` 是各 `turn.*` 段之和。剩下的是引擎自己的时间：工具调用、MCP、写 Trace。

记录于 [`packages/server/src/telemetry/turn.ts:95`](turn.ts#L95) <!-- probe-site -->

### turn.*

一轮里模型之外、逐条消息做的某一段工作，在整轮上求和。

各段为 `turn.tail`（实时尾部）、`turn.fanout`（发布到页面的通道）、`turn.errors`（流错误观察）与 `turn.usage`（用量记录）。`n` 是这一段处理的消息数，`attrs.maxMs` 是最慢的一条。

记录于 [`packages/server/src/telemetry/turn.ts:102`](turn.ts#L102) <!-- probe-site -->

## Machine

### machine.connect

一次连接 machine 的全程，以及它如何结束。

`keys.machine` 是 machine 的地址。`attrs.trigger` 说明是什么发起的，失败的一次给出 `attrs.failedStep`。

记录于 [`packages/server/src/machines/connect-stages.ts:69`](../machines/connect-stages.ts#L69) <!-- probe-site -->

### machine.connect.stage

连接 machine 时某一阶段所用的时间。

`attrs.stage` 为 `probe`、`start-server`、`reprobe`、`hold`、`sync-models`、`sync-plugins` 之一；不需要的阶段不跑，也不记。

记录于 [`packages/server/src/machines/connect-stages.ts:54`](../machines/connect-stages.ts#L54) <!-- probe-site -->

### machine.ssh.open

建起到 machine 的 ssh 会话、直到第一条命令返回所用的时间。

会话在任何命令回答之前就断了时 `status` 为 `error`；`attrs.held` 是它是否为常驻的那条连接。

记录于 [`packages/server/src/machines/transport/ssh-session.ts:470`](../machines/transport/ssh-session.ts#L470) <!-- probe-site -->

### machine.ssh.command

经 ssh 会话在 machine 上跑一条命令所用的时间。

`attrs.waitMs` 是排在其他命令之后等待的时间，`attrs.code` 是退出码，`attrs.inputBytes` 是经 stdin 送的量，`attrs.opening` 是这条命令是否顺带建起了会话。machine 一直没回答时 `status` 为 `timeout`。命令文本从不记录。

记录于 [`packages/server/src/machines/transport/ssh-session.ts:492`](../machines/transport/ssh-session.ts#L492) <!-- probe-site -->

### machine.socks.handshake

一小段时间窗内到某台 machine 的 SOCKS 握手，合成一条样本：最慢的一次、次数与失败数。

`durMs` 是最慢的一次，`n` 是次数，`attrs.errors` 是失败数，`attrs.totalMs` 是总和，`attrs.windowMs` 是时间窗长度。

记录于 [`packages/server/src/machines/transport/timings.ts:106`](../machines/transport/timings.ts#L106) <!-- probe-site -->

## 浏览器

由页面在遥测打开期间记录并发到服务端的缓冲。这些链接打开的是页面构建所用的 commit；只热推前端之后，它可能与服务端的不同。

### web.boot

从导航到页面首次内容绘制所用的时间。

`attrs` 分段给出：`ttfbMs`（首字节）、`domInteractiveMs`、`dclMs`、`loadMs`、`entryMs`（入口脚本下载完成）、`entryToPaintMs`（从入口脚本到绘制：解析、运行、挂载）、`entryCached`，以及绘制之前的长任务。标签页在后台而推迟的绘制，会把隐藏的时间也计进去。

记录于 [`packages/web/src/lib/perf/collector.ts:251`](../../../web/src/lib/perf/collector.ts#L251) <!-- probe-site -->

### web.longtasks

自上次上报以来主线程上超过 50 ms 的任务，合成一条样本。

`n` 是个数，`durMs` 是总阻塞时间（每个任务超过 50 ms 的部分），`attrs.maxMs` 是最长的一个。

记录于 [`packages/web/src/lib/perf/collector.ts:333`](../../../web/src/lib/perf/collector.ts#L333) <!-- probe-site -->

### web.session.open

在页面里打开一个会话所用的时间，从请求到它的历史首次渲染。

`attrs.fetchMs` 是历史请求本身；`commits`、`reduceMs`、`waitMs`、`renderMs` 及其最大值把其余时间分给处理帧、等待下一次渲染与渲染。

记录于 [`packages/web/src/lib/perf/collector.ts:168`](../../../web/src/lib/perf/collector.ts#L168) <!-- probe-site -->

### web.turn

页面展示一轮所用的时间，从第一帧流式消息到最后一次渲染。

`n` 是帧数；各属性的分法与 `web.session.open` 相同。

记录于 [`packages/web/src/lib/perf/collector.ts:184`](../../../web/src/lib/perf/collector.ts#L184) <!-- probe-site -->

### web.sessions.fanout

侧栏会话列表跨所有 Agent 与来源刷新一次所用的时间。

`n` 是发出的请求数；`attrs.slowestMs` 是其中最慢的一个，另有 Agent 数、来源数与没有回答的来源数。

记录于 [`packages/web/src/state/sessions.tsx:630`](../../../web/src/state/sessions.tsx#L630) <!-- probe-site -->

### web.socket.connect

从打开页面的 API socket 到收到服务端第一条消息所用的时间。

`attrs.openMs` 只是握手、到 socket 打开为止的时间。

记录于 [`packages/web/src/api/socket.ts:441`](../../../web/src/api/socket.ts#L441) <!-- probe-site -->
