# 09 PR graph from the snapshot

## Covers

The graph is read from a stored snapshot without waiting for git or GitHub; a refresh probes
with `ls-remote` and only fetches when a ref moved; `?refresh=1` forces one.

## Setup

The server-wide plugin setting `company-proposals.deliveryRepo` names a GitHub repository with
a few stacked open PRs; record its previous value first and restore it at the end. No workspace
remote is needed. `gh` is logged in on the server machine; reading a real repository is fine.
Without GitHub access mark this task `blocked`. The organization stays paused (see the README).

## Steps

1. `GET $ORG/proposals/graph` (first read); time it. Read again; time it.
2. `GET $ORG/proposals/graph?refresh=1`; then read until `refreshing` is false.
3. When one PR's head branch moves (the tester never pushes: this step is `blocked` unless a head
   moves by itself during the run), `?refresh=1`; read.
4. Read again within the refresh window; note whether a probe ran (server log).
5. Look in `<root>/$P/organizations/$O/git/` on the server (or `GET $ORG/mirror`).

## Expect

1. The first read answers without waiting for a full refresh (`refreshing: true` is fine);
   the second is fast.
2. `?refresh=1` answers only once the refresh completes (seconds), with `refreshing: false`;
   nodes match the open PRs' stacking; impl proposals are attached to their PRs, impl
   branches without a PR are in `unplaced`.
3. The moved PR shows its new head; untouched PRs are unchanged.
4. No probe inside the window.
5. A bare blobless mirror of the delivery repository.

## Evidence

Timings; node count; the moved node before and after; the setting's value before and after.
