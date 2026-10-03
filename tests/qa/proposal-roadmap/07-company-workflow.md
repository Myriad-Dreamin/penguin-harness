# 07 A company workflow changes the process

## Covers

An organization's company workflow (`workflows/<id>/` in the organization) is written through
`workflow.*` Actions and takes effect by contributing: a guard replaces the default (and may
build on it), a hook runs before or after an Action; removing or rolling back the workflow
restores the default. A broken workflow keeps the previous instance. Two company contributions
on one key are reported, not guessed. Only the writing organization is affected.

## Setup

Task 02. A second organization `$O2` (empty is enough). A local copy of the fixture workflow
from `plugins/company-proposals/test-fixtures/` with: a guard on `proposal.approve` refusing
`agent:qa_a` with code `qa_does_not_approve`, and an after hook on `proposal.*` with an
observable effect (for example a line in the run's result).

## Steps

1. `GET $ORG/workflows`; `GET $ORG/actions?subject=proposal:<n>` from `qa_a`'s session.
2. `penguin org workflow put qa <dir>` (or `workflow.write` runs per file); read the run.
3. From `qa_a`'s session approve a ready proposal; from `qa_b`'s session approve it.
4. `GET $ORG/actions?subject=proposal:<n>` from `qa_a`'s session; the same in `$O2`.
5. Run any `proposal.*` Action; read the run.
6. Write a type error into the workflow; read the run; repeat step 3's refusal.
7. `workflow.rollback` to the version of step 2.
8. Put a second workflow `qa2` whose guard also answers `proposal.approve`; run
   `proposal.approve`; `GET $ORG/actions/check`; run it with
   `POST $ORG/actions/by-id/<contribution>/runs`.
9. A workflow that contributes a guard on `workflow.write`.
10. `workflow.remove` both; approve from `qa_a`'s session again.
11. `GET $ORG/actions/runs?subject=workflow:qa`.

## Expect

2. `succeeded`; the result reports a successful load.
3. `qa_a`: 403 `qa_does_not_approve`, recorded `refused`; `qa_b`: succeeds.
4. `proposal.approve` shows `allowed: false` for `qa_a` in `$O`; in `$O2` it is allowed.
5. The hook's effect is visible on the run.
6. The write succeeds but its result names the load problem; the previous instance still
   refuses `qa_a`.
7. The rolled-back version loads.
8. 409 `action_ambiguous` naming each `penguin org action exec <contribution>`; `check` lists
   the key with both; the by-id run uses the named one.
9. Its load fails or the guard is ignored, with the reason: `workflow.*` cannot be replaced.
10. The default guard is back: `qa_a` may approve.
11. Every write, rollback and removal is a run with its actor and load outcome.

## Evidence

Error bodies of steps 3, 6 and 8; the runs of step 11.
