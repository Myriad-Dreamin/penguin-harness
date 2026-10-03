# Windows 上的 sandbox-dsh 启动 PATH 指向的 shell，而不是工作区里的同名 exe

- **Date:** 2026-09-29
- **Type:** fix
- **Scope:** `plugins`, `core`, `server`
- **PR:** [Myriad-Dreamin/penguin-harness#106](https://github.com/Myriad-Dreamin/penguin-harness/pull/106)

[English](2026-09-29-sandbox-dsh-acl-runner-program-path.md)

在 Windows 上，DSH 后端的 ACL runner 以裸名启动受约束命令的程序；此时 Windows 会先查 runner 自身所在目录、它的当前目录（即会话工作目录，在工作区之内）与 System32，最后才查 `PATH`。

- 对不带目录的程序名（如 `pwsh`、`powershell`），该后端现在把 `PATH` 指向的那个文件交给 runner：工作区里的同名 `.exe` 不会再顶替它被启动，System32 里的同名程序也不会再抢在 `PATH` 之前。
- 所查的 `PATH` 是程序实际启动时所用环境中的 `PATH`：stdio MCP Server 条目自己的 `env`，或命令的 Agent vault。为此 core 的沙盒契约把启动环境交给后端：`SpawnConfiner` 的选项新增 `env`，`SandboxProvider.confine` 新增可选的第三个参数 `SandboxSpawn`。不传它的运行时仍查 Harness 自身的 `PATH`。
- `PATH` 上的 App Execution Alias（Microsoft Store 安装的 PowerShell 7）也能作为程序被找到，尽管 `stat` 无法跟随它。
- 没有任何绝对 `PATH` 条目含有的名称，在交给 runner 之前就被拒绝，错误里写明该名称；带目录的程序原样传递。
- 裸名在 `PATH` 上找不到 `.exe`、却有同名的 `.cmd` 或 `.bat` 时（`npx`、`uvx` 在 Windows 上就是批处理），拒绝的错误改为点名找到的那个文件，并写明裸名只按 `.exe` 查找、要交出批处理须连扩展名一起写。查找规则本身不变。README 写明：批处理经 `cmd.exe` 运行，其命令行解析不受 runner 引号处理的保护，但仍处在 restricted token 之下。
- runner 自己的启动错误现在写出的是交给它的绝对路径。
- Linux 与 macOS 不变。
