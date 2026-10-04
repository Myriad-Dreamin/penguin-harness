# 03 Impl branch without a PR

## Covers

A proposal's implementation registered as a `<remote, branch>` head and base, no PR; its diff;
the merged report without a PR.

## Setup

Task 02; re-approve `#1` first (step 9 of task 02 left it `ready`). A read-only public GitHub
repository with a base branch and a head branch ahead of it, written as `owner/repo` (for
example `octocat/Hello-World`, base `master`, head `test`). Heads and diffs are read from
GitHub, so a local bare repository does not work. The workspace needs no remote, and nothing is
pushed (see the README).

## Steps

1. `proposal.impl` on `proposal:1` with `{ head: { remote, branch }, base: { remote, branch } }`.
2. `GET $ORG/proposals/1`; `GET $ORG/proposals/1/impl/diff`.
3. Create `#3` (as in task 02) and register the same head on it.
4. As a caller who is neither implementer nor approver (`qa_b`'s session, or a second person
   account while employees cannot act; otherwise `blocked`): `proposal.merged` on
   `proposal:1`.
5. As the approver of `#1`: `proposal.merged` on `proposal:1`.

## Expect

1. Succeeds; no PR required.
2. The impl shows head and base, no PR; the diff is the patch from the merge base of base and
   head up to head.
3. Refused `impl_branch_taken`, naming the proposal that holds the head.
4. Refused 409 `impl_pr_missing`: nobody else's word is taken without the forge.
5. Succeeds on the approver's word; status `merged`.

## Evidence

The impl object of step 2, the diff's first lines or the error, the codes of steps 3–4.
