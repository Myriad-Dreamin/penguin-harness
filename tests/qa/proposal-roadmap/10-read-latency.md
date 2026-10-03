# 10 Read latency

## Covers

Read routes answer fast on a warm server with a realistic amount of data.

## Setup

Tasks 02–08 done (dozens of proposals and runs). If the organization has fewer than 20
proposals, create more with `proposal.create` + `proposal.publish` first.

## Steps

For each route, 20 sequential requests after one warm-up; record median and p95 as measured by
`curl -w '%{time_total}'` from the same machine as the server where possible:
`GET $ORG/proposals`, `GET $ORG/proposals/1`, `GET $ORG/proposals/1/revisions`,
`GET $ORG/roadmaps`, `GET $ORG/roadmaps/1`, `GET $ORG/actions/runs`,
`GET $ORG/actions?subject=proposal:1`, `GET $ORG/proposals/graph`.

## Expect

Median under 50 ms and p95 under 200 ms for each route measured on the server's machine
(over a tunnel, report the tunnel's own round trip next to the numbers).

## Evidence

A table: route, median, p95, where measured.
