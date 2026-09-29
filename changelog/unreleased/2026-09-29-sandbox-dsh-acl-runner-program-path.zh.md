# Windows 上的 sandbox-dsh 启动 PATH 指向的 shell，而不是工作区里的同名 exe

- **Date:** 2026-09-29
- **Type:** fix
- **Scope:** `plugins`
- **PR:** [Myriad-Dreamin/penguin-harness#106](https://github.com/Myriad-Dreamin/penguin-harness/pull/106)

[English](2026-09-29-sandbox-dsh-acl-runner-program-path.md)

在 Windows 上，DSH 后端的 ACL runner 以裸名启动受约束命令的程序；此时 Windows 会先查 runner 自身所在目录、它的当前目录（即会话工作目录，在工作区之内）与 System32，最后才查 `PATH`。

- 对不带目录的程序名（如 `pwsh`、`powershell`），该后端现在把 Harness 的 `PATH` 指向的那个文件交给 runner：工作区里的同名 `.exe` 不会再顶替它被启动，System32 里的同名程序也不会再抢在 `PATH` 之前。
- 没有任何绝对 `PATH` 条目含有的名称，在交给 runner 之前就被拒绝，错误里写明该名称；带目录的程序原样传递。
- runner 自己的启动错误现在写出的是交给它的绝对路径。
- Linux 与 macOS 不变。
