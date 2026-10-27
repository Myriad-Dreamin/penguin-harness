# Coverage-guided fuzzers for the API and CLI surfaces

Two Jazzer.js fuzz targets that drive the repository's own server and CLI in one Node
process, and turn "nothing may crash the harness" into a machine-checked property.

Each leg boots a disposable data root — a real SQLite database, the real Hono app, the real
`cli(argv)` — with only the model client and the clock replaced. The model client is a
scripted stub, and an outbound guard fails any non-loopback socket, so a run never reaches a
network. What is fuzzed is the product code: routing, validation, services, the session
manager and its persistence.

The fuzzing engine is libFuzzer through Jazzer.js: the target hands it one function that
turns a byte buffer into a sequence of requests (or of command lines), and the engine's own
coverage feedback decides which inputs to keep, mutate and schedule. What a byte means comes
from the specs below; there is no request generator and no step budget in this directory.

## Specs: what a byte means

Jazzer.js 4.0.0 offers no custom-mutator hook. libFuzzer's `LLVMFuzzerCustomMutator` is a
symbol resolved when the binary is linked, and the Node addon exposes only `customHooks`, which
wrap a run instead of replacing its mutation step. Mutation by spec is therefore realized one
layer lower, in the decoder, and that is the stronger place for it.

An input is still a plain byte string, so libFuzzer's own mutations, crossovers and scheduling
stay intact. An input is a **sequence of calls**, one record per call, and a newline byte
separates records: a mutation that inserts `0x0a` adds a call, one that erases across it drops a
call, and a crossover splices two sequences — none of which a length-prefixed format would allow,
because the engine cannot recompute a length it broke. Inside a record two control bytes choose
the spec (one endpoint, one command) and the shape of the call (credential mode, a valid or a
damaged body); every remaining decision the engine flips lands on a named slot of that spec — one
path parameter, one body field, one argv option — and the value is drawn from the slot's declared
type. Changing one byte changes one field's value, which is what makes a mutation meaningful on a
typed surface; arbitrary JSON bytes would rarely get past the parser. A sequence is also the unit
a finding is saved as, so a crash replays the calls that led to it.

The specs are penguin's own declarations. `specs/extract.mjs` parses the sources with the
TypeScript compiler API and writes `specs/surface.json`: every server route, taken from each
`HttpModule.routes` contribution together with the `app.<method>("…")` call its factory makes;
every client endpoint of the web client's endpoint table, with its request body; the shape of
every DTO a body can name; and the paths a route builds at run time, which each extraction
lists because no literal exists to extract. The CLI leg reads the commander tree that the CLI's
own fifteen `register*Command` calls build, so a new command appears in the specs with no edit
here.

Regenerate the surface after adding or renaming a route, an endpoint or a DTO field:

    node tests/fuzzers/specs/extract.mjs

`specs/surface.json` is committed so a run needs no extraction step: both legs read it at load,
and the seed corpus is written from the same specs.

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
| `server/` | The API surface: sequences of requests against the in-process server. |
| `server/src/fuzz.ts` | The Jazzer.js entry: cut the input into calls, send each, check, throw on a violation. |
| `specs/extract.mjs` | Reads penguin's route metadata, client endpoints and DTOs into `specs/surface.json`. |
| `specs/decode.ts` | The slot decoder both legs share: bytes → one named slot of a spec, by the slot's type. |
| `specs/server/main.ts` | The API leg's specs, built from `specs/surface.json` (routes, paths, body fields). |
| `specs/cli/main.ts` | The CLI leg's specs, built from the commander tree the CLI itself registers. |
| `server/src/input.ts` | One call's format (two control bytes, then payload) and body payload injection. |
| `server/src/invariants.ts` | The invariant checks, read off a second, read-only SQLite connection. |
| `server/src/harness.ts`, `server/src/assemble.ts` | The boot both legs share (`bootAppDeps` → `seedAdmin` → `createApp`). |
| `cli/` | The CLI surface: sequences of command lines, over the same harness. |
| `cli/src/fuzz.ts` | The Jazzer.js entry: cut the input into commands, run each, check its exit contract. |
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

Both targets read a **sequence of calls** out of the bytes they are handed:

    input := record (0x0a record)*

Each record is one call; the newline byte between records is the separator. That choice is what
gives libFuzzer's own mutations meaning on a sequence — inserting a newline adds a call, erasing
across one drops a call, copying a range or crossing two inputs splices calls together. A
length-prefixed format would give none of that: one changed length byte hands the rest of the
input to the wrong call. A record's choices come from its own payload only, so inserting a call
never shifts what the other calls mean. Empty records are dropped, and an input without a
newline is a sequence of one — every corpus entry written before this format still decodes.

API — `server/src/input.ts`, one record:

| Bytes | Meaning |
| --- | --- |
| 0 | endpoint index, modulo the table length |
| 1 | flags: bits 0-1 auth mode (anonymous / bearer / cookie), bit 2 bad body, bit 3 clock jump, bit 4 raw body |
| 2… | payload: choice bytes for the body and `:param` fills, and the text a body's last string field receives |

CLI — `cli/src/input.ts`, one record:

| Bytes | Meaning |
| --- | --- |
| 0 | command index, modulo the table length |
| 1 | flags: bit 0 bad variant |
| 2… | payload: choice bytes for the argv's slots, and the text a `-m`/`-t` value receives |

The tables are not schedules: a record's endpoint or command is its first byte, so a mutation
moves it, and libFuzzer keeps the inputs that reach new code. The payload lets a mutation reach a
string field (a title, a path, a task text) rather than only the choice of call.

A sequence is bounded: at most 8 calls on the API leg and 4 on the CLI leg, and no new call once
the input's time budget (6 s, 8 s) has gone by. The fuzzer's own watchdog stays a hard abort that
nothing should reach.

The seed step also writes `out/dict.txt`: two bytes per spec — the separator, then that spec's
index — which is the one mutation source that inserts a well-formed call instead of hoping a
random byte lands on the separator. `run.mjs` passes it as libFuzzer's `-dict`.

## What a run produces

Under the leg's own `out/` (ignored by git):

| File | Contents |
| --- | --- |
| `corpus/` | The seed inputs plus every input the fuzzer kept. |
| `run.log` | The fuzzer's console output, final statistics included. |
| `coverage/coverage-final.json` | The raw istanbul coverage Jazzer.js writes. |
| `coverage/coverage-summary.md` | Lines/statements/functions/branches, in total and per source file. |
| `summary.md` | The target's own account: requests or commands served, how many calls each input asked for, slow calls by name, status/exit buckets, distinct state signatures, outbound attempts. |
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
