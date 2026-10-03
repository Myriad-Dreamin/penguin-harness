# 员工排队使用 Claude Code，公司模式新增控制台供人进入

- **Date:** 2026-09-29
- **Type:** feat
- **Scope:** `plugins`, `web`, `cli`
- **PR:** [Myriad-Dreamin/penguin-harness#99](https://github.com/Myriad-Dreamin/penguin-harness/pull/99)

[English](2026-09-29-claude-code-queue-and-console.md)

claude-code 插件新增队列。组织里的员工用 `penguin org claude-code run "<提示词>"`（或 `POST /api/projects/<p>/organizations/<o>/claude-code/runs`）申请一次 Claude Code 运行，服务器有空闲名额时它会自动启动。每次运行是该员工 Agent 的一个 Claude Code 会话，在员工的工作区里运行，提示词作为第一个参数。之后用 `ls`、`show <id> [--screen N]` 和 `release <id>` 跟进。

一次运行会一直占着名额，直到它的程序退出、有人释放它，或空闲时间达到设定值；到那时程序被关闭，队列里的下一个自动启动。「Claude Code 队列」设置组管两项：名额数（服务器上所有组织共用，默认 4），以及空闲多少分钟后关闭（默认 30，填 0 表示不关闭）。

公司模式新增 **Claude Code** 页面，插件装上时出现在侧栏。页面显示已用名额和组织的每一次运行：排队中（及排在第几位）、工作中、等待输入，或已结束及结束原因。点**进入**会打开这次运行的会话，里面正是员工启动的那个 Claude Code；点**释放**则结束这次运行。
