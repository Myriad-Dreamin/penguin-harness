# Web App 渲染器：一张注册表，从清单生成

- **Date:** 2026-09-29
- **Type:** refactor
- **Scope:** `web`

[English](2026-09-29-web-renderer-registry.md)

Web App 原先有四张手工维护的「能画什么」的表：页面清单（`src/module.json`）、路由的页面渲染器表、贡献页面在公司模式下的导航行表，以及会话表面渲染器表。现在它们合成 `src/module.json` 里的一节 `renderers`，代码由 `scripts/gen-renderers.ts` 从中生成。

## 细节

- `renderers.pages` 与 `renderers.surfaces` 写明每个渲染器的名字及导出它的模块入口；`renderers.orgNav` 按顺序列出公司模式的导航行及其标签与类型。`pnpm --filter @prismshadow/penguin-web gen:renderers` 生成 `src/lib/renderers.gen.ts`（名字与导航行，不含任何导入）与 `src/renderers.gen.ts`（组件，只由路由读取）。
- 生成器拒绝以下清单：页面指向未声明的渲染器、渲染器所在模块没有入口、名字重复，或 builtin 导航行指向不存在的页面渲染器。新增测试在任一生成文件过期时失败。
- 页面的 `builtin` 渲染器不在本构建中时（例如较新插件贡献的页面），现在该页面仍按其 URL 打开，并显示一条写明渲染器名的提示；此前它会从路由中被丢弃，地址无声地跳回 `/chat`。
- 会话表面渲染器现在经 `ContributionsProvider` 传给聊天页，不再由聊天模块内部的一张表提供。
