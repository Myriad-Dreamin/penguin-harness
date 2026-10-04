# 08 Deploy as an Action

## Covers

`deploy.<id>` Actions contributed by a company workflow: absent until contributed, the subject's commit
is resolved and checked against `expectedHead`, the process output is kept, one run at a time,
the graph refreshes after.

## Setup

Task 03: a proposal whose impl head is on GitHub (the deploy's commit is resolved from GitHub,
so a subject without a GitHub head cannot deploy). A company workflow `qa-deploy` contributing
`deploy.qa`, whose process only prints the `PENGUIN_DEPLOY_*` variables and exits 0 (never a
real deployment target), `deploy.qa_fail`, which exits 1, and `deploy.qa_slow` (sleeps 120 s,
for tasks 12–13). One run at a time is not automatic: each action's guard refuses with 409
`deploy_busy` while a run is going, as the fixture's `deploy.fixture` does. Not yet written to
the organization.

## Steps

1. `POST $ORG/actions/deploy.qa/runs { subject: "proposal:<n>" }`.
2. `penguin org workflow put qa-deploy <dir>`; `GET $ORG/actions?subject=proposal:<n>`.
3. Run it with an `expectedHead` that is not the head.
4. Run it with the real head; poll `GET $ORG/actions/runs/<id>?from=0` until it ends.
5. Start it twice at once.
6. Run `deploy.qa_fail`.
7. `penguin org proposal deploy <n> --to qa` (needs a `penguin` CLI logged in to `$S` or an
   employee session; otherwise `blocked`).
8. `GET $ORG/proposals/graph` after step 4.

## Expect

1. 404 `action_not_found`.
2. `deploy.qa` listed and allowed.
3. Refused `head_moved`, recorded.
4. 202 while running, then `succeeded`; the output shows `PENGUIN_DEPLOY_HEAD` equal to the
   head and `PENGUIN_DEPLOY_PROPOSAL=<n>`.
5. The second is refused 409 `deploy_busy` while the first runs.
6. `failed`, with the output tail kept.
7. The CLI follows the output and exits 0.
8. The graph was refreshed after the run (its snapshot time is later than the run's end).

Any step: a forge 5xx during a run (for example 502 `branch_unreadable` on a transient GitHub
error) is recorded `failed` and answered with its own status, not 500.

## Evidence

Run ids and states; the output excerpt of step 4.
