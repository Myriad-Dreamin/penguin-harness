# Proposals and roadmaps: SQLite store and Actions

Acceptance for two changes to `plugins/company-proposals` and `plugins/company-roadmaps`:

- the per-organization SQLite store (`company.db`) that replaces the JSONL ledgers, and the PR
  graph read from a local mirror and a stored snapshot;
- every write as an Action through `…/organizations/:orgId/actions`, recorded as an ActionRun
  (the Activity), with default guards that do not tell a person from an employee, and company
  company workflows (an organization's own workflows) that contribute guards, hooks and
  `deploy.<id>` Actions.

Run the tasks in order; later tasks reuse what earlier ones created.

| Task | Covers |
| --- | --- |
| [01-empty-start](01-empty-start.md) | a new organization starts with an empty store; plugins installed |
| [02-proposal-lifecycle](02-proposal-lifecycle.md) | publish, revise, ready, comment batch, request changes, approve, reject |
| [03-impl-branch](03-impl-branch.md) | an impl branch with no PR; attaching a PR later; merged |
| [04-roadmap-flow](04-roadmap-flow.md) | open, draft, establish, item approvals, the proposal created from the item |
| [05-employee-parity](05-employee-parity.md) | an employee does what a person does; the Activity names who |
| [06-refusals-recorded](06-refusals-recorded.md) | refused and failed runs are recorded; requestId retries |
| [07-company-workflow](07-company-workflow.md) | a company workflow's guard and hook change the process; removing it restores the default |
| [08-deploy-action](08-deploy-action.md) | `deploy.<id>` from a company workflow, expected head, output, graph refresh |
| [09-pr-graph](09-pr-graph.md) | graph read from the snapshot, forced refresh, no network on read |
| [10-read-latency](10-read-latency.md) | read routes answer fast on a warm server |
| [11-web-pages](11-web-pages.md) | proposals page, Activity view, roadmap column, PR graph menu |
| [12-restart-durability](12-restart-durability.md) | data and runs survive a server restart; an open run becomes `abandoned` |

Reference: the plugins' READMEs (`plugins/company-proposals/README.md`,
`plugins/company-roadmaps/README.md`) list every route, Action key and subject form.
