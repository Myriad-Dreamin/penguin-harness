# 一条链接按 id 打开 Claude Code 会话，以员工身份续开

- **Date:** 2026-10-04
- **Type:** feat
- **Scope:** `plugins`, `web`, `server`, `core`, `cli`

[English](2026-10-04-claude-code-open-by-session.md)

`GET /api/claude-code/open/<claudeSessionId>?org=<orgId>&agent=<agentId>` 让组织所在 Project 的成员从一条链接打开某个 Claude Code 会话。这条会话已由某个队列运行持有时，链接直接进入那条运行的 Session（`/chat/<sessionId>`，组织在另一台机器上时带 `?machine=`）。否则 claude-code 队列为它排一条续开的运行：`claude --resume <claudeSessionId>`，不带首个提示，工作目录取会话记录里的目录，Session 归指名的员工。运行启动后链接进入它的 Session；排队等名额时落到 Claude Code 控制台并标出这一条。组织 id 在多个 Project 中出现时，用 `project=` 指明。

同一条 Claude Code 会话绝不会有两个进程。会话已被队列之外的程序持有（`~/.claude/sessions` 里有它的条目且进程存活）时，链接不再起第二个进程，而是答一个页面，写明那个进程、终端与 tmux 窗格。会话 id 不存在、记录不可读或工作目录已不存在时，答 404 与原因。

两条路由都可另带 `prompt`。不带时，续开运行是人打开的，空闲时不被回收：空闲上限跳过它，名额照常占用。带上时，运行起的是 `claude --resume <claudeSessionId> <prompt>`，续开的会话立刻以这句话开始一轮；它空闲后与其他运行一样，达到空闲上限即被回收。事件就是这样唤起会话、做完后让出名额的。会话已由某个运行持有时直接接上，`prompt` 不会触发任何事。所有续开都经队列，同时运行多少条只由队列容量决定。控制台显示续开运行的 Claude Code 会话 id，它的 **Open** 走同一条链接，所以已结束的续开运行可以再次续开。

roadmap 的会话也能从 roadmap 打开。`GET /api/claude-code/open?org=<orgId>&roadmap=<n>` 在组织目录的 `claude-sessions.json`（`{ "roadmaps": { "<n>": { "sessionId": "…", "agentId": "…" } } }`）里查 roadmap `<n>`，再像按 id 的链接一样，以该条目指名的员工身份打开那条会话。文件里没有这个 roadmap 时答 404 与原因；文件不合这个形状时视为没有映射。插件只读这个文件，由创建会话的一方写入。Web 应用里，讨论室旁的 roadmap 栏在文件有这个 roadmap 时于标题旁显示 **进入会话**，数据来自新增的 `GET /api/projects/<p>/organizations/<o>/claude-code/sessions`，它答出每个有映射的 roadmap 的编号、Claude Code 会话 id 与员工。未安装 claude-code 插件时不显示该按钮。

在 Web 应用内，会话在弹窗里打开，页面停在原处。**进入会话** 与频道消息里指向这两条路由的链接，都会弹出与设置页同一套外壳的窗口。窗口里是这条会话的终端，与聊天页为 Claude Code Session 绘制的是同一个视图。运行排队等名额时，窗口显示排队位置，启动后自动接上。会话被队列之外的程序持有时，窗口写明它所在的进程、终端与 tmux 窗格。关闭窗口不会结束运行。弹窗读取链接新增的 JSON 形式：带 `Accept: application/json` 时，路由答 `{ "state": "running" | "queued" | "elsewhere", … }`，不再跳转。从应用之外打开链接，或按住修饰键点击时，仍像原来一样跳到整页。

弹窗标题下有一行，说明这条会话与队列的关系：占用一个槽位（运行中，工作中或已空闲多少分钟）、排队中（第几位），或未占用槽位。关闭弹窗后终端仍然保留：最近显示过的会话，数量与队列的槽位数相同（运行列表答出之前为 4），保持挂载但隐藏，字节流不断，再次打开时立即显示。运行已结束的会话随即释放。首次打开也更快：roadmap 页面在 **进入会话** 按钮出现时、以及指针移到按钮上时，只读地查一次是否有运行持有该 roadmap 的会话；有运行在跑时，弹窗不等链接的答复，直接打开那个 Session。弹窗得知 Session 后，Session 与其终端并行读取。

**Claude Code 槽位** 列出本服务器的 Claude Code 槽位由谁占用。任何页面上按 Ctrl+Alt+;（macOS 上为 ⌥⌘;）或从命令面板打开，快捷键可在设置里改。对当前所在的组织，列表给出每个运行中的运行：它续开的会话属于哪个 roadmap、哪名员工、工作中还是空闲（空闲多久）、由谁排入、以什么提示开始；排队中的运行按在服务器队列中的位次列在下面；其他组织占用的槽位只显示个数。**打开** 在会话弹窗里进入这条运行的会话；**释放** 先确认，再结束运行（排队中的则取消），随后列表重新读取。列表打开期间每几秒刷新一次。

`GET …/claude-code/runs?active=1` 不含已结束的运行，槽位列表与 roadmap 页面只读这一种。roadmap 栏改为在上一次读取结束后隔固定时间再读，不再按固定间隔发出，组织所在机器的链路较慢时读取不再层层堆积。

surface 起的程序现在带着所属 Session 的控制环境。surface 打开 Session 时，harness 交给它该 Session 的 Agent 自己执行命令时拿到的那组变量：`PENGUIN_API_URL`、`PENGUIN_API_TOKEN`、`PENGUIN_PROJECT_ID`、`PENGUIN_AGENT_ID`、`PENGUIN_SESSION_ID`，Session 属于某个组织时还有 `PENGUIN_ORG_ID`（即 `SurfaceSessionRef.env`，由派生命令所用的同一个 `SessionEnv.controlEnv` 计算）。Claude Code 把它们放进 pty，于是 `claude` 及其执行的 `penguin` 命令以该 Session 的员工身份行事，而不是借机器上人的登录。Session 没有的控制变量，会从 pty 继承的环境里删去。队列运行以所属组织的名义打开（新增的 `SurfaceOpenOptions.orgId`），其环境里写明该组织。harness 自己已知 Session 所属的组织时（工位或工单会话），以已知的为准。

`penguin org claude-code release --self` 结束本命令所在的运行，即 Session 为 `PENGUIN_SESSION_ID` 的那一条。会话做完手头的事后用它让出名额。没有 `PENGUIN_SESSION_ID`，或没有排队中、运行中的运行属于该 Session 时，命令说明原因并以 1 退出。`release` 接受运行编号或 `--self`，二者择一。

`POST …/claude-code/runs/<id>/input`（请求体 `{ "text": "…", "enter"?: true }`）向运行中的运行的程序输入一行文字，随后按下 Enter（`enter` 为 false 时不按）。能释放该运行的人就能向它输入，因此持服务器 API Token 的调用方也能唤醒一个空闲会话，而终端自带的按键路由不接受这类调用方。文字必须可打印：空文字、超长文字，以及包括换行在内的任何控制字符，均答 400。运行未在运行或其程序已不在时，答 409。

Web 推送之前打开的页面，第一次有懒加载 chunk 加载失败时，会重新加载一次，换上当前构建。这样的页面会请求推送后的 dist 里已经没有的 chunk 名，服务器对这些请求回的是应用页面，于是页面里的终端（包括会话对话框里的）一直打不开。重新加载之后仍然失败的 chunk 不会再触发重新加载：终端显示错误，而不是一直停在连接中。
