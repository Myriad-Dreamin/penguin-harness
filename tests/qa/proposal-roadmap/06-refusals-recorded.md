# 06 Refusals, failures and retries in the Activity

## Covers

A refused run is recorded with its code; a `requestId` retry returns the first run; an unknown
key or subject is an error, not a run.

## Setup

Task 02.

## Steps

1. Run `proposal.approve` on a `rejected` proposal.
2. `GET $ORG/actions/runs?subject=proposal:<that>`.
3. Run `proposal.ready` on a draft proposal with `requestId: "qa-retry-1"`; repeat the same call
   twice.
4. Run `proposal.nosuchthing` on `proposal:1`; run `proposal.approve` on `proposal:9999`.
5. `GET $ORG/actions/runs/<id>` for the run of step 1.

## Expect

1. 4xx with `{ error: { code, message, runId } }`.
2. The refusal is listed with state `refused` and the same code.
3. All three answers carry the same run id; one run in the Activity.
4. 404s; whether they appear in the Activity is recorded either way (note which).
5. The run with its params, actor and end.

## Evidence

The error bodies and run ids.
