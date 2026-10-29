# Trace reads stop re-running the reconcile diff on every request

- **Date:** 2026-10-29
- **Type:** fix
- **Scope:** `server`

[中文版](2026-10-29-trace-reconcile-scan-cost.zh.md)

The shared Trace reconcile used to run inside every read: the Agents list, the Session list's hydration pass, the single-session GET, the messages read and the Traces listing all waited on an mtime-gated diff before answering. Under continuous writes the freshness window marks the tree unstable, so every read re-ran the slow path and one session's request was slowed by every other session's activity. Reads now take one gate sample — stats only on a quiet tree — diff only when the tree actually moved, and ask for one debounced background reconcile on top. The answers are unchanged.

## What a read costs now

A quiet tree costs directory stats per read and nothing else: no `readdir`, no head-reads, no diff. A tree that moved between reads costs one diff for the change, not one per read, and a background pass scheduled by the reads keeps the index in step after a burst of writes has gone quiet. A read that cannot find the session it names still forces one full diff and retries before answering, so a stale index costs one extra scan and never a missing file. The mtime gate and its freshness window are untouched — the speed is not bought by weakening the correctness guard.

## Compatibility

A session that registers after a restart is adopted the same way: the boot sweep forces its one walk instead of waiting for a background pass. A shard the index names but the disk has lost reads as empty, and the next reconcile pass drops the row. The single-session GET looks up the latest trace path regardless of the `hasTrace` snapshot, so a trace written between background passes is still found.
