# A retired sandbox package name fails the tests

- **Date:** 2026-09-29
- **Type:** process
- **Scope:** `server`, `plugins`

[中文版](2026-09-29-sandbox-retired-names-guard.zh.md)

The sandbox backends went from `@prismshadow/penguin-plugin-sandbox-<x>` to `@penguinharness/sandbox-<x>`
with no alias ([sandbox plugin names](2026-09-29-sandbox-plugin-names.md)), so an old name that
comes back names a package that no longer exists. The usual way back is a change written before
the rename and rebased after it. The server's plugin registry suite now reads
every tracked file and fails on each line that still uses an old name, printing its file and line.

- Two kinds of line may keep an old name: text in a released version's changelog folder, which is
  frozen, and a line that also names the new package, which is a migration note.
- Nothing is read or accepted under the old names; this only stops them from coming back.
