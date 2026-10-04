# Web App 启动时不再加载 arktype

- **Date:** 2026-10-04
- **Type:** feature
- **Scope:** `core`, `web`

[English](2026-10-04-kernel-runtime-entry.md)

内核新增一个不依赖 arktype 的运行时入口，Web App 的启动路径改走这个入口：它启动的模块树在构建时校验，不再在每次加载页面时校验。

## 细节

- `@prismshadow/penguin-core/kernel/runtime` 启动已校验的模块树，其导入图中没有 arktype：包含模块装饰器、`Interface`、`moduleDefOf` 与 `bootVerified`。`bootVerified` 按接口身份接线（或接到 `from` 指名的提供方），且每次启动仍拒绝重复的模块名与贡献 id、投向无人声明的插槽的贡献、未知接口以及没有提供方的依赖。只能靠结构匹配接线的树、或带 schema 的停放上下文，会被拒绝，而不会未经检查就启动。完整的 `@prismshadow/penguin-core/kernel` 入口保持原有接口与行为，服务端照旧经由它启动。
- Web App 经运行时入口启动内置模块树。`packages/web` 的 `pnpm build` 在 `vite build` 之前对生成的 `ifaces.json` 运行内核的完整检查，有任何问题即失败；arktype 进入页面首屏加载的 chunk 时构建失败；lint 规则禁止在 `packages/web/src` 下以值形式导入完整内核。
- 插件表有了供 Web App 调用的校验器（`lib/verify-plugins.ts`）：每张表用完整内核对照应用自身的表检查，完整内核作为懒加载 chunk，仅在有表未曾校验过时才加载。通过的结论按表内容哈希存入 `localStorage`（`penguin.verifiedPlugins`），以应用接口表与内核检查版本组成的身份为键；保留当前身份及此前最近使用的三个。安全模式不使用它。
- 停放的模块上下文的 schema 每个进程只解析一次，不再每次启动都解析。
