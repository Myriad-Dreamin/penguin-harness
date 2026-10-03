# QA tasks

Manual acceptance tasks, run against a deployed penguin server by a person or an Agent. Each
directory covers one change; each task is one Markdown file with the same sections:

- **Covers** — what the task proves.
- **Setup** — what must exist before step 1 (usually an earlier task's output).
- **Steps** — numbered; HTTP calls name the route, Web steps name the page and the control.
- **Expect** — one checkable line per step that has an outcome.
- **Evidence** — what the report must quote (status codes, run ids, response excerpts, timings).

A run produces one report, `report-<UTC date>-<target>.md`, kept outside the repository (it
holds server addresses). Every task gets one verdict: `pass`, `fail` (with the step, what was
expected, what came back, and how to reproduce) or `blocked` (with what blocked it). A failed
step does not stop the run: record it and carry on with the next task whose setup still holds.

Conventions used by the tasks:

- `$S` is the server's base URL; `$P` is the Project id (`default_project` unless the target
  says otherwise); `$O` is the organization the run creates. `$ORG` abbreviates
  `$S/api/projects/$P/organizations/$O`.
- Log in with `POST $S/api/auth/login` and keep the cookie jar; never write the password into
  a file in the repository or the report.
- An employee's call is made from inside that employee's desk session (the CLI's control
  environment), so the server records `agent:<id>`, not the token's user.
- Never run these tasks against a release or production server: they create organizations,
  proposals and runs that stay in its store.
