# Coverage-guided fuzzers for the API and CLI surfaces

Two Jazzer.js fuzz targets that drive the repository's own server and CLI in one Node
process, and turn "nothing may crash the harness" into a machine-checked property.

Each leg boots a disposable data root — a real SQLite database, the real Hono app, the real
`cli(argv)` — with only the model client and the clock replaced. The model client is a
scripted stub, and an outbound guard fails any non-loopback socket, so a run never reaches a
network. What is fuzzed is the product code: routing, validation, services, the session
manager and its persistence.

The fuzzing engine is libFuzzer through Jazzer.js: the target hands it one function that
turns a byte buffer into one request (or one command line), and the engine's own coverage
feedback decides which inputs to keep, mutate and schedule. There is no request generator and
no step budget in this directory.

## Why there is a build step

Jazzer.js instruments modules as it loads them, through a Babel pipeline that carries no
TypeScript syntax plugin. A `.ts` target therefore loads uninstrumented: coverage stays
empty and the fuzzer has no feedback to guide it (measured on Jazzer.js 4.0.0). `build.mjs`
compiles the targets — and every product module they reach — to plain ESM under `build/`
with esbuild, keeping one output file per input file and an inline source map.

The compiled tree needs two resolutions an installed workspace does not give it on its own,
and `build.mjs` supplies both: a `node_modules` symlink per package, so a dependency import
from `build/packages/<pkg>/src/…` walks up into that package's installed dependencies, and
`paths.json` — the tsconfig's `paths` table rewritten to compiled targets — which
`resolve-hook.mjs` applies through `module.registerHooks`.

The native fuzzer addon (`@jazzer.js/fuzzer`) needs glibc 2.38 or newer. On an older libc
(e.g. Debian 12) the install succeeds and the first import fails with `ERR_DLOPEN_FAILED`;
run the fuzzer on a newer base image or distribution.

## Layout

| Path | What it is |
| --- | --- |
| `server/` | The API surface: one request per input against the in-process server. |
| `server/src/fuzz.ts` | The Jazzer.js entry: decode, send, check, throw on a violation. |
| `server/src/corpus.ts` | The endpoint table: the target's alphabet, and the seed corpus' source. |
| `server/src/input.ts` | The input format (two control bytes, then payload) and body payload injection. |
| `server/src/invariants.ts` | The invariant checks, read off a second, read-only SQLite connection. |
| `server/src/harness.ts`, `server/src/assemble.ts` | The boot both legs share (`bootAppDeps` → `seedAdmin` → `createApp`). |
| `cli/` | The CLI surface: one command line per input, over the same harness. |
| `cli/src/fuzz.ts` | The Jazzer.js entry: decode, run the command, check its exit contract. |
| `cli/src/corpus.ts` | The command table: alphabet and seed source. |
| `build.mjs` | Compiles the targets and the product modules they reach to `build/`. |
| `run.mjs` | Build → seed the corpus → run the fuzzer → write the coverage report. |
| `fuzz-runner.mjs` | Starts Jazzer.js from this process and closes the harness when the run ends. |
| `report.mjs` | Rewrites the coverage keys back to source paths and writes the summary. |
| `resolve-hook.mjs`, `resolve-hooks.mjs` | The `@prismshadow/*` mapping the compiled tree needs. |
| `tsconfig.json` | The checking view: the targets and everything they drive, typed against the installed MMSP client. |
| `tsconfig.run.json` | The running view: same, except `@prismshadow/mmsp` resolves to the scripted stub. |

Neither leg is a member of the pnpm workspace, so a type check or a run from here needs a few
resolutions an installed tree does not provide — the workspace packages resolve through
`dist/`, which exists only after a build, and `hono` lives nested under `packages/server`.
Both tsconfigs spell them out, pointing at sources; the build carries the same table into the
compiled tree.

`@prismshadow/mmsp` is the seam that matters: `tsconfig.run.json` maps it to the scripted
stub under `server/src/stubs/mmsp/`, which is what keeps the LLM hermetic.

## Running

From the repository root, on Node 24, after the workspace is installed:

