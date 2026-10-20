/**
 * The Sys capability interface — one world with optional capabilities (files, command
 * execution, network endpoints), as shapes only.
 *
 * Its own subpath (`@prismshadow/penguin-core/sys`) so a provider or a caller compiles
 * against the contract the same way the plugin contract is reached through `/plugin`; the
 * top-level entry keeps its existing names, and the implementations (the host default and
 * whatever providers follow) live where they run — the server's
 * `@prismshadow/penguin-server/sys`.
 */
export type {
  ConnectOptions,
  Exec,
  ExecExit,
  ExecOptions,
  ExecProcess,
  Fs,
  Listen,
  ListenOptions,
  Sys,
  SysCapability,
  SysCapabilityError,
  SysConnection,
  SysListener,
} from "./types.js";
export { SYS_CAPABILITY_ABSENT, sysCapabilityError } from "./types.js";
