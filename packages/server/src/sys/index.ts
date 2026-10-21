/**
 * The Sys capability interface's implementations on this server: the world the harness
 * process itself runs in, a machine reached over ssh, and running a server program on any Sys.
 *
 * The interface itself (shapes only) lives in core, at `@prismshadow/penguin-core/sys`; this
 * subpath is where the implementations live because this is where they run. Each provider is
 * one of these, side by side: `host.ts` is the default world, `ssh/` is the one behind a
 * machine's ssh session — not a part of the machine feature that uses it.
 */
export { HostSys, createSys, hostFs } from "./host.js";
export { createSshSys } from "./ssh/index.js";
export type { SshSysOptions, SshSysTransport } from "./ssh/index.js";
export { runServer, parsePortAnnouncement } from "./run-server.js";
export type { RunServerOptions, ServerProgramItem, ServerRun } from "./run-server.js";
export { installOverSys } from "./install.js";
export type { InstallOverSysOptions, InstalledServer } from "./install.js";
