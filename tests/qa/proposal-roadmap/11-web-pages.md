# 11 Web pages

## Covers

The Web surfaces: buttons follow the guard, the Activity view, a proposal's and a roadmap
column's own runs, the PR graph's deploy menu.

## Setup

Tasks 02–08. Log into `$S` in a browser as the admin; open company mode → `$O`.

## Steps

1. Proposals page: open a ready proposal; note the action buttons.
2. Open a `rejected` proposal; note the buttons.
3. Open the Activity view; filter by an employee and by a key if offered.
4. Open a proposal's own runs; open a roadmap's right column and its runs.
5. With the organization paused, approve a proposal from the page; check the Activity shows it at the top without a reload.
6. PR graph: open a node's menu.
7. Run `deploy.qa` from the menu; watch the output.
8. With the company workflow's refusing guard in place (task 07), open the proposal as a user it
   refuses — or as the admin with a guard that refuses the admin — and note the button.

## Expect

1. Approve (labelled "Approve and request merge") / Request changes / Reject offered.
2. No write button the guard would refuse.
3. Runs newest first, refusals included, each naming who and via what.
4. Only that subject's runs.
5. The run appears.
6. The bound `deploy.*` Actions are listed; no "associate a deploy script" entry.
7. Output streams; the final state shows.
8. The button is disabled or hidden, with the reason if shown.

## Evidence

Screenshots of steps 1, 3, 6 and 7.
