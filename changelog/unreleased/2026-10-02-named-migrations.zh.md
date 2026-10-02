# 数据库迁移改为具名，并记入台账

- **Date:** 2026-10-02
- **Type:** refactor
- **Scope:** `server`
- **PR:** [#187](https://github.com/Myriad-Dreamin/penguin-harness/pull/187)

[English](2026-10-02-named-migrations.md)

服务端 `web.db` 的迁移不再编号。每条迁移以名字为身份，新增的 `schema_migrations` 表按名字记录一个数据库已执行过哪些迁移。runtime 启动时和推送的平台启动时，台账中没有的迁移按声明顺序逐条应用，每条与它的台账行在同一事务中提交。构建忽略自己没有声明的名字，因此不同 PR 线各自新增的迁移不再争抢编号。存量数据根在首次打开时被收编，见[向后兼容](2026-10-02-backward-compatibility-named-migrations.zh.md)。

## 细节

- 每条迁移都可重复执行。`company-mode-org-caches` 在 `company-mode-channels` 已替换两张聊天表之后不再重建它们；其余迁移原本就有守卫。
- 每条迁移要么是扩张（只增不减），要么是收缩（删除已无平台使用的结构）。热推送只应用扩张，收缩留到 runtime 下次重启时执行，因此热推送永不因迁移被拒，也永不删除数据。目前唯一的收缩迁移是 `drop-goal-state`。
- 回退按迁移实际应用顺序的倒序、按名字逐条执行。
- `packages/server/src/db/migrations.ts` 拆分为 `db/migrations/`：执行器、有序列表、每条迁移一个文件。
