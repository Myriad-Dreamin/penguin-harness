# One Sys interface behind the sandbox, the machines and the cloud computers

- **Date:** 2026-10-20
- **Type:** feature
- **Scope:** `core`, `server`, `desktop`

[中文版](2026-10-20-unified-sys-interface.zh.md)

The places work happens — this host, a sandbox, a machine, a cloud computer — each carried its own bespoke abstraction: the file tools worked through their port, the sandbox rewrote an exec argv, the machines carried a transport and a command set. One capability interface now stands behind all of them: `Sys`, a world whose capabilities are each optional — files (`fs`), command execution (`exec`), network endpoints (`listen`) — reached through the `@prismshadow/penguin-core/sys` subpath, which carries the shapes only.

## The interface

- `Fs` is the surface the file tools already work through (stat facts, whole and ranged reads, atomic writes, a fetch) plus `copyFile`, the one primitive laying a program into a world needs, and the `sandboxed` marker that tells error wording whether a refusal is a confinement.
- `Exec` runs one argv — never a shell string — with streams, an awaited exit and a kill; `Listen` opens an endpoint (port 0 asks the provider to pick) and reaches one. A Sys states what it can do by carrying the member and what it cannot by leaving it out; every caller that needs an absent capability throws `SYS_CAPABILITY_ABSENT`, naming the capability, instead of quietly rerunning somewhere else. The interface grows by adding optional members.
- Nothing but the error factory is emitted at run time: the implementations live where they run, so a package that only speaks to a Sys compiles against the contract without dragging a runtime along.

## The host and a server on a Sys

- `HostSys` (`createSys()`, `@prismshadow/penguin-server/sys`) is the host's default world — this process's files (the file tools' in-process port plus a whole-file copy), this process's children, this host's loopback. It is the default, not a base class: other providers implement the same interface beside it.
- `runServer(sys, port)` lays a program (files, and directories recursively) into a world through `sys.fs.copyFile` — the bundle, its native modules, the web dist, and the `package.json` and plugin packages a packaged app carries, which is the library the server resolves at boot — then starts its entry under the environment the server's own entry point reads (`HOST`, `PORT`, `PENGUIN_HOME`, `PENGUIN_PORT_FILE`) and reads the port from the announcement file — the last step of the server's startup, so a port means the App is up. `PORT=0` asks the OS, and the announced number is the answer. A stale announcement is emptied before the start, and a program that dies first rejects with its own last output.
- What `runServer` returns is that server's shell on that world: `exec` with the data root as `PENGUIN_HOME`, and `installPlugin`, which drives the world's own `penguin` CLI against the server's loopback address. No password is needed there: the server writes its local API token into the data root at boot (`<root>/api-token`), the machine-local admin credential the CLI already uses on any host.
- The desktop shell starts its embedded server with a `HostSys` and reads the port announcement through `sys.fs`, so the shell and a provider share one way of reaching the server.

## Tests

- Core pins the contract: the fail-closed error, a world with none, one or all capabilities, and that the subpath ships only the shapes and the error factory.
- The server drives the real things: the host's file round trip and copy, exact-argv execution with streams, exit codes, kills and a missing program, loopback listen/connect and their close/abort contract; and `runServer` against a stub server program (tree copy, port announcement, stale announcement, an entry that dies, plugin install through a stub CLI, and its refusals).
