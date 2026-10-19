# Design RFCs (PRFC)

This directory is PenguinHarness's design RFC surface: one design decision per document, named `PRFC-NNNN-slug.md`. Every document here was migrated from the design repository [penguin-harness-design](https://github.com/Prism-Shadow/penguin-harness-design), where the same files live under its `rfcs/` directory. The migration collected both states: the documents landed on that repository's default branch, and the drafts still carried by its open or draft design pull requests.

[中文版](README.zh.md)

## Conventions for this surface

1. **An RFC and the implementation changes it corresponds to are never submitted in the same pull request**; the two merge independently.
2. **Once an RFC has landed, it should not be modified frequently.**
3. **When a modification is truly needed, the version number (rev) must be raised** — e.g. `v2.0.0`.
4. **Every modification lists that revision's change items at the end of the document, under a `## Changes` section** — `### v2.0.0` with `- Added…` / `- Removed…` / `- Updated…` entries.

## Shape of a document

Each document keeps its original title line (`# PRFC-NNNN …`), metadata bullets and body; section names follow the Rust RFC template, and the body is written in Chinese. The migration added exactly two things to each file:

- a **provenance marker** right under the title: the source file in the design repository, its state there — landed on the default branch, or the open or draft design PR that carries the draft — and the current rev;
- a **`## Changes` section at the end**, recording every revision the document goes through, starting at `v1.0.0`.

The body carries the design repository's text unchanged. Where an open design PR revises a landed document without being merged (PRFC-0003's local-plugin linking revision in [design PR #279](https://github.com/Prism-Shadow/penguin-harness-design/pull/279)), the body keeps the landed text and the marker records the pending revision; when the design repository settles it, the update arrives here as a rev bump with its change items. Where a draft evolved through a stack of open PRs (PRFC-0016), the migrated body is the stack's current tip, and the marker names the chain.

## Numbering

Numbers and filenames carry over from the design repository unchanged. Two drafts share the number `0005` — [PRFC-0005-mechanisms-not-implementations.md](PRFC-0005-mechanisms-not-implementations.md) and [PRFC-0005-plugin-versioning.md](PRFC-0005-plugin-versioning.md) — two independent design lines that each took the number before either landed; they are distinct documents, not revisions of one another. The number `0013` is retired: the HMR RFC was drafted as PRFC-0013 and renumbered to PRFC-0002 before it landed.

## Index

| Document | Title | State in the design repository |
| --- | --- | --- |
| [PRFC-0001-module.md](PRFC-0001-module.md) | Module | landed on `main` |
| [PRFC-0002-hmr.md](PRFC-0002-hmr.md) | HMR v1：层只有 `/api/hmr`，只依赖 http 与 log | landed on `main` |
| [PRFC-0003-plugin.md](PRFC-0003-plugin.md) | 插件 | landed on `main`; [design PR #279](https://github.com/Prism-Shadow/penguin-harness-design/pull/279) carries an unmerged revision |
| [PRFC-0004-plugin-scope.md](PRFC-0004-plugin-scope.md) | 插件的作用域 | draft in [design PR #104](https://github.com/Prism-Shadow/penguin-harness-design/pull/104) |
| [PRFC-0005-mechanisms-not-implementations.md](PRFC-0005-mechanisms-not-implementations.md) | 依赖机制，而不是实现 | draft on branch `docs/mechanisms` ([design PR #109](https://github.com/Prism-Shadow/penguin-harness-design/pull/109) closed as draft); stack base of open [design PR #113](https://github.com/Prism-Shadow/penguin-harness-design/pull/113) and [design PR #123](https://github.com/Prism-Shadow/penguin-harness-design/pull/123) |
| [PRFC-0005-plugin-versioning.md](PRFC-0005-plugin-versioning.md) | 插件的版本 | draft in [design PR #106](https://github.com/Prism-Shadow/penguin-harness-design/pull/106) |
| [PRFC-0006-plugin-distribution.md](PRFC-0006-plugin-distribution.md) | 插件的分发与安装 | draft in [design PR #244](https://github.com/Prism-Shadow/penguin-harness-design/pull/244) |
| [PRFC-0007-schema-migrations.md](PRFC-0007-schema-migrations.md) | schema 的改动是有序、带戳、只跑一次的迁移 | landed on `main` |
| [PRFC-0008-telemetry.md](PRFC-0008-telemetry.md) | 遥测：让系统自己说出时间花在哪、消息停在哪 | draft in [design PR #113](https://github.com/Prism-Shadow/penguin-harness-design/pull/113) |
| [PRFC-0009-sandbox.md](PRFC-0009-sandbox.md) | Sandbox：策略 fail closed，后端是插件 | landed on `main` |
| [PRFC-0010-ui-modules.md](PRFC-0010-ui-modules.md) | UI Modules：Web App 是一棵模块树，页面与全局 UI 都是贡献 | open [design PR #317](https://github.com/Prism-Shadow/penguin-harness-design/pull/317) |
| [PRFC-0011-single-socket.md](PRFC-0011-single-socket.md) | 单一套接字 | draft in [design PR #126](https://github.com/Prism-Shadow/penguin-harness-design/pull/126) |
| [PRFC-0012-chat-bots.md](PRFC-0012-chat-bots.md) | 从聊天里启动智能体的机器人是插件的事 | draft in [design PR #127](https://github.com/Prism-Shadow/penguin-harness-design/pull/127) |
| [PRFC-0014-workflow.md](PRFC-0014-workflow.md) | Workflow：Agent 目录里的一棵模块树 | landed on `main` |
| [PRFC-0015-agent-state.md](PRFC-0015-agent-state.md) | Agent 状态组件：热更新时移交状态，运行中的 Task 不被打断 | landed on `main` |
| [PRFC-0016-company-proposals.md](PRFC-0016-company-proposals.md) | 公司模式的提案：人读一份，Agent 同时做一份 | draft in [design PR #210](https://github.com/Prism-Shadow/penguin-harness-design/pull/210); [design PR #233](https://github.com/Prism-Shadow/penguin-harness-design/pull/233)'s revision folded in |
| [PRFC-0017-session-surface.md](PRFC-0017-session-surface.md) | 会话表面 | draft in [design PR #123](https://github.com/Prism-Shadow/penguin-harness-design/pull/123) |
| [PRFC-0018-amsp.md](PRFC-0018-amsp.md) | AMSP 与 Agent API | landed on `main` |
| [PRFC-0019-rsi-toolkits.md](PRFC-0019-rsi-toolkits.md) | RSI 工具包 | landed on `main` |
| [PRFC-0020-agent-workbench.md](PRFC-0020-agent-workbench.md) | Agent Workbench：应用命名、插件分发与产品支持 | landed on `main` |
