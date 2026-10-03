# 02 Proposal lifecycle

## Covers

The built-in proposal Actions and their default rules: revision numbers, ready, a comment
batch, request changes, approve bound to one revision, reject as a final state.

## Setup

Task 01. A proposal exists only through a roadmap (task 04) or `proposal.create`; for this task
run `proposal.create` on `organization` as the admin (author `qa_a`), giving proposal `#1`, and
a second one, `#2`.

## Steps

1. `POST $ORG/actions/proposal.publish/runs { subject: "proposal:1", params: { rev: 1, … } }`
   with a body that has the three sections (Change / Purpose / Test) and a scope.
2. Publish again with `rev: 1`; then with `rev: 3`; then with `rev: 2`.
3. A body that links to a file (`[x](packages/a.ts)`): publish it as the next revision.
4. `proposal.ready` on `proposal:1`.
5. As the admin, `proposal.comment` on two paragraphs of revision 2; `GET $ORG/proposals/1/comments`.
6. `proposal.request` (request changes) on `proposal:1`; then try `proposal.comment.edit` on one
   of the sent comments.
7. As `qa_a`, `proposal.resolve` both comments, publish revision 3, `proposal.ready`.
8. `proposal.approve` on `proposal:1`; `GET $ORG/proposals/1`.
9. Publish revision 4; `GET $ORG/proposals/1`.
10. `proposal.reject` on `proposal:2` without a reason; then with `reason`.
11. `proposal.publish`, `proposal.approve` and `proposal.ready` on `proposal:2`.
12. `GET $ORG/proposals/1/revisions` and `GET $ORG/proposals/1/revisions/2`.

## Expect

1. 200, run `succeeded`; the proposal shows revision 1.
2. Each refused (revision must be current + 1), except `rev: 2`, which succeeds.
3. Refused with a 400 naming the file link.
4. Status `ready`.
5. The comments exist, `pending` until sent.
6. Request changes succeeds; the comments are sent; editing a sent comment is refused.
8. The approval names revision 3 and the admin.
9. The approval is no longer current (it covered revision 3 only).
10. Without a reason: refused (400). With one: status `rejected`, reason and actor recorded.
11. All refused: `rejected` is final under the default guard.
12. Every revision is present in full; revision 2 reads as published.

## Evidence

For each step the run id, the run's `state`, and for refusals the `error.code`.
