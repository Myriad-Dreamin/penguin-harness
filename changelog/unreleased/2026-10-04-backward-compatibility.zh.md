# 本批次的向后兼容

- **Date:** 2026-10-04
- **Type:** process
- **Scope:** `web`

[English](2026-10-04-backward-compatibility.md)

本批次如何处理浏览器中已有的数据，以及何时可以去掉这些处理。改动本身见[加载速度条目](2026-10-04-load-speed-fixes.zh.md)。

## 早期版本按机器保存的 Session 行被移除，不迁移

早期版本把每台机器上次的 Session 行保存在 `localStorage` 的 `penguin.machineSessions.<projectId>:<machineId>` 下，无版本号，且由同一浏览器的所有用户共用。现在列表缓存把它们与本服务器的行一起保存，按用户区分并带版本号。旧条目不再读取：每次写入 Session 列表时将其移除，因此不会在登出后残留。唯一的影响是：升级后仍无法连接的机器，在它回答一次之前不显示记住的行。

用户无需任何操作。这段移除逻辑（`packages/web/src/lib/list-cache.ts` 中的 `dropLegacyMachineRows`，标记为 `TODO(list-cache-legacy)`）可在列表缓存所在版本之后的下一个版本发布后删除。
