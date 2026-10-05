# 一条链接按 id 打开 Claude Code 会话，以员工身份续开

- **Date:** 2026-10-04
- **Type:** feat
- **Scope:** `plugins`, `web`

[English](2026-10-04-claude-code-open-by-session.md)

`GET /api/claude-code/open/<claudeSessionId>?org=<orgId>&agent=<agentId>` 让组织所在 Project 的成员从一条链接打开某个 Claude Code 会话。这条会话已由某个队列运行持有时，链接直接进入那条运行的 Session（`/chat/<sessionId>`，组织在另一台机器上时带 `?machine=`）。否则 claude-code 队列为它排一条续开的运行：`claude --resume <claudeSessionId>`，不带首个提示，工作目录取会话记录里的目录，Session 归指名的员工。运行启动后链接进入它的 Session；排队等名额时落到 Claude Code 控制台并标出这一条。组织 id 在多个 Project 中出现时，用 `project=` 指明。

同一条 Claude Code 会话绝不会有两个进程。会话已被队列之外的程序持有（`~/.claude/sessions` 里有它的条目且进程存活）时，链接不再起第二个进程，而是答一个页面，写明那个进程、终端与 tmux 窗格。会话 id 不存在、记录不可读或工作目录已不存在时，答 404 与原因。

续开的运行空闲时不被回收：空闲上限跳过它们，名额照常占用。控制台显示续开运行的 Claude Code 会话 id，它的 **Open** 走同一条链接，所以已结束的续开运行可以再次续开。

roadmap 的会话也能从 roadmap 打开。`GET /api/claude-code/open?org=<orgId>&roadmap=<n>` 在组织目录的 `claude-sessions.json`（`{ "roadmaps": { "<n>": { "sessionId": "…", "agentId": "…" } } }`）里查 roadmap `<n>`，再像按 id 的链接一样，以该条目指名的员工身份打开那条会话。文件里没有这个 roadmap 时答 404 与原因；文件不合这个形状时视为没有映射。插件只读这个文件，由创建会话的一方写入。Web 应用里，讨论室旁的 roadmap 栏在文件有这个 roadmap 时于标题旁显示 **进入会话**，数据来自新增的 `GET /api/projects/<p>/organizations/<o>/claude-code/sessions`。未安装 claude-code 插件时不显示该按钮。

在 Web 应用内，会话在弹窗里打开，页面停在原处。**进入会话** 与频道消息里指向这两条路由的链接，都会弹出与设置页同一套外壳的窗口。窗口里是这条会话的终端，与聊天页为 Claude Code Session 绘制的是同一个视图。运行排队等名额时，窗口显示排队位置，启动后自动接上。会话被队列之外的程序持有时，窗口写明它所在的进程、终端与 tmux 窗格。关闭窗口不会结束运行。弹窗读取链接新增的 JSON 形式：带 `Accept: application/json` 时，路由答 `{ "state": "running" | "queued" | "elsewhere", … }`，不再跳转。从应用之外打开链接，或按住修饰键点击时，仍像原来一样跳到整页。
