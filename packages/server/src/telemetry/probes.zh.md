# 遥测采集点

性能面板列出的每个采集点能告诉你什么（PRFC-0008）。每一节开头就是这个采集点回答的问题。样本只记数字——时长、大小、次数——以及标明测的是什么的名称（路由模式、模块名、状态），从不记内容。时长单位为毫秒；`memoryCost` 与其他大小单位为字节。

面板里名称旁的「?」显示这一节的第一句。「记录于」一行由 `pnpm gen:probe-docs` 保持最新，链接打开的是与本页相同的 commit。

## 启动与热更新

每代 App 记一次：进程启动、热推送之后、插件变化重新组装 App 时。遥测打开之前就跑过的会先留着，在这一代创建时一并记下。

### boot.migrate

启动慢是不是数据库的缘故？把 schema 升到最新所用的时间。

记录于 [`packages/server/src/hmr/platform.ts:369`](../hmr/platform.ts#L369) <!-- probe-site -->

### plugin.load

启动慢是不是某一个插件拖的？导入并检查这个插件所用的时间。

`attrs.plugin` 是哪个插件；失败、被留在这一代之外时 `status` 为 `error`。沿用上一代的插件不再加载，也不记。

记录于 [`packages/server/src/hmr/platform.ts:469`](../hmr/platform.ts#L469) <!-- probe-site -->

### boot.plugins

加载全部插件花了多久？所有已装插件一起的时间。

记录于 [`packages/server/src/hmr/platform.ts:475`](../hmr/platform.ts#L475) <!-- probe-site -->

### boot.module

启动慢是不是服务端某一部分拖的？创建这个模块所用的时间。

`attrs.module` 是模块名。

记录于 [`packages/server/src/hmr/platform.ts:528`](../hmr/platform.ts#L528) <!-- probe-site -->

### boot.modules

创建服务端各部分花了多久？所有模块一起的时间。

记录于 [`packages/server/src/hmr/platform.ts:532`](../hmr/platform.ts#L532) <!-- probe-site -->

### boot.create

App 过了多久才能提供服务？从开始创建到就绪的时间。

涵盖上面几步以及它们之间的一切。

记录于 [`packages/server/src/telemetry/boot.ts:84`](boot.ts#L84) <!-- probe-site -->

### boot.quiet

启动之后多久一切都恢复了？到会话接管完、machine 重连好的时间。

这期间 App 已在服务；这一项长，说明 machine 或会话回来得晚。

记录于 [`packages/server/src/platform.ts:246`](../platform.ts#L246) <!-- probe-site -->

### hmr.park

热更新交接慢吗？上一代把状态停放好所用的时间。

以上一代为键，由新一代记下。

记录于 [`packages/server/src/telemetry/boot.ts:89`](boot.ts#L89) <!-- probe-site -->

### hmr.dispose

热更新放手慢吗？上一代关闭所用的时间。

与 `hmr.park` 一样以上一代为键。

记录于 [`packages/server/src/telemetry/boot.ts:91`](boot.ts#L91) <!-- probe-site -->

### hmr.generation

这一代为什么启动？每次创建 App 一条。

`attrs.cause` 为 `boot`、`push`（热推送）或 `reassemble`（插件变化）。

记录于 [`packages/server/src/telemetry/boot.ts:94`](boot.ts#L94) <!-- probe-site -->

### process.memory

服务端用了多少内存？整个进程的总量，`attrs.memoryCost`，单位字节。

每次创建之后、以及每次读遥测时记一条。要跨代对比着看：每次热推都只涨不落，说明有旧的一代没被释放。

记录于 [`packages/server/src/telemetry/boot.ts:95`](boot.ts#L95) <!-- probe-site -->

### hmr.admit

热推送被接受得慢吗？新一代回答准入检查所用的时间。

`attrs.code` 是它回答的状态码。

记录于 [`packages/server/src/telemetry/boot.ts:119`](boot.ts#L119) <!-- probe-site -->

## 请求

### http.request

哪些 API 调用慢？回答一个 HTTP 请求所用的时间。

`attrs.method` 与 `attrs.route` 以路由模式（从不是路径）标明是哪个调用，`attrs.code` 是状态码，`attrs.requestBytes` 是请求大小，`bytes` 是响应自己声明的大小。`keys.request` 把它和它运行期间记下的样本连起来。

记录于 [`packages/server/src/telemetry/http.ts:29`](http.ts#L29) <!-- probe-site -->

## 会话

### sessions.list.sql

侧栏的会话列表慢在数据库吗？它那次查询的时间。

`attrs.rows` 是返回了多少个会话。

记录于 [`packages/server/src/services/session-service.ts:499`](../services/session-service.ts#L499) <!-- probe-site -->

### sessions.list.reconcile

会话列表慢是不是 Trace 索引在追？那次追赶的时间。

`attrs.traces` 是找到了多少个 Trace。平时会跳过；经常出现，说明不断有索引没见过的会话进来。

记录于 [`packages/server/src/services/session-service.ts:521`](../services/session-service.ts#L521) <!-- probe-site -->

### trace.reconcile

把 Trace 索引对齐要多久？每一遍记一条，不论有几个调用在等它。

记录于 [`packages/server/src/services/trace-index.ts:166`](../services/trace-index.ts#L166) <!-- probe-site -->

### trace.read

打开会话慢在读盘吗？读一个 Trace 文件所用的时间。

`attrs.messages` 是文件里有多少条消息。在 `session.messages` 的读取里，它带上那个会话。

记录于 [`packages/server/src/services/trace-service.ts:347`](../services/trace-service.ts#L347) <!-- probe-site -->

### session.messages

打开会话慢在服务端吗？读出页面要的那些消息所用的时间。

`attrs.kind` 是要的哪一部分，`attrs.messages` 是返回了多少条。它读过的 Trace 文件就是同一会话下的 `trace.read`。

记录于 [`packages/server/src/services/trace-service.ts:588`](../services/trace-service.ts#L588) <!-- probe-site -->

### task.accept

发消息之后接收得慢吗？从发出到服务端答复的时间。

含等会话锁的时间；`attrs.queued` 是这条消息是否排在一轮正在运行的之后。

记录于 [`packages/server/src/runtime/session-manager.ts:1194`](../runtime/session-manager.ts#L1194) <!-- probe-site -->

### session.load

会话开始干活慢吗？载入一个不在内存里的会话（含历史）所用的时间。

`attrs.messages` 是载入时带了多少条历史。已在内存里的会话不记。

记录于 [`packages/server/src/runtime/session-manager.ts:2114`](../runtime/session-manager.ts#L2114) <!-- probe-site -->

### session.memory

哪个会话最占内存？每个已加载的会话一条，`attrs.memoryCost`，单位字节。

它把会话占着的加在一起：载入的历史、为重连的页面留着的近期事件、还在流式输出的回复。每次读遥测时记一条。

记录于 [`packages/server/src/runtime/session-manager.ts:964`](../runtime/session-manager.ts#L964) <!-- probe-site -->

## Machine

### machine.connect

连接 machine 慢、还是失败了？一次连接的全程。

`keys.machine` 是哪台 machine；失败的一次给出 `attrs.failedStep`。

记录于 [`packages/server/src/machines/connect-stages.ts:65`](../machines/connect-stages.ts#L65) <!-- probe-site -->

### machine.connect.stage

连接 machine 慢在哪一步？某一步所用的时间。

`attrs.stage` 为 `probe`、`start-server`、`reprobe`、`hold`、`sync-models`、`sync-plugins` 之一。

记录于 [`packages/server/src/machines/connect-stages.ts:50`](../machines/connect-stages.ts#L50) <!-- probe-site -->

### machine.ssh.command

machine 回答命令慢吗？一条命令从发起到答复的时间。

`attrs.code` 是退出码；machine 一直没回答时 `status` 为 `timeout`。命令文本从不记录。

记录于 [`packages/server/src/machines/transport/timings.ts:84`](../machines/transport/timings.ts#L84) <!-- probe-site -->

## 浏览器

由页面在遥测打开期间记录并发到服务端。这些链接打开的是页面构建所用的 commit；只热推前端之后，它可能与服务端的不同。

### web.boot

页面出来得慢吗？到首次绘出内容的时间。

`attrs.ttfbMs` 是到服务端第一个字节到达的时间；若它占了大头，等待发生在服务端答复之前。在后台打开的页面会把隐藏的时间也计进去。

记录于 [`packages/web/src/lib/perf/collector.ts:160`](../../../web/src/lib/perf/collector.ts#L160) <!-- probe-site -->

### web.longtasks

页面会卡住吗？自上次上报以来主线程上超过 50 ms 的阻塞。

`durMs` 是阻塞的总时间，`attrs.count` 是次数，`attrs.maxMs` 是最长的一次。

记录于 [`packages/web/src/lib/perf/collector.ts:228`](../../../web/src/lib/perf/collector.ts#L228) <!-- probe-site -->

### web.session.open

页面里打开会话慢吗？从点击到历史出现在屏幕上的时间。

`attrs.fetchMs` 是其中等服务端的时间。

记录于 [`packages/web/src/lib/perf/collector.ts:103`](../../../web/src/lib/perf/collector.ts#L103) <!-- probe-site -->

### web.turn

回复在页面里出来得慢吗？从第一段流式内容到最后一段出现在屏幕上的时间。

记录于 [`packages/web/src/lib/perf/collector.ts:134`](../../../web/src/lib/perf/collector.ts#L134) <!-- probe-site -->

### web.sessions.fanout

侧栏的会话列表填得慢吗？刷新一次的时间。

`attrs.slowestMs` 是其中最慢的一个请求。

记录于 [`packages/web/src/state/sessions.tsx:743`](../../../web/src/state/sessions.tsx#L743) <!-- probe-site -->

### web.socket.connect

页面连上服务端慢吗？从打开连接到收到服务端第一条消息的时间。

记录于 [`packages/web/src/api/socket.ts:450`](../../../web/src/api/socket.ts#L450) <!-- probe-site -->
