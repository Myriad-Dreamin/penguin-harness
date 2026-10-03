# 05 Employee parity and the Activity

## Covers

Under the default guards an employee may do what a person may — including approvals — and every
run records who acted and through what.

## Setup

Tasks 02 and 04. A desk session of `qa_b` (open it with `GET $ORG/employees/qa_b/desk`), from
which the CLI runs as `agent:qa_b`.

## Steps

1. From `qa_b`'s session: `penguin org proposal approve <n>` on a ready proposal authored by
   `qa_a`.
2. From `qa_b`'s session: `penguin org action run roadmap.item.approve item:1/y`.
3. From `qa_a`'s session: approve a proposal `qa_a` authored (self-approval).
4. From `qa_b`'s session: `penguin org proposal reject <m> --reason "…"`.
5. `GET $ORG/actions/runs?by=agent:qa_b`; `GET $ORG/actions/runs?subject=proposal:<n>`.
6. `penguin org action runs --key proposal.approve`.

## Expect

1–4. Succeed.
5. Newest first; each run names `agent:qa_b` (not the token's user), `via: session`, the key,
   subject and state.
6. The same runs as the HTTP listing for that key.

## Evidence

The run rows of step 5 (id, key, subject, by, via, state, time).
