# Telemetry probes

Every probe the performance panel lists (PRFC-0008), what one sample of it measures, and the line that records it. A sample records shape only — durations, sizes, counts, a status — never content. Durations are milliseconds.

Each section opens with a one-sentence summary; the panel shows that sentence behind the "?" beside the probe's name. The "Recorded at" line is kept current by `pnpm gen:probe-docs`, and its link opens the same commit as this page.

## Startup and hot update

These are recorded once per App generation: at process start, after a hot push, and when a plugin change reassembles the App. A probe that runs before telemetry is on is kept and recorded when the generation is created.

### boot.migrate

Time to bring the database schema up to date when the platform boots.

A pushed platform carries its own migrations; this is how long applying them took. Migrations deferred to the runtime's next restart are not included.

Recorded at [`packages/server/src/hmr/platform.ts:405`](../hmr/platform.ts#L405) <!-- probe-site -->

### plugin.load

Time for one step of loading one plugin at boot.

`attrs.step` names the step and `attrs.plugin` the plugin; `status` is `error` when the step failed and the plugin was left out.

Recorded at [`packages/server/src/hmr/platform.ts:505`](../hmr/platform.ts#L505) <!-- probe-site -->

### boot.plugins

Time to load every installed plugin at boot, all steps together.

Recorded at [`packages/server/src/hmr/platform.ts:511`](../hmr/platform.ts#L511) <!-- probe-site -->

### boot.module

Time to create one module of the server's module tree.

`attrs.module` names the module. A slow one here is a module whose constructor or start does real work before the App can serve.

Recorded at [`packages/server/src/hmr/platform.ts:564`](../hmr/platform.ts#L564) <!-- probe-site -->

### boot.modules

Time to create the whole module tree, every module together.

Recorded at [`packages/server/src/hmr/platform.ts:568`](../hmr/platform.ts#L568) <!-- probe-site -->

### boot.create

Time from the start of the App's creation to the point it can serve.

This spans the steps above (migrations, plugins, modules) plus everything between them.

Recorded at [`packages/server/src/hmr/platform.ts:684`](../hmr/platform.ts#L684) <!-- probe-site -->

### boot.quiet

Time after boot until the background sweeps settle: session adoption and machine reconnection.

The App already serves while these run; a long one means machines or adopted sessions come back late.

Recorded at [`packages/server/src/platform.ts:248`](../platform.ts#L248) <!-- probe-site -->

### hmr.park

Time the previous generation spent parking its state for a hot update.

Keyed by the previous generation (`keys.generation`). Recorded by the new generation, because the old one's buffer went with it.

Recorded at [`packages/server/src/hmr/platform.ts:690`](../hmr/platform.ts#L690) <!-- probe-site -->

### hmr.dispose

Time the previous generation took to shut down after a hot update.

Keyed by the previous generation, like `hmr.park`.

Recorded at [`packages/server/src/hmr/platform.ts:693`](../hmr/platform.ts#L693) <!-- probe-site -->

### hmr.generation

One App generation was created: why, and how many times this bundle has been created in this process.

`n` is the generation number. `attrs.cause` is `boot`, `push` or `reassemble`; `attrs.creates` counts creates of the same bundle, and `attrs.repeat` is true when the same build was created again (a repeated push).

Recorded at [`packages/server/src/hmr/platform.ts:697`](../hmr/platform.ts#L697) <!-- probe-site -->

### process.memory

The process's memory right after a generation was created.

`bytes` is the resident set size; `attrs` carries `heapUsed`, `heapTotal` and `external`. Read it across generations: memory that only grows with each push is a generation that is not let go.

Recorded at [`packages/server/src/hmr/platform.ts:703`](../hmr/platform.ts#L703) <!-- probe-site -->

### hmr.admit

Time the new generation took to answer a hot push's admission check.

This is the first request a pushed generation receives, before it is swapped in; `attrs.code` is the status it answered.

Recorded at [`packages/server/src/hmr/platform.ts:728`](../hmr/platform.ts#L728) <!-- probe-site -->

## Requests

### http.request

Time to answer one HTTP request, from arrival to the response being handed back.

`attrs.method` and `attrs.route` name the route by its pattern (never the path), `attrs.code` is the status, `bytes` the response size — counted as it is written for a streamed answer — and `attrs.requestBytes` the request body. `keys.request` is the request id the page sends, so a slow page action can be matched to its request.

Recorded at [`packages/server/src/http/app.ts:240`](../http/app.ts#L240) <!-- probe-site -->

## Sessions and turns

### sessions.list.sql

Time for the session list's database query for one Agent.

`n` is the number of rows it returned. One of three segments of a session-list read, with `sessions.list.reconcile` and `sessions.list.rows`.

Recorded at [`packages/server/src/services/session-service.ts:447`](../services/session-service.ts#L447) <!-- probe-site -->

### sessions.list.reconcile

Time to reconcile the Trace index while listing sessions, when some rows are not classified yet.

`n` is the number of Traces found. In the steady state this pass is skipped; seeing it often means rows keep arriving unclassified.

Recorded at [`packages/server/src/services/session-service.ts:467`](../services/session-service.ts#L467) <!-- probe-site -->

### sessions.list.rows

Time to turn the session list's rows into the entries the page receives.

`n` is the number of rows classified or converted.

Recorded at [`packages/server/src/services/session-service.ts:491`](../services/session-service.ts#L491) <!-- probe-site -->

### trace.reconcile

Time for one pass that brings the Trace index up to date with the files on disk.

`status` is `led` for the call that ran the pass and `shared` for a call that waited on a pass already running; `attrs.force` is true for a forced pass.

Recorded at [`packages/server/src/services/trace-index.ts:179`](../services/trace-index.ts#L179) <!-- probe-site -->

### trace.read

Time to read one Trace file from disk.

`n` is the number of messages read and `bytes` the file size. `attrs.shard` is a hash of the file's path, never the path itself. Inside a `session.messages` read it carries that session's key.

Recorded at [`packages/server/src/services/trace-service.ts:378`](../services/trace-service.ts#L378) <!-- probe-site -->

### session.messages

Time to read one window of a session's messages for the page.

`n` is the number of messages returned and `bytes` what was read from disk; `attrs.shards` counts the Trace files read, `attrs.kind` says which window was asked for and `attrs.reachesEnd` whether it reached the newest message.

Recorded at [`packages/server/src/services/trace-service.ts:675`](../services/trace-service.ts#L675) <!-- probe-site -->

### task.accept

Time to accept a message sent to a session, from the call to its answer.

`attrs.lockMs` is the share spent waiting for the session's lock and `attrs.queued` whether the message was queued behind a running turn.

Recorded at [`packages/server/src/runtime/session-manager.ts:1184`](../runtime/session-manager.ts#L1184) <!-- probe-site -->

### session.ensure

Time to get a session ready to run: found in memory, loaded, or reloaded.

`attrs.outcome` is `hit` (already in memory), `load`, or `reload` (built before the Agent's last configuration change); a load adds `attrs.loadMs`, and `n` is the number of history messages the session was resumed with.

Recorded at [`packages/server/src/runtime/session-manager.ts:2094`](../runtime/session-manager.ts#L2094) <!-- probe-site -->

### turn.badge

Time to publish one change of a session's state: the list badge and the task state together.

`attrs.state` is the state published.

Recorded at [`packages/server/src/runtime/session-manager.ts:2598`](../runtime/session-manager.ts#L2598) <!-- probe-site -->

### turn.run

The whole of one turn on the server, with the model's share of it.

`n` is the number of streamed messages. `attrs.modelMs` is the time between the model requests' begin and end, `attrs.requests` their count, and `attrs.serverMs` the sum of the `turn.*` segments. What remains is the engine's own time: tool calls, MCP, Trace writes.

Recorded at [`packages/server/src/telemetry/turn.ts:95`](turn.ts#L95) <!-- probe-site -->

### turn.*

One segment of a turn's per-message work outside the model, summed over the turn.

The segments are `turn.tail` (the live tail), `turn.fanout` (publishing to the page's channel), `turn.errors` (the stream error watcher) and `turn.usage` (the usage recorder). `n` is how many messages the segment handled and `attrs.maxMs` the slowest one.

Recorded at [`packages/server/src/telemetry/turn.ts:102`](turn.ts#L102) <!-- probe-site -->

## Machines

### machine.connect

The whole of one connection to a machine, and how it ended.

`keys.machine` is the machine's address. `attrs.trigger` says what started it, and a failed one names `attrs.failedStep`.

Recorded at [`packages/server/src/machines/connect-stages.ts:69`](../machines/connect-stages.ts#L69) <!-- probe-site -->

### machine.connect.stage

Time for one stage of connecting to a machine.

`attrs.stage` is one of `probe`, `start-server`, `reprobe`, `hold`, `sync-models` and `sync-plugins`; a stage that is not needed is not run and not recorded.

Recorded at [`packages/server/src/machines/connect-stages.ts:54`](../machines/connect-stages.ts#L54) <!-- probe-site -->

### machine.ssh.open

Time to bring up an ssh session to a machine, until its first command came back.

`status` is `error` when the session went away before any command answered; `attrs.held` says whether it was the held connection.

Recorded at [`packages/server/src/machines/transport/ssh-session.ts:470`](../machines/transport/ssh-session.ts#L470) <!-- probe-site -->

### machine.ssh.command

Time to run one command on a machine over its ssh session.

`attrs.waitMs` is the time spent queued behind other commands, `attrs.code` the exit code, `attrs.inputBytes` what it carried on stdin and `attrs.opening` whether it brought the session up. `status` is `timeout` when the machine never answered. The command's text is never recorded.

Recorded at [`packages/server/src/machines/transport/ssh-session.ts:492`](../machines/transport/ssh-session.ts#L492) <!-- probe-site -->

### machine.socks.handshake

SOCKS handshakes to one machine over a short window, as one sample: the slowest, the count and the failures.

`durMs` is the slowest handshake, `n` the count, `attrs.errors` the failures, `attrs.totalMs` their sum and `attrs.windowMs` the window.

Recorded at [`packages/server/src/machines/transport/timings.ts:106`](../machines/transport/timings.ts#L106) <!-- probe-site -->

## Browser

Recorded by the page and sent to the server's buffer while telemetry is on. These open the commit the page was built from, which can differ from the server's after a hot push of the web alone.

### web.boot

Time from navigation to the page's first contentful paint.

`attrs` breaks it down: `ttfbMs` (first byte), `domInteractiveMs`, `dclMs`, `loadMs`, `entryMs` (the entry script downloaded), `entryToPaintMs` (from the entry script to the paint: parse, run, mount), `entryCached`, and the long tasks before the paint. A paint delayed because the tab was in the background counts the time it was hidden.

Recorded at [`packages/web/src/lib/perf/collector.ts:251`](../../../web/src/lib/perf/collector.ts#L251) <!-- probe-site -->

### web.longtasks

Main-thread tasks over 50 ms since the last report, as one sample.

`n` is the count, `durMs` the total blocking time (the part of each task over 50 ms) and `attrs.maxMs` the longest task.

Recorded at [`packages/web/src/lib/perf/collector.ts:333`](../../../web/src/lib/perf/collector.ts#L333) <!-- probe-site -->

### web.session.open

Time to open a session in the page, from the request to the first render of its history.

`attrs.fetchMs` is the history request; `commits`, `reduceMs`, `waitMs`, `renderMs` and their maxima split the rest between processing frames, waiting for the next render and rendering.

Recorded at [`packages/web/src/lib/perf/collector.ts:168`](../../../web/src/lib/perf/collector.ts#L168) <!-- probe-site -->

### web.turn

Time the page spent showing one turn, from its first streamed frame to its last render.

`n` is the number of frames; the attributes split the time like `web.session.open`'s.

Recorded at [`packages/web/src/lib/perf/collector.ts:184`](../../../web/src/lib/perf/collector.ts#L184) <!-- probe-site -->

### web.sessions.fanout

Time for one refresh of the sidebar's session list across every Agent and source.

`n` is the number of requests sent; `attrs.slowestMs` is the slowest of them, with the number of Agents, sources and sources that did not answer.

Recorded at [`packages/web/src/state/sessions.tsx:630`](../../../web/src/state/sessions.tsx#L630) <!-- probe-site -->

### web.socket.connect

Time from opening the page's API socket to its first message from the server.

`attrs.openMs` is the handshake alone, until the socket opened.

Recorded at [`packages/web/src/api/socket.ts:441`](../../../web/src/api/socket.ts#L441) <!-- probe-site -->
