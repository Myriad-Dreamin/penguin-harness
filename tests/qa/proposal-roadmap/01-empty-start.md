# 01 Empty start

## Covers

A new organization's proposals and roadmaps start empty in a fresh `company.db`; both plugins
answer once company mode is on, and 404 while it is off.

## Setup

An admin session on `$S`. No organization named `$O` yet.

## Steps

1. With company mode off (`GET $S/api/admin/settings` → `companyMode: false`), call
   `GET $ORG/proposals`.
2. Turn company mode on (`PATCH $S/api/admin/settings { companyMode: true }`), create `$O`
   (`POST $S/api/projects/$P/organizations`), hire two employees `qa_a` and `qa_b`.
3. Install `@prismshadow/penguin-plugin-company-proposals` and
   `@prismshadow/penguin-plugin-company-roadmaps` on the Project (Plugins page or the Project's
   `plugins` list); reload the plugins.
4. `GET $ORG/proposals`, `GET $ORG/roadmaps`, `GET $ORG/actions/runs`, `GET $ORG/proposals/graph`.
5. On the server's disk, list `<root>/$P/organizations/$O/`.
6. `GET $ORG/actions/contributions` and `GET $ORG/actions?subject=organization`.

## Expect

1. 404.
4. Each answers 200 with an empty list (the graph: no nodes, or a `no delivery repository`
   state — not a 5xx).
5. `company.db` (plus its `-wal`/`-shm`) exists; no `proposals.jsonl` or `roadmaps.jsonl` is
   created.
6. Contributions list the built-in `proposal.*`, `roadmap.*`, `target.register` and
   `action.bind`; on `organization`, `roadmap.open` and `action.bind` are listed as allowed.

## Evidence

Status codes of steps 1 and 4; the file listing of step 5; the contribution keys of step 6.
