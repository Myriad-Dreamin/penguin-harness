# 01 Empty start

## Covers

A new organization's proposals and roadmaps start empty in a fresh `company.db`; both plugins
answer once company mode is on, and 404 while it is off.

## Setup

An admin session on `$S`. No organization named `$O` yet.

## Steps

1. If company mode is off (`GET $S/api/admin/settings` → `companyMode: false`), call
   `GET $ORG/proposals`. If it is on and another user relies on it, skip this step.
2. Turn company mode on (`PUT $S/api/admin/settings { companyMode: true }`). Create `$O`
   (`POST $S/api/projects/$P/organizations`) on a model without a credential and pause it at
   once (see the README on employees acting on their own). Hire `qa_a` and `qa_b` without a
   model (`POST $ORG/employees`, `agentId` if the Agents exist, else `newAgent`).
3. Install `@prismshadow/penguin-plugin-company-proposals` and
   `@prismshadow/penguin-plugin-company-roadmaps` on the Project (Plugins page or the Project's
   `plugins` list); reload the plugins.
4. `GET $ORG/proposals`, `GET $ORG/roadmaps`, `GET $ORG/actions/runs`, `GET $ORG/proposals/graph`.
5. List the organization's files: on the server's disk `<root>/$P/organizations/$O/`, or
   `GET $ORG/mirror` when there is no shell on the server.
6. `GET $ORG/actions/contributions` and `GET $ORG/actions?subject=organization`.

## Expect

1. 404 `company_mode_off`.
2. The organization is created and paused; the CEO's init run opens no desk.
4. Each answers 200 with an empty list (the graph: no nodes, or a `no delivery repository`
   error — not a 5xx).
5. `company.db` (plus its `-wal`/`-shm`) exists; no `proposals.jsonl` or `roadmaps.jsonl` is
   created.
6. Contributions list the built-in `proposal.*`, `roadmap.*`, `workflow.*` and
   `target.register`, plus each plugin's `subjects` contribution; on `organization`,
   `proposal.create`, `roadmap.open` and `target.register` are listed as allowed.

## Evidence

Status codes of steps 1 and 4; the organization's model and status after step 2; the file listing of step 5; the contribution keys of step 6.