```sh
# The interface table the module-tree check reads (generated, not committed). Generate it
# through THIS package's tsconfig, which resolves the workspace packages to their sources:
# the root `pnpm gen:ifaces` projects through `packages/server/tsconfig.json`, where an
# unbuilt tree resolves `@prismshadow/penguin-core`/`-hmr` onto a missing `dist/` and the
# projection degrades — `ScheduleTaskRunner` and `ScheduleSessionCreator` come out with no
# methods, every module satisfies them, and the platform refuses to boot
# ("requires.runner: ambiguous ... name one with 'from'").
node scripts/gen-ifaces.mjs --project tests/fuzzers/tsconfig.json --out packages/server/src/ifaces.json

# Once: the fuzzer itself (pinned in package.json; not a workspace dependency).
npm --prefix tests/fuzzers install

node tests/fuzzers/run.mjs server              # API surface, 180 s
node tests/fuzzers/run.mjs cli --max-total-time=60
```

`run.mjs` accepts `--max-total-time=<seconds>` (default 180), `--runs=<n>` for a fixed number
of executions, `--mode=regression` to replay the corpus without mutating it, `--no-build` to
reuse the last build, and `--self-check` to replay the corpus through the target with no
fuzzer at all (the fastest way to tell a harness problem from a fuzzer problem).

A type check runs over both legs at once:

```sh
node_modules/.bin/tsc -p tests/fuzzers/tsconfig.json
```

## The input formats

Both targets read a request out of the bytes they are handed; the seed corpus and the crash
files use the same format, so a finding replays with `--mode=regression`.

API — `server/src/input.ts`:

| Bytes | Meaning |
| --- | --- |
| 0 | endpoint index, modulo the table length |
| 1 | flags: bits 0-1 auth mode (anonymous / bearer / cookie), bit 2 bad body, bit 3 clock jump, bit 4 raw body |
| 2… | payload: choice bytes for the body and `:param` fills, and the text a body's last string field receives |

CLI — `cli/src/input.ts`:

| Bytes | Meaning |
| --- | --- |
| 0 | command index, modulo the table length |
| 1 | flags: bit 0 bad variant |
| 2… | payload: choice bytes for the argv's slots, and the text a `-m`/`-t` value receives |

The tables are not schedules: a step's endpoint or command is the input's first byte, so a
mutation moves it, and libFuzzer keeps the inputs that reach new code. The payload lets a
mutation reach a string field (a title, a path, a task text) rather than only the choice of
call.

## What a run produces

Under the leg's own `out/` (ignored by git):

| File | Contents |
| --- | --- |
| `corpus/` | The seed inputs plus every input the fuzzer kept. |
| `run.log` | The fuzzer's console output, final statistics included. |
| `coverage/coverage-final.json` | The raw istanbul coverage Jazzer.js writes. |
| `coverage/coverage-summary.md` | Lines/statements/functions/branches, in total and per source file. |
| `summary.md` | The target's own account: requests or commands served, status/exit buckets, distinct state signatures, outbound attempts. |
| `crash-*` | Any input that tripped an invariant, in the input format above. |

The process exits `0` when the fuzzer stopped on its own (time or run count), and `77` — the
fuzzer's own code for a finding — when an input tripped something.

## What counts as a finding

API: an exception escaping a handler, a request that outlives its soft timeout, a JSON
content type whose body does not parse, any process-level or unexpected error row in
`error_records` beyond the failures the scripted stub actually played, or a non-loopback
connection attempt.

CLI: a command that throws, hangs, exits outside the set its command allows, reaches
`process.exit` where the table does not expect it (the one known hard-exit face is exercised
on purpose), or makes a non-loopback connection.

A finding is thrown from the target, which is how the fuzzer records it and saves the input.

## Deliberately not exercised

Both tables are cut by a danger gate: no self-update, no plugin install/remove, no browser
driving, no terminal pty spawn, no OAuth or balance network calls, no organisation writes
that open real sessions, no server stop or password reset. Those behaviours need their own
harness, not a shared in-process one. The SSE stream (`/api/events`) is sampled once at boot
with a bounded read rather than fuzzed: a live stream only ends when its client stops, which
is a fixed cost per call inside a fuzzing loop.

## Status

These packages are not wired into CI yet: they are run by hand, and their artifacts are what
a reviewer reads. Container packaging and CI wiring are separate work.
