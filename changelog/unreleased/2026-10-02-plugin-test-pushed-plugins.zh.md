# 插件测试 harness 按热推送的方式带入插件目录

- **Date:** 2026-10-02
- **Type:** feature
- **Scope:** `plugin-test`

[English](2026-10-02-plugin-test-pushed-plugins.md)

`startHarness` 不再以入口文件的绝对路径列出插件目录——服务器已不再加载路径。它把目录打包进临时数据根的推送资产（`hmr/plugin-test-assets/plugins`，由 `hmr/harness.json` 指明），并以 tarball 的 npm integrity 写进索引；Project 按包名列出该插件，服务器像对待任何随推送到达的插件一样把它入仓、解压并加载。`stagePushedPlugins` 也被导出，供需要自行放置插件的测试使用。
