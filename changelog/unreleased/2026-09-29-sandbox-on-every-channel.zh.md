# 沙盒后端到达每一条渠道，插件以 npm 的 integrity 标识

- **Date:** 2026-09-29
- **Type:** feature
- **Scope:** `server`, `core`, `cli`, `docker`, `release`, `docs`
- **PR:** [Myriad-Dreamin/penguin-harness#98](https://github.com/Myriad-Dreamin/penguin-harness/pull/98)

[English](2026-09-29-sandbox-on-every-channel.md)

每一份构建都带一个随包插件目录：它构建的每个插件的 tarball，加一份 `index.json` 列出每个插件及其 integrity。插件自己打包自己：tarball 就是它的全部，它声明的依赖不被安装。`@penguinharness/sandbox-dsh` 声明了运行时依赖，在它把依赖打进自己的包之前加载不起来。CLI 安装包、桌面端与热推送早已如此；Docker 镜像与源码检出现在也一样。npm 上的 CLI 包只带索引，在某个 Project 要求时从 npm registry 现取插件。插件的 integrity 就是 npm 自己的 `dist.integrity`。随包下发的插件仍要等某个 Project 要求时才加载，沙盒模式默认仍是关闭。

## 渠道

- **Docker 镜像。** 镜像用发布流程同一个 `build-plugins` 步骤构建随包插件目录，放在 `/opt/penguin/lib/plugins`，与 CLI 安装包带的是同一份，同时服务 amd64 与 arm64 两种镜像。服务器在入口的真实路径旁找它：镜像经 `/usr/local/bin/penguin` 链接启动程序，此前服务器会去 `/usr/local/plugins` 找。Docker 快速上手新增一节「在容器里运行沙盒」：列出让 bubblewrap 能创建 user namespace 的选项（`seccomp`、`apparmor`、`systempaths` 设为 `unconfined`），以及不给这些选项时的情形（沙盒卡片写明后端未在使用及原因，关闭以外的每个模式都拒绝 Agent 的每条命令）。
- **npm 全局安装。** `@prismshadow/penguin-cli` 带 `plugins/index.json`：本次构建索引中随之发布到 npm 的那些插件的行。索引列出、目录里却没带的插件不算随包下发；启用它时从 registry 现取进插件仓。
- **源码检出。** `pnpm build` 把随包插件目录写到 `packages/cli/plugins/`，dev 预构建为开发服务器写到 `packages/server/plugins/`：源码检出跑的是它刚构建的插件，走 CLI 安装包那一路。Project 的插件表不再以绝对路径加载插件；这样的条目报为「不是包名」。

## Integrity

- 插件的 integrity 就是 npm 的 `dist.integrity`：`sha512-` 加上发布的 tarball 字节的 sha512 的 base64。
- `build-plugins` 对每个插件打包一次，以那份 tarball 的 integrity 写进索引；发布流程上传的就是这几份 tarball。
- 插件仓存每个插件的 tarball（`package.tgz`，另有 `manifest.toml` 与 `.stored`）。无论是构建携带的还是现取的，每份 tarball 入仓前都算一遍 hash，与索引那一行不符就拒绝；入仓之后也随时可以再核对。
- 从 registry 现取就是 `npm pack <名>@<版本>`：取回 registry 上那个确切版本的 tarball，什么都不安装。
- 插件仓条目的目录名取 integrity 的前 16 个 base64 字符，`+`、`/` 写作 `-`、`_`，目录名读起来就是 integrity 的开头。Project 插件表里的钉住、`POST …/plugins/installed` 的 `integrity` 与每条索引条目都用这一写法。

## 激活

- `<数据根>/plugins/current` 就是选择本身：一个 JSON 文件，为进程要加载的每个插件写明它的仓条目（名字、版本、integrity），以及上一次的选择。选中的条目按仓的路径规则解压到 `plugins/` 下（`plugins/packages/…/<版本>/<key>/{.unpacked, package/}`），插件从那里导入。`plugins/` 下的代目录及其链接、完成标记一并去掉；更早布局的指针读作没有选择，下一次激活时被替换。
- 每一步只有一个提交点，都是一次改名：仓条目在 `.staging/` 里连同 `.stored` 写完整，再改名到位，解压目录同样带 `.unpacked` 改名到位；选择写进 `current.tmp`，在它指名的条目都入仓并解压之后改名覆盖 `current`；回收的条目先改名进 `.staging/` 再删除，崩溃不会留下带 `.stored` 却缺文件的条目。启动失败时写回上一次的选择。

## 从 registry 现取

- 现取运行 `PATH` 上的 `npm`。只有现取所用的 npm 会在 `PATH` 末尾追加运行服务器的 Node 运行时所在目录：CLI 安装包的运行时含 npm，没有 npm 的机器也能现取，用户自己的 npm 仍然优先。服务器自身的 `PATH`（Agent 命令继承的那个）不变。在 Windows 上经 shell 启动 `npm.cmd`（Node 启动 `.cmd` 文件必须经 shell），每个参数都按 cmd.exe 的规则加引号；会被 cmd.exe 展开或拆开的参数直接拒绝。
- 现取失败时报告 npm 的首条 `npm error` 行，跳过它之前的警告与之后的日志路径提示，并能处理 Windows 换行。
- Skill 与 Server API 两页不再说「不会下载任何东西」：构建未发布的包会从 registry 现取；`PUT` 加入本机没有的名称时返回 `plugin_not_installed`。
