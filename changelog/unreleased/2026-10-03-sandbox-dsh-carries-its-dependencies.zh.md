# sandbox-dsh 自带依赖

- **Date:** 2026-10-03
- **Type:** feature
- **Scope:** `plugins/sandbox-dsh`, `build`
- **PR:** [Myriad-Dreamin/penguin-harness#191](https://github.com/Myriad-Dreamin/penguin-harness/pull/191)

[English](2026-10-03-sandbox-dsh-carries-its-dependencies.md)

`@penguinharness/sandbox-dsh` 现在解压到哪里就能在哪里加载，旁边无需安装任何东西。它原先把 DSH 依赖链声明为运行时依赖，需要随包插件构建与插件仓库把这些依赖（连同 peer 依赖和每个目标平台的 koffi 二进制）收集进它的仓库条目。

- 包以 `dist/node_modules` 的形式自带这条依赖链：`@deepseek-ai/cordis`、`@deepseek-ai/dsh-sandbox-local` 及其依赖，包括每个受支持主机的原生部分——koffi 面向 Linux x64/arm64、macOS x64/arm64 与 Windows x64 的预编译模块，以及面向 Linux x64/arm64 的 Landlock 启动器。由于依赖链静态导入了它的 Windows 运行器，每个平台都会加载 koffi。
- 依赖链没有打进 `dist/index.js`。它在运行时按路径查找 Windows ACL 运行器、koffi 的原生模块和 Landlock 启动器，打包会让这三处全部失效。
- `scripts/vendor-dsh-deps.mjs` 依据 `pnpm-lock.yaml` 构建这棵依赖树：从锁文件读出所带各包的依赖闭包（包括每个目标平台的分平台包），再让 npm 安装完全相同的版本（例如 koffi 3.1.6 及其五个分平台包）。npm 装出的树里只要出现锁文件没有列出的包或版本，或某个 tarball 的 integrity（npm 下载时记录的值）与锁文件为该版本钉住的 `resolution.integrity` 不同，构建即失败。npm 从 registry 安装，因此构建需要能访问 npm registry。包的构建在 tsup 之后运行这个脚本。DSH 相关包移到 `devDependencies`，包不再声明任何运行时依赖；`publishConfig.executableFiles` 为 Landlock 启动器保留可执行位。
- tarball 从约 14 kB（7 个文件）增长到 3.7 MB（375 个文件）。
- 插件仓库不再为它收集任何依赖：它的条目中 `package/` 就是解压后的包，`dist/node_modules` 也在其中。`scripts/build-plugins.mjs` 不再允许随包插件声明任何运行时依赖（`koffi` 与 DSH 相关包原是仅有的例外），声明了就让构建失败，因此不再在随包插件旁安装分平台原生包。它的缓存键还覆盖插件构建所运行的仓库脚本，以及 `vendor-dsh-deps.mjs` 所依据的锁文件条目，DSH 依赖链在锁文件里升级时会重新打包。仓库条目仍会带上包的 peer 依赖，供其他声明了 peer 依赖的包使用。
- live 测试套件运行打包后的插件包：它的 global setup 构建并打包插件，再解压到仓库之外临时目录中的一个 npm prefix，因此 tarball 没有带上的依赖会让套件失败。包没有带上的模块会让套件在任何主机上失败；其他加载失败（依赖链没有任何一级可用的主机）仍然跳过，除非 `PENGUIN_MUST_RUN` 点名 `sandbox-dsh`。
