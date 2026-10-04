# 07 A company workflow changes the process

## Covers

An organization's company workflow (`workflows/<id>/` in the organization) is written through
`workflow.*` Actions and takes effect by contributing: a guard replaces the default (and may
build on it), a hook runs before or after an Action; removing or rolling back the workflow
restores the default. A broken workflow keeps the previous instance. Two company contributions
on one key are reported, not guessed. Only the writing organization is affected.

## Setup

Task 02. A second organization `$O2` (empty is enough). A local copy of the fixture workflow
`plugins/company-proposals/test-fixtures/company-workflow/`, changed to: a guard on
`proposal.approve` refusing `agent:qa_a` (and `user:admin` when the admin stands in for
`qa_a`, see the README) with code `qa_does_not_approve`; an after hook on `proposal.*` that
throws; an action `qa.ping` answering `{ from: "qa" }`. A hook returns nothing, so its only
effect visible on a run is the thrown error in `run.hookErrors` (`host.log` goes to the server
log). Steps from `qa_b`'s session need a second person account or are `blocked`.

## Steps

1. `GET $ORG/workflows`; `GET $ORG/actions?subject=proposal:<n>` from `qa_a`'s session.
2. `penguin org workflow put qa <dir>` (or `workflow.write` runs per file); read the run.
3. From `qa_a`'s session approve a ready proposal; from `qa_b`'s session approve it.
4. `GET $ORG/actions?subject=proposal:<n>` from `qa_a`'s session; the same in `$O2`.
5. Run any `proposal.*` Action; read the run.
6. Write a type error into the workflow; read the run; repeat step 3's refusal.
7. `workflow.rollback` to the version of step 2.
8. Put a second workflow `qa2` whose guard also answers `proposal.approve` (passing through to
   the default) and whose `qa.ping` answers `{ from: "qa2" }`. Run `proposal.approve`;
   `GET $ORG/actions/check`; run `POST $ORG/actions/by-id/<contribution>/runs` with each guard
   contribution. Then run `qa.ping`, and by id each `qa.ping` contribution.
9. Write a workflow `qa-lock` that contributes a guard on `workflow.write`; read the run;
   `GET $ORG/workflows/qa-lock`; write `qa-lock` again.
10. `workflow.remove` all three; approve from `qa_a`'s session again.
11. `GET $ORG/actions/runs?subject=workflow:qa`.

## Expect

2. `succeeded`; the result reports a successful load.
3. `qa_a`: 403 `qa_does_not_approve`, recorded `refused`; `qa_b`: succeeds.
4. `proposal.approve` shows `allowed: false` for `qa_a` in `$O`; in `$O2` it is allowed.
5. The run succeeds, with the hook's error in `hookErrors`.
6. The write succeeds but its result names the load problem; the previous instance still
   refuses `qa_a`.
7. The rolled-back version loads.
8. `proposal.approve`: 409 `action_ambiguous` listing both guard contributions, each with its
   `penguin org action exec …` form, not recorded as a run (no `runId`). `check` lists the key
   with both. By id, each guard contribution runs `proposal.approve` judged by that guard
   alone (`qa`'s refuses, `qa2`'s allows). `qa.ping`: the same 409 listing both actions; by
   id, each runs its own action (`{ from: "qa" }` / `{ from: "qa2" }`).
9. It loads with the guard skipped, and the reason (`workflow.*` cannot be replaced or
   hooked) is in the run's result `skipped`, the same as in `GET $ORG/workflows/qa-lock`; the
   guard is not counted among the contributions in force. The second write succeeds.
10. The default guard is back: `qa_a` may approve.
11. Every write, rollback and removal is a run with its actor and load outcome.

## Evidence

Error bodies of steps 3, 6 and 8; the run result and workflow read of step 9; the runs of step 11.
