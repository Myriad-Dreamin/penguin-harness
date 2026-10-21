/**
 * The ssh layer's one door. Everything above it — the machine stack, the platform's terminal
 * adoption — takes what it needs from here; the modules behind it are private, pinned by
 * ssh-boundary.test.ts. Nothing in this layer imports `machines/`: a host is an alias, an
 * account, and maybe a password, and that is all this knows.
 *
 * THE STRUCTURE. One connection per address: an `ssh -T -D` session whose stdin carries the
 * commands, the scripts and the tarballs, and whose SOCKS port carries every TCP connection to
 * the host as a channel inside it. Not a budget: there is no count of open connections and no
 * number to tune, because there is nothing that could open a second one; a second ask waits
 * for the first. A caller — a probe, a boot sweep, an install — never brings a connection of
 * its own.
 *
 * How each ssh child signs in — keys, or a password this server stores — is login.ts's, and a
 * password refused once is not offered again until it is saved anew.
 */
export {
  SshConnection,
  closeAllConnections,
  closeConnectionTo,
  connectionTo,
} from "./connection.js";
export {
  SESSION_GROUP,
  SESSION_SHAPE_ID,
  SSH_SESSION_IFACE,
  attachSessionRegistry,
  heldSessionOf,
  onSessionChange,
  sessionOf,
  SshSession,
} from "./session.js";
export type { HeldSession, SessionListener, ShellSession } from "./session.js";
export { PASSWORD_ENV, forgetRefusal, passwordSignIn } from "./login.js";
export type { AskpassPlan } from "./login.js";
export { SshPasswords, passwordProblem } from "./passwords.js";
export { explainSshFailure, sshFailureText, sshRefusal } from "./failure.js";
export type { SshFailureReason, SshSignIn } from "./failure.js";
export {
  findHostBlock,
  machineIdentity,
  parseHostAliases,
  parseHostEntries,
  renderHostBlock,
  replaceHostBlock,
  sameHostEntry,
  validateHostEntry,
} from "./config.js";
export type { HostBlockFound, SshHostEntry, SshHostLines, SshHostProblem } from "./config.js";
export {
  appendHostBlock,
  listHostAliases,
  listHostEntries,
  readSshConfig,
  writeSshConfig,
} from "./hosts.js";
export { execFailureText } from "./spawn.js";
export type { ExecResult } from "./spawn.js";
export type { PasswordLogin, RemoteTarget } from "./target.js";
