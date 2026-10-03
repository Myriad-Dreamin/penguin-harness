# Telemetry probes

What each probe the performance panel lists tells you (PRFC-0008). Every section opens with the question the probe answers. A sample records numbers only — a duration, sizes, counts — and the names that say what was measured (a route pattern, a module, a status), never content. Durations are milliseconds; `memoryCost` and other sizes are bytes.

The "?" beside a probe's name in the panel shows the section's first sentence. The "Recorded at" line is kept current by `pnpm gen:probe-docs`, and its link opens the same commit as this page.

## Startup and hot update

Recorded once per App generation — at process start, after a hot push, and when a plugin change reassembles the App. What runs before telemetry is on is kept and recorded when the generation is created.

### boot.migrate

Is starting slow because of the database? The time to bring its schema up to date.

Recorded at [`packages/server/src/hmr/platform.ts:361`](../hmr/platform.ts#L361) <!-- probe-site -->

### plugin.load

Is starting slow because of one plugin? The time to import and check that plugin.

`attrs.plugin` names it; `status` is `error` when it failed and was left out. A plugin reused from the previous generation is not loaded again and not recorded.

Recorded at [`packages/server/src/hmr/platform.ts:461`](../hmr/platform.ts#L461) <!-- probe-site -->

### boot.plugins

How long did loading all plugins take? Every installed plugin together.

Recorded at [`packages/server/src/hmr/platform.ts:467`](../hmr/platform.ts#L467) <!-- probe-site -->

### boot.module

Is starting slow because of one part of the server? The time to create that module.

`attrs.module` names the module.

Recorded at [`packages/server/src/hmr/platform.ts:520`](../hmr/platform.ts#L520) <!-- probe-site -->

### boot.modules

How long did creating the server's parts take? Every module together.

Recorded at [`packages/server/src/hmr/platform.ts:524`](../hmr/platform.ts#L524) <!-- probe-site -->

### boot.create

How long until the App could serve? From the start of its creation until it was ready.

It spans the steps above and everything between them.

Recorded at [`packages/server/src/telemetry/boot.ts:84`](boot.ts#L84) <!-- probe-site -->

### boot.quiet

How long until everything was back after a start? The time until sessions were adopted and machines reconnected.

The App already serves while these run; a long one means machines or sessions came back late.

Recorded at [`packages/server/src/platform.ts:243`](../platform.ts#L243) <!-- probe-site -->

### hmr.park

Is a hot update slow to hand over? The time the previous generation took to set its state aside.

Keyed by the previous generation; recorded by the new one.

Recorded at [`packages/server/src/telemetry/boot.ts:89`](boot.ts#L89) <!-- probe-site -->

### hmr.dispose

Is a hot update slow to let go? The time the previous generation took to shut down.

Keyed by the previous generation, like `hmr.park`.

Recorded at [`packages/server/src/telemetry/boot.ts:91`](boot.ts#L91) <!-- probe-site -->

### hmr.generation

Why did this generation start? One sample per App creation.

`attrs.cause` is `boot`, `push` (a hot push) or `reassemble` (a plugin change).

Recorded at [`packages/server/src/telemetry/boot.ts:94`](boot.ts#L94) <!-- probe-site -->

### process.memory

How much memory does the server use? The process's total, as `attrs.memoryCost` in bytes.

Recorded after each creation and whenever telemetry is read. Read it across generations: a total that only grows with each hot push means an old generation was not let go.

Recorded at [`packages/server/src/telemetry/boot.ts:95`](boot.ts#L95) <!-- probe-site -->

### hmr.admit

Is a hot push slow to be accepted? The time the new generation took to answer its admission check.

`attrs.code` is the status it answered.

Recorded at [`packages/server/src/telemetry/boot.ts:119`](boot.ts#L119) <!-- probe-site -->

## Requests

### http.request

Which API calls are slow? The time to answer one HTTP request.

`attrs.method` and `attrs.route` name the call by its route pattern (never the path), `attrs.code` is the status, `attrs.requestBytes` the request's size and `bytes` the response's when it declares one. `keys.request` ties it to the samples recorded while it ran.

Recorded at [`packages/server/src/telemetry/http.ts:29`](http.ts#L29) <!-- probe-site -->

## Sessions

### sessions.list.sql

Is the sidebar's session list slow in the database? The time of its query.

`attrs.rows` is how many sessions it returned.

Recorded at [`packages/server/src/services/session-service.ts:438`](../services/session-service.ts#L438) <!-- probe-site -->

### sessions.list.reconcile

Is the session list slow because the Trace index is catching up? The time of that catch-up.

`attrs.traces` is how many Traces it found. Usually skipped; seeing it often means sessions keep arriving that the index has not seen.

Recorded at [`packages/server/src/services/session-service.ts:463`](../services/session-service.ts#L463) <!-- probe-site -->

### trace.reconcile

How long does bringing the Trace index up to date take? One pass, however many callers waited on it.

Recorded at [`packages/server/src/services/trace-index.ts:166`](../services/trace-index.ts#L166) <!-- probe-site -->

### trace.read

Is opening a session slow on disk? The time to read one Trace file.

`attrs.messages` is how many messages it held. Inside a `session.messages` read it carries that session.

Recorded at [`packages/server/src/services/trace-service.ts:356`](../services/trace-service.ts#L356) <!-- probe-site -->

### session.messages

Is opening a session slow on the server? The time to read the messages the page asked for.

`attrs.kind` is which part was asked for, `attrs.messages` how many came back. The Trace files it read are its `trace.read` samples.

Recorded at [`packages/server/src/services/trace-service.ts:642`](../services/trace-service.ts#L642) <!-- probe-site -->

### task.accept

Is sending a message slow to be accepted? The time from the send to the server's answer.

It includes waiting for the session's lock; `attrs.queued` is whether the message waited behind a running turn.

Recorded at [`packages/server/src/runtime/session-manager.ts:1179`](../runtime/session-manager.ts#L1179) <!-- probe-site -->

### session.load

Is a session slow to start working? The time to load one that was not in memory, its history included.

`attrs.messages` is how many history messages it was loaded with. A session already in memory is not recorded.

Recorded at [`packages/server/src/runtime/session-manager.ts:2099`](../runtime/session-manager.ts#L2099) <!-- probe-site -->

### session.memory

Which session uses the most memory? One sample per loaded session, as `attrs.memoryCost` in bytes.

It adds up what the session holds: the history it was loaded with, the recent events kept so a page that reconnects can catch up, and the replies still streaming. Recorded whenever telemetry is read.

Recorded at [`packages/server/src/runtime/session-manager.ts:956`](../runtime/session-manager.ts#L956) <!-- probe-site -->

## Machines

### machine.connect

Is connecting to a machine slow, or failing? The whole of one connection.

`keys.machine` is the machine; a failed one names `attrs.failedStep`.

Recorded at [`packages/server/src/machines/connect-stages.ts:65`](../machines/connect-stages.ts#L65) <!-- probe-site -->

### machine.connect.stage

Which step of connecting to a machine is slow? The time of one step.

`attrs.stage` is one of `probe`, `start-server`, `reprobe`, `hold`, `sync-models`, `sync-plugins`.

Recorded at [`packages/server/src/machines/connect-stages.ts:50`](../machines/connect-stages.ts#L50) <!-- probe-site -->

### machine.ssh.command

Is a machine slow to answer commands? The time of one command, from the ask to the answer.

`attrs.code` is its exit code; `status` is `timeout` when the machine never answered. The command's text is never recorded.

Recorded at [`packages/server/src/machines/transport/timings.ts:84`](../machines/transport/timings.ts#L84) <!-- probe-site -->

## Browser

Recorded by the page and sent to the server while telemetry is on. These open the commit the page was built from, which can differ from the server's after a hot push of the web alone.

### web.boot

Is the page slow to appear? The time until its first content was drawn.

`attrs.ttfbMs` is the time until the server's first byte arrived; if that is most of it, the wait is before the server answered. A page opened in the background counts the time it was hidden.

Recorded at [`packages/web/src/lib/perf/collector.ts:160`](../../../web/src/lib/perf/collector.ts#L160) <!-- probe-site -->

### web.longtasks

Does the page freeze? Main-thread blocks over 50 ms since the last report.

`durMs` is the total time blocked, `attrs.count` how many blocks, `attrs.maxMs` the longest.

Recorded at [`packages/web/src/lib/perf/collector.ts:228`](../../../web/src/lib/perf/collector.ts#L228) <!-- probe-site -->

### web.session.open

Is opening a session slow in the page? From the click to its history on screen.

`attrs.fetchMs` is how much of it was waiting for the server.

Recorded at [`packages/web/src/lib/perf/collector.ts:103`](../../../web/src/lib/perf/collector.ts#L103) <!-- probe-site -->

### web.turn

Is a reply slow to show up in the page? From its first streamed piece to its last on screen.

Recorded at [`packages/web/src/lib/perf/collector.ts:134`](../../../web/src/lib/perf/collector.ts#L134) <!-- probe-site -->

### web.sessions.fanout

Is the sidebar's session list slow to fill? One refresh of it.

`attrs.slowestMs` is its slowest request.

Recorded at [`packages/web/src/state/sessions.tsx:628`](../../../web/src/state/sessions.tsx#L628) <!-- probe-site -->

### web.socket.connect

Is the page slow to connect to the server? From opening its connection to the server's first message.

Recorded at [`packages/web/src/api/socket.ts:450`](../../../web/src/api/socket.ts#L450) <!-- probe-site -->
