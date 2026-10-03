# 13 Deleting an organization

## Covers

Deleting an organization the plugins have used: in-flight work is aborted, the plugins release
the organization's store connections before its directory moves to the trash, and an
organization recreated with the same id starts empty. Run it on a Windows server as well as a
Linux one: Windows refuses to move a directory with open files in it.

## Setup

Tasks 01–08 done in `$O` (its `company.db` is open). A second organization `$O2` with one
proposal, to check it is not affected. A company workflow contributing `deploy.qa_slow`
(sleeps 120 s) in `$O`.

## Steps

1. Start `deploy.qa_slow` on a proposal of `$O`; start `GET $ORG/proposals/graph?refresh=1`
   without waiting for it.
2. `DELETE $S/api/projects/$P/organizations/$O` (as the owner).
3. `GET $ORG/proposals`; `POST $ORG/actions/proposal.create/runs`.
4. List the Project's organizations; look in `<root>/$P/organizations/.trash/`.
5. `GET` `$O2`'s proposals and Activity; run one Action there.
6. Create a new organization with the id `$O` again; install nothing new; `GET $ORG/proposals`,
   `GET $ORG/actions/runs`, `GET $ORG/roadmaps`.

## Expect

2. 204 (never 500). If the move fails anyway: 409 `organization_busy` naming the reason and
   path, and the organization is still listed and usable.
3. 404.
4. `$O` is gone from the list; its directory, with `company.db`, is in the trash, and the
   aborted deploy run's end row is in it.
5. `$O2` unaffected.
6. All empty: nothing of the deleted organization shows through.

## Evidence

Status codes of steps 2, 3 and 6; the trash listing; the server log lines of the delete.
