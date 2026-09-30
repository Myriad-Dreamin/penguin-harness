# Claude Code 控制台的「Open」能进到运行里，干活中的运行不再显示为等待输入

- **Date:** 2026-09-30
- **Type:** fix
- **Scope:** `plugins`, `web`

[English](2026-09-30-claude-code-open-and-idle.md)

组织运行在另一台机器上时，Claude Code 控制台的 **Open** 现在会落到该运行的终端。链接里带上那台机器（`/chat/<session>?machine=<id>`），对话路由在页面查询这个 Session 之前先把它记下。此前查询发往浏览器所在的服务器，查不到，于是退回最近一条个人对话，公司模式也随之退出。任何指向应用尚未列出的 Session 的链接都可以用同样的 `?machine=`；应用从自己的列表里得知的机器仍然优先。

现在，Claude Code 底栏显示 `esc to interrupt` 时，运行也被判为在干活（此前只看最后几行里有没有 spinner 行）。spinner 下面两行的提示（Tip）曾把它挤出这几行，于是明明在干活的运行显示 **Waiting for input**，空闲计时也从那一刻开始；到了空闲上限（默认 30 分钟）就会在干活途中被关掉。
