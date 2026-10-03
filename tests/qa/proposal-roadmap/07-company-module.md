# 07 A company module changes the process

## Covers

A company module's contributions do nothing until the organization binds them; a bound guard
replaces the default (and may build on it), a bound hook runs before or after an Action;
unbinding restores the default. Two bound contributions on one key are reported, not guessed.

## Setup

Task 02. A company module installed on the server whose contributions include a guard on
`proposal.approve` that refuses `agent:qa_a` with code `qa_does_not_approve`, and an after
hook on `proposal.*` that records something observable (for example an extra line in its
output). The fixture module used by the plugin's own tests serves; build it from
`plugins/company-proposals/test/fixtures/` if the server lacks one, and add its entry file
(`dist/index.js`) to the Project's plugins list.

## Steps

1. `GET $ORG/actions/contributions`; `GET $ORG/actions?subject=proposal:<n>` as `qa_a`.
2. `penguin org action bind <module>.<guard> --on`.
3. As `qa_a`, approve a ready proposal; as `qa_b`, approve it.
4. `GET $ORG/actions?subject=proposal:<n>` as `qa_a`.
5. Bind the hook; run any `proposal.*` Action; read the run.
6. Bind a second contribution answering `proposal.approve` (an Action, not a guard); run
   `proposal.approve`; `GET $ORG/actions/check`.
7. Run it with `POST $ORG/actions/by-id/<contribution>/runs`.
8. Unbind both and the guard (`--off`); approve as `qa_a` again.
9. `penguin org action runs --key action.bind`.

## Expect

1. The module's contributions are listed but unbound; `proposal.approve` allowed for `qa_a`.
3. `qa_a`: 403 `qa_does_not_approve`, recorded as refused; `qa_b`: succeeds.
4. `proposal.approve` shows `allowed: false` for `qa_a`.
5. The hook's effect is visible; the run lists it.
6. 409 `action_ambiguous` naming each `penguin org action exec <contribution>`; `check` lists
   the key with both contributions.
7. The named contribution runs.
8. The default guard is back: `qa_a` may approve.
9. Every bind and unbind is a run with its actor.

## Evidence

Error bodies of steps 3 and 6; the bindings' history from step 9.
