# 02 Proposal lifecycle

## Covers

The built-in proposal Actions and their default rules: computed revision numbers, ready, a
comment batch, request changes, approve bound to one revision, reject as a final state.

## Setup

Task 01, the organization paused or its employees without a model. A proposal exists only
through a roadmap (task 04) or `proposal.create`; here run `proposal.create` on `organization`
as the admin (author `qa_a`), giving `#1`, and again for `#2`.

## Steps

1. `POST $ORG/actions/proposal.publish/runs { subject: "proposal:1", params: { markdown } }`
   with a body that has frontmatter `title`, a `scope` (paths that exist in the shared
   workspace, or `kind: new`) and the three sections (Change / Purpose / Test).
2. Publish again with a changed body. Then send three publishes of `#2` at once.
3. A body that links to a file (`[x](packages/a.ts)`): publish it.
4. `proposal.ready` on `proposal:1`.
5. As the admin, `proposal.comment` (`{ sectionId, start, end, quote, text }`) on two
   paragraphs of revision 2; `GET $ORG/proposals/1/comments`.
6. `proposal.requestChanges` on `proposal:1`; then `proposal.comment.edit` on
   `comment:1/<id>` of a sent comment.
7. From `qa_a`'s session: `proposal.resolve` on both comments, publish revision 3,
   `proposal.ready`. (Without a working session, do it as the admin and say so.)
8. `proposal.approve` on `proposal:1`; `GET $ORG/proposals/1`.
9. Publish revision 4; `GET $ORG/proposals/1`.
10. `proposal.reject` on `proposal:2` without a reason; then with `reason`.
11. `proposal.publish`, `proposal.approve` and `proposal.ready` on `proposal:2`.
12. `GET $ORG/proposals/1/revisions` and `GET $ORG/proposals/1/revisions/2`.

## Expect

1. 200, `outcome: succeeded`; the proposal shows revision 1.
2. Revision 2. Of the three concurrent publishes one succeeds and the others answer 409
   `revision_conflict` (a revision is the current one plus one).
3. 400 `proposal_body_links_files`, recorded `refused`.
4. Status `ready`.
5. The comments exist with `batchId: null` (not yet sent).
6. Request changes succeeds; both comments carry a batch id and the status is back to
   `drafting`; the edit answers 409 `comment_sent`.
8. The approval names revision 3 and the admin.
9. The approval is no longer current (it covered revision 3 only); status `ready`.
10. Without a reason: 400. With one: status `rejected`, reason and actor recorded.
11. All refused: `rejected` is final under the default guard.
12. Every revision is present in full; revision 2 reads as published.

## Evidence

For each step the run id and `run.outcome`, and for refusals the `error.code`.
