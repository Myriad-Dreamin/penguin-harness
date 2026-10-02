# Database migrations are named and recorded in a ledger

- **Date:** 2026-10-02
- **Type:** refactor
- **Scope:** `server`
- **PR:** [#187](https://github.com/Myriad-Dreamin/penguin-harness/pull/187)

[中文版](2026-10-02-named-migrations.zh.md)

The server's `web.db` migrations lost their numbers. Each migration is identified by its name, and a new `schema_migrations` table records, by name, which migrations a database has run. When the runtime starts and when a pushed platform boots, every migration the ledger lacks is applied in declaration order, each in one transaction with its ledger row. A build ignores names it does not declare, so migrations added on different lines no longer collide on a number. Existing data roots are adopted on first open; see [backward compatibility](2026-10-02-backward-compatibility-named-migrations.md).

## Details

- Every migration is re-runnable. `company-mode-org-caches` no longer recreates the two chat tables once `company-mode-channels` has replaced them; the other migrations were already guarded.
- A restart-only migration declares how to recognise its work as done, so a hot push onto a root where that work happened long ago is not refused.
- Rolling back reverts migrations in the reverse of the order they were applied, by name.
- `packages/server/src/db/migrations.ts` was split into `db/migrations/`: the runner, the ordered list, and one file per migration.
