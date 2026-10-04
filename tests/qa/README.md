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
  environment, or `curl` with the session's `$PENGUIN_API_TOKEN`), so the server records
  `agent:<id>`, not the token's user. An outside caller cannot act as an employee: "from
  `qa_a`'s session" in a step means exactly that.
- An Action run answers `{ run, result }`; its end state is `run.outcome` (`succeeded`,
  `refused`, `failed`, `abandoned`), and a refusal answers `{ error: { code, message, runId } }`.
- Never run these tasks against a release or production server: they create organizations,
  proposals and runs that stay in its store.
- Company mode is set with `PUT $S/api/admin/settings` (not `PATCH`).
- **Employees act on their own.** An employee with a model answers every notice: it publishes,
  marks ready, implements, pushes and merges. An employee hired without a model still acts: it
  inherits the organization's model, else the Project default. To get an organization whose
  employees cannot act, create it with a model that is configured in the Project but whose
  provider has no credential (an unknown model is refused at creation), and pause it
  (`PATCH $ORG { status: "paused" }`) at once, keeping it paused for the whole run. Creation
  dispatches the CEO's init run immediately, so the model must lack a credential from the
  start; a pause comes too late to stop that run.
- Hire with `agentId` when the Agents already exist (deleting an organization keeps its
  Agents, so an earlier run's `qa_a`/`qa_b` may be there); use `newAgent` only for fresh ids.
- **No real remote is written.** A QA organization never gets a writable real remote, and the
  tester never pushes. Heads, diffs and deploy commits are read from GitHub only, and the graph
  ignores non-GitHub remotes, so a local bare repository is of no use: register impl heads and
  bases on a read-only public GitHub repository written as `owner/repo` (for example
  `octocat/Hello-World`), not as a workspace remote.
- A step "from `qa_X`'s session" cannot run while employees must not act. Where it needs a
  caller who is neither implementer nor approver, use a second person account or report the
  step `blocked`. Where the step is about the guard (who may do what), the admin may stand in,
  with a guard written to refuse the admin as well; the report says so.
