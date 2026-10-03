# 09 PR graph from the snapshot

## Covers

The graph is read from a stored snapshot without waiting for git or GitHub; a refresh probes
with `ls-remote` and only fetches when a ref moved; `?refresh=1` forces one.

## Setup

The organization's delivery repository is set to a GitHub repository with a few stacked open
PRs, and `gh` is logged in on the server machine. Reading a real repository is fine; step 3 pushes, so
it needs a throwaway repository of the run's own, else it is `blocked`. Pause the organization
first (see the README). Without GitHub access mark this task `blocked`.

## Steps

1. `GET $ORG/proposals/graph` (first read); time it. Read again; time it.
2. `GET $ORG/proposals/graph?refresh=1`; then read until `refreshing` is false.
3. Push a commit to one PR's head branch; `?refresh=1`; read.
4. Read again within the refresh window; note whether a probe ran (server log).
5. Look in `<root>/$P/organizations/$O/git/` on the server.

## Expect

1. The first read answers without waiting for a full refresh (`refreshing: true` is fine);
   the second is fast.
2. `?refresh=1` answers after the refresh, with `refreshing: false`; nodes match the open PRs'
   stacking; impl proposals are attached to their PRs.
3. The moved PR shows its new head; untouched PRs are unchanged.
4. No probe inside the window.
5. A bare blobless mirror of the delivery repository.

## Evidence

Timings; node count; the moved node before and after.
