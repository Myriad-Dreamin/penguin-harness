# The organization pages stop re-reading the whole ticket board on every request

- **Date:** 2026-10-29
- **Type:** fix
- **Scope:** `server`

[中文版](2026-10-29-org-endpoint-request-cost.zh.md)

The organization read endpoints reuse three pieces of work they used to repeat on every request, so a board of several hundred tickets, a month of usage records and the desk cache are paid for once rather than once per endpoint. The responses are unchanged.

## Ticket board

Listing the board still stats every ticket file, and reuses the document it read and parsed while the file's modification time and size are both unchanged. A file is stat-ed again after the read, and a file that changed in between is left out of the cache rather than cached under a version it no longer has. Entries for files the listing no longer sees are dropped at the end of the pass, so the cache never outgrows the tree it mirrors.

## Spend

A period's spend is kept per project, organization and period for three seconds: the chart, the board, the organization list and the finance page used to scan the same usage records once each. The calls that pass an empty ticket set keep computing every time, because an answer built without tickets differs from one built with them.

## Session cache

The desk and ticket session caches are written inside one savepoint instead of one transaction per row: the segment is a single commit, and a caller that already holds a transaction nests it — an inner rollback undoes only the segment, and the caller's transaction still decides the commit.
