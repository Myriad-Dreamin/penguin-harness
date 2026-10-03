# 12 Restart durability

## Covers

Everything lives in `company.db`: a restart keeps proposals, roadmaps, runs and bindings; a run
cut off by the process exit becomes `abandoned`.

## Setup

Tasks 02–08. A company workflow contributing `deploy.qa_slow`, which sleeps 120 s. Nobody else
relies on the server while it restarts.

## Steps

1. Record `GET $ORG/proposals`, `GET $ORG/roadmaps`, `GET $ORG/actions/runs?limit=50`,
   `GET $ORG/workflows` and `GET $ORG/actions/contributions`.
2. Start `deploy.qa_slow`; while it runs, restart the server.
3. Repeat step 1's reads.
4. Read the run of step 2.

## Expect

3. Identical to step 1 apart from new runs.
4. State `abandoned`.

## Evidence

A diff of step 1 and step 3; the run of step 4.
