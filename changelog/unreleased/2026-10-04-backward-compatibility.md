# Backward compatibility in this batch

- **Date:** 2026-10-04
- **Type:** process
- **Scope:** `web`

[中文版](2026-10-04-backward-compatibility.zh.md)

What this batch does about data already in a browser, and when the handling can be dropped. The [load-speed entry](2026-10-04-load-speed-fixes.md) describes the change itself.

## Per-machine Session rows from earlier releases are removed, not migrated

Earlier releases kept each machine's last Session rows in `localStorage` under `penguin.machineSessions.<projectId>:<machineId>`, unversioned and shared by every user of the browser. The list cache now holds them with this server's rows, per user and versioned. The old entries are not read: they are removed whenever a Session list is written, so they do not outlive a logout. The only effect is that a machine still out of reach right after the upgrade shows no remembered rows until it has answered once.

Nothing is required of the user. The removal (`dropLegacyMachineRows` in `packages/web/src/lib/list-cache.ts`, marked `TODO(list-cache-legacy)`) can be deleted once the release after the one that ships the list cache is out.
