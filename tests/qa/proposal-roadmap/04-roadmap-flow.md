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
3. A draft whose item cites no body section.
4. `roadmap.establish` on `roadmap:1`; `GET $ORG/roadmaps/1`.
5. `roadmap.draft` while established.
6. `roadmap.item.approve` on `item:1/x` as the admin; then as `qa_a` (the moderator).
7. `GET $ORG/proposals`; `GET $ORG/roadmaps/1`.
8. `roadmap.item.approve` on `item:1/x` again as the admin.
9. `roadmap.reopen { reason }`, change only item `y`'s brief, establish again; read item `x`.
10. `roadmap.adopt` an existing proposal (`#1`) into `roadmap:1`.

## Expect

2. Succeeds while `discussing`.
3. Refused (400) naming the item.
4. Status `established`; items in stage `brief`, no approvals.
5. Refused: not discussing.
6. Both succeed; each approval records its role and principal.
7. One new proposal exists, linked from item `x` (stage `delegated`), owner `qa_b`.
8. Refused or a no-op: one approval per principal; still exactly one proposal for `x`.
9. Item `x` keeps its approvals and proposal; only `y` changed.
10. Item added with the proposal linked.

## Evidence

The roadmap after steps 4, 7 and 9 (items with stage, approvals, proposal); run ids.
