# 04 Roadmap flow

## Covers

`roadmap.open`, `roadmap.draft`, `roadmap.establish`, `roadmap.reopen`, item approvals by
role, the proposal created from an approved item, `roadmap.adopt`.

## Setup

Task 01.

## Steps

1. `roadmap.open` on `organization` with `{ name, employees: ["qa_a","qa_b"] }` (moderator
   `qa_a`).
2. `roadmap.draft` on `roadmap:1` with a body (one `## Scope` section) and two proposal items,
   `x` (owner `qa_b`, cites `Scope`) and `y` stacked on `x`.
3. A draft whose item has empty `cites`; a draft whose item cites a section the body lacks,
   then establish it.
4. `roadmap.establish` on `roadmap:1`; `GET $ORG/roadmaps/1`.
5. `roadmap.draft` while established.
6. `roadmap.item.approve` on `item:1/x` as the admin; then from `qa_a`'s session (the
   moderator). If the moderator's room session approves by itself right after establish,
   record that and skip its approval. While employees cannot act, the moderator's approval
   needs a guard override: a company workflow (task 07) replacing `roadmap.item.approve`'s
   guard so a second admin approval counts for the missing role (for example
   `defaults(input, { ...options, roles: ["person"] })`), removed after step 8. Without one,
   steps 6–7 are `blocked`.
7. `GET $ORG/proposals`; `GET $ORG/roadmaps/1`.
8. `roadmap.item.approve` on `item:1/x` again as the admin.
9. `roadmap.reopen { reason }`, change only item `y`'s brief, establish again; read item `x`.
10. `roadmap.adopt` an existing proposal (`#1`) into `roadmap:1`.
11. `roadmap.reopen`, change item `x`'s brief (x is linked to proposal `N` from step 7),
    establish; read `x`.
12. Approve `x` fully again (as in step 6); `GET $ORG/proposals`; `GET $ORG/proposals/N`.
13. `proposal.reject` `N` with a reason; repeat steps 11–12.

## Expect

2. Succeeds while `discussing`.
3. Empty `cites`: 400 at draft, naming the item by index. Unknown cite: accepted at draft,
   refused at establish with `cite_unknown` naming the item's key.
4. Status `established`; items in stage `brief`, no approvals.
5. Refused: not discussing.
6. Both succeed; each approval records its role and principal.
7. One new proposal exists, linked from `delegations.x.proposal` (stage `delegated`), owner
   `qa_b`.
8. Refused or a no-op: one approval per principal; still exactly one proposal for `x`.
9. Item `x` keeps its approvals and proposal; only `y` changed.
10. Item added with the proposal linked.
11. `x` is back in stage `brief` with no approvals, still showing `proposal: N`.
12. No new proposal: `N` keeps its number and its brief is rewritten to `x`'s new brief; its
    author is notified (`notify_failed` while paused counts as sent).
13. Now `N` is closed: the approval creates a new proposal, and `x` links to it instead of `N`.

## Evidence

The roadmap after steps 4, 7, 9 and 11 (items with stage, approvals, proposal); the proposal
list after steps 12 and 13; run ids.
