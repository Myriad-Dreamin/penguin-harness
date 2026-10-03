# 08 Deploy as an Action

## Covers

`deploy.<id>` Actions contributed by a company module: unbound is absent, the subject's commit
is resolved and checked against `expectedHead`, the process output is kept, one run at a time,
the graph refreshes after.

## Setup

Task 03 (a proposal with an impl head). A company module contributing `deploy.qa` whose process
only prints its environment and exits 0 (never a real deployment target); a second,
`deploy.qa_fail`, that exits 1. Installed on the server, not yet bound.

## Steps

1. `POST $ORG/actions/deploy.qa/runs { subject: "proposal:<n>" }`.
2. Bind `deploy.qa`; `GET $ORG/actions?subject=proposal:<n>`.
3. Run it with an `expectedHead` that is not the head.
4. Run it with the real head; poll `GET $ORG/actions/runs/<id>?from=0` until it ends.
5. Start it twice at once.
6. Bind and run `deploy.qa_fail`.
7. `penguin org proposal deploy <n> --to qa`.
8. `GET $ORG/proposals/graph` after step 4.

## Expect

1. 404: not bound.
2. `deploy.qa` listed and allowed.
3. Refused `head_moved`, recorded.
4. 202 while running, then `succeeded`; the output shows `PENGUIN_DEPLOY_HEAD` equal to the
   head and `PENGUIN_DEPLOY_PROPOSAL=<n>`.
5. The second is refused while the first runs.
6. `failed`, with the output tail kept.
7. The CLI follows the output and exits 0.
8. The graph was refreshed after the run (its snapshot time is later than the run's end).

## Evidence

Run ids and states; the output excerpt of step 4.
