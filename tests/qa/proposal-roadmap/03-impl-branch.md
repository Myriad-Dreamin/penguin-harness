# 03 Impl branch without a PR

## Covers

A proposal's implementation registered as a `<remote, branch>` head and base, no PR; its diff;
attaching a PR later; reporting merged.

## Setup

Task 02 (`#1` approved at revision 3 or 4). The organization's shared workspace has a git
repository with a remote pointing at a GitHub repository the server can read (`gh` logged in
on the server machine), and two branches on it, a base and a head ahead of it. If the server
has no GitHub access, run steps 1–3 and mark 4–6 `blocked`.

## Steps

1. `proposal.impl` on `proposal:1` with `{ head: { remote, branch }, base: { remote, branch } }`.
2. `GET $ORG/proposals/1`; `GET $ORG/proposals/1/impl/diff`.
3. Register the same head on proposal `#3` (create it first, as in task 02).
4. `proposal.merged` on `proposal:1` as `qa_b` (neither implementer nor approver).
5. Open a PR for the head branch; `proposal.impl` on `proposal:1` with the PR URL.
6. Merge the PR on the forge; `proposal.merged` on `proposal:1` as `qa_b`.

## Expect

1. Succeeds; no PR required.
2. The impl shows head and base, no PR; the diff is the patch from the merge base of base and
   head up to head.
3. Refused: one impl per head (default rule) — the error names the proposal that holds it.
4. Refused: the forge cannot confirm a merge (no PR yet).
5. Succeeds; the PR's head must be the declared head; its base replaces the declared base.
6. Succeeds; status `merged`.

## Evidence

The impl object of step 2, the diff's first lines, the error codes of steps 3–4.
