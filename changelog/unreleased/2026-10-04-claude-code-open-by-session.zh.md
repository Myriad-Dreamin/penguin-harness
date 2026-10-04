# 一条链接按 id 打开 Claude Code 会话，以员工身份续开

- **Date:** 2026-10-04
- **Type:** feat
- **Scope:** `plugins`

[English](2026-10-04-claude-code-open-by-session.md)

`GET /api/claude-code/open/<claudeSessionId>?org=<orgId>&agent=<agentId>` 让组织所在 Project 的成员从一条链接打开某个 Claude Code 会话。这条会话已由某个队列运行持有时，链接直接进入那条运行的 Session（`/chat/<sessionId>`，组织在另一台机器上时带 `?machine=`）。否则 claude-code 队列为它排一条续开的运行：`claude --resume <claudeSessionId>`，不带首个提示，工作目录取会话记录里的目录，Session 归指名的员工。运行启动后链接进入它的 Session；排队等名额时落到 Claude Code 控制台并标出这一条。组织 id 在多个 Project 中出现时，用 `project=` 指明。

同一条 Claude Code 会话绝不会有两个进程。会话已被队列之外的程序持有（`~/.claude/sessions` 里有它的条目且进程存活）时，链接不再起第二个进程，而是答一个页面，写明那个进程、终端与 tmux 窗格。会话 id 不存在、记录不可读或工作目录已不存在时，答 404 与原因。

续开的运行空闲时不被回收：空闲上限跳过它们，名额照常占用。控制台显示续开运行的 Claude Code 会话 id，它的 **Open** 走同一条链接，所以已结束的续开运行可以再次续开。
