# 沙盒后端的旧包名会让测试失败

- **Date:** 2026-09-29
- **Type:** process
- **Scope:** `server`, `plugins`
- **PR:** [Myriad-Dreamin/penguin-harness#93](https://github.com/Myriad-Dreamin/penguin-harness/pull/93)

[English](2026-09-29-sandbox-retired-names-guard.md)

沙盒后端已从 `@prismshadow/penguin-plugin-sandbox-<x>` 改名为 `@penguinharness/sandbox-<x>`，且不留别名（见[沙盒插件改名](2026-09-29-sandbox-plugin-names.zh.md)），所以旧名一旦回来，指向的就是一个已不存在的包。最常见的回来途径，是改名之前写好、改名之后才重基的改动。服务端的插件注册表测试套件现在会读取每一个被跟踪的文件，遇到仍在使用旧名的行即失败，并打印文件与行号。

- 只有两类行可以保留旧名：已发布版本的 changelog 目录中的文字（该目录已冻结），以及同一行也写出了新包名的行（即迁移说明）。
- 旧名不会被读取，也不会被接受；这项检查只防止旧名回来。
