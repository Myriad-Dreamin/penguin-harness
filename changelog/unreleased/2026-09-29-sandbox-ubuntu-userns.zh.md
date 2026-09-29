# Linux 沙盒在 Ubuntu 23.10 及以后有了成文的一步

- **Date:** 2026-09-29
- **Type:** fix
- **Scope:** `plugins`, `docs`
- **PR:** [Myriad-Dreamin/penguin-harness#102](https://github.com/Myriad-Dreamin/penguin-harness/pull/102)

[English](2026-09-29-sandbox-ubuntu-userns.md)

默认的 Ubuntu 24.04 上 `kernel.apparmor_restrict_unprivileged_userns` 为 `1`：只有 AppArmor profile 允许的程序才能创建 user namespace。桌面 `.deb` 会为应用装上这样一份 profile，应用启动的 bubblewrap 继承它。安装脚本、npm 安装、Release 压缩包和 Docker 镜像都做不到这一步，于是 `@penguinharness/sandbox-bwrap` 在这些安装上过不了启动检查，而文档只写了 Debian 的开关。

- CLI 快速开始新增 **Ubuntu 上的沙盒** 一节。它给出只需做一次的 root 步骤：为后端自带的 bubblewrap 装一份 profile，按插件仓里的路径匹配，后端升级后依然有效。它也写明了两种替代做法：为属于 root 的 bubblewrap 装 profile，或对所有程序调低这个开关。
- Docker 快速开始的沙盒一节为主机补上同样的一步：加载一份允许 user namespace 的 profile，启动容器时把 `apparmor=` 设为它，代替 `apparmor=unconfined`。那里同样可以改用这个开关。
- 后端建不起基础配置时，沙盒卡片上的原因现在在 Debian 的开关旁写出 Ubuntu 的开关，并指向新的一节。
- 后端的 README 写明了 Ubuntu 上的要求。
