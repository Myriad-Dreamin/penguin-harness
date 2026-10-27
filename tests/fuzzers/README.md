# In-process fuzzers for the API and CLI surfaces

Two small packages that drive the repository's own code with deterministic, reproducible
sequences, and turn "the system never dies on any call" into something a machine checks.

They run in one Node process against a disposable data root: the real server (Hono routing,
validation, services, session manager, SQLite) and the real CLI (commander over that same
server), with only the LLM and the clock replaced. Nothing leaves the process — the model
client is a scripted stub, and an outbound guard fails any non-loopback socket attempt into
the run's findings.

## Layout

| Path | What it is |
| --- | --- |
| `server/` | The API surface: a stateful request sequence through `app.request()`, per-step invariants, read-only state introspection. |
| `server/src/main.ts` | Entry point. |
| `server/src/api-leg.ts`, `server/src/corpus.ts` | The sequence generator and its endpoint corpus. |
| `cli/` | The CLI surface: the repository's own `cli(argv)` against the same harness. |
| `cli/src/main.ts` | Entry point. |
| `cli/src/cli-leg.ts`, `cli/src/corpus.ts` | The command generator and its command corpus. |
| `server/src/harness.ts` | The boot both entries share (`bootAppDeps` → `seedAdmin` → `createApp`). |
| `run.mjs` | Runs either entry with the repository's tsx and `tsconfig.run.json`. |
| `tsconfig.json` | The checking view: the fuzzers plus everything they drive, typed against the installed MMSP client. |
| `tsconfig.run.json` | The running view: same, except `@prismshadow/mmsp` resolves to the scripted stub. |
| `types/globals.d.ts` | One global the driven product code expects and this program would otherwise lack. |

Neither package is a member of the pnpm workspace, so a type check or a run from here needs a
few resolutions an installed tree does not provide on its own — the workspace packages
resolve through `dist/`, which exists only after a build, and `hono` lives nested under
`packages/server`. Both tsconfigs spell them out, pointing at sources.

`@prismshadow/mmsp` is the seam that matters: `tsconfig.run.json` maps it to the scripted
stub under `server/src/stubs/mmsp/`, which is what keeps the LLM hermetic. That is why the
entries are started through `run.mjs` — run one straight from the repository root and the
root tsconfig lets the real client through.

## Running

From the repository root, on Node 24, after the workspace is installed:

```sh
pnpm install
# The interface table the module-tree check reads (generated, not committed). Generate it
# through THIS package's tsconfig, which resolves the workspace packages to their sources:
# the root `pnpm gen:ifaces` projects through `packages/server/tsconfig.json`, where an
# unbuilt tree resolves `@prismshadow/penguin-core`/`-hmr` onto a missing `dist/` and the
# projection degrades — `ScheduleTaskRunner` and `ScheduleSessionCreator` come out with no
# methods, every module satisfies them, and the platform refuses to boot
# ("requires.runner: ambiguous ... name one with 'from'").
node scripts/gen-ifaces.mjs --project tests/fuzzers/tsconfig.json --out packages/server/src/ifaces.json

node tests/fuzzers/run.mjs server    # or: pnpm --dir tests/fuzzers/server fuzz
node tests/fuzzers/run.mjs cli       # or: pnpm --dir tests/fuzzers/cli fuzz
```

A type check runs over both packages at once:

```sh
node_modules/.bin/tsc -p tests/fuzzers/tsconfig.json    # or: pnpm --dir tests/fuzzers/server typecheck
```

Both exit `0` when no finding was recorded, `1` when something was found (the findings are
printed and written into the run summary), and `90` if the 180-second ceiling fires.

## What the runs produce

Under the package's own `out/` (ignored by git):

| File | Contents |
| --- | --- |
| `api-sequence.jsonl` | One serialized request per line: `step`, `spec`, `request` (`method`/`path`/`auth`/`body`), `observed` (`status`/`note`). |
| `cli-sequence.jsonl` | One command line per line: `step`, `spec`, `argv`, `observed` (`exitCode`/`output`/`phase`). |
| `api-transcript.md`, `cli-transcript.md` | The same sequence as a table, plus the run's counters. |
| `run-summary.md` | The run's own account — elapsed time, counters, outbound attempts, findings. |

## The sequences

Both are seeded and reproducible; the same seed gives the same `*.jsonl` byte for byte. That
holds because the sequence records calls, not the machine: ids the run captured from an
earlier response appear as their provenance (`$sessions[0]`) and the disposable root as
`$root`, and the wall-clock `ms` a step took stays in the transcript and the run summary.

**API.** The corpus is an endpoint table (method, path template, weight, body variant,
pool, capture), every entry naming the handler it drives. A step picks a spec by weight,
fills `:param` slots from pools captured out of earlier successful responses (so the
sequence is stateful), sends an `ok` or a `bad` body, and rotates credentials between
anonymous, bearer token and cookie session — the cookie comes from a real login, and a 401
re-logs in. Every 40 steps the clock jumps 31 days, across the 30-day session TTL. One step
samples the real loopback event stream. After each step a second, read-only SQLite
connection counts the resource tables and the error rows; the resulting signature counts
distinct states.

The invariants checked after every step: no exception escapes a handler, no process-level
error row appears, and no `unexpected` error row shows up outside the LLM failures the
stub actually played.

**CLI.** A setup pipeline (`config model add --set-default`, an agent create, one real run)
followed by a deterministically shuffled corpus pass. Every command runs behind an exit
guard, with stdout/stderr captured and a soft timeout, and its exit code is checked against
the set the spec allows. The setup doubles as a write-after-read oracle: the CLI writes the
project config file locally, and after the server's 2-second freshness window the same
server must see that write.

## Deliberately not generated

Both corpora are cut by a danger gate: no self-update, no plugin install/remove, no browser
driving, no terminal pty spawn, no OAuth or balance network calls, no organisation writes
that open real sessions, no server stop or password reset. Those behaviours need their own
harness, not a shared in-process one.

## Status

These packages are not wired into CI yet: they are run by hand, and their artifacts are
what a reviewer reads. Container packaging and CI wiring are separate work.
