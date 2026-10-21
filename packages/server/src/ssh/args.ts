/**
 * The ssh and scp argv this server hands the system binaries — built as arrays, so nothing on
 * this side interprets a quote, a space or a `$`.
 *
 * Two rules are encoded here:
 * - **Nothing is ever typed.** A GUI app has no terminal: an ssh that decides to ask for a
 *   password or a key passphrase would hang forever with nothing to type into. A host that
 *   signs in with keys runs in BatchMode, which turns any question into an immediate, readable
 *   failure. A host with a stored password signs in with that password and nothing else: ssh
 *   takes it from the askpass helper (login.ts), keys are not offered, and one wrong answer per
 *   method ends the attempt.
 * - **The user override rides the command line, never the config.** `-o User=…` selects the
 *   account for this connection; `~/.ssh/config` is read-only to us.
 */
import type { RemoteTarget } from "./target.js";

function connectionOptions(target: RemoteTarget): string[] {
  const user = target.user === "" ? [] : ["-o", `User=${target.user}`];
  if (target.password === undefined) {
    return ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", ...user];
  }
  // A password, and only a password: BatchMode would refuse to ask the helper, and an account
  // that locks after a few failures must not be offered keys or asked twice per method. Each
  // option is spelled even where it is ssh's default, because the command line wins over a
  // config that says otherwise (`Host *` with `BatchMode yes` or `PasswordAuthentication no`).
  // No X11 channel: older OpenSSH needs DISPLAY set to ask the helper at all.
  return [
    "-o",
    "BatchMode=no",
    "-o",
    "PreferredAuthentications=password,keyboard-interactive",
    "-o",
    "PubkeyAuthentication=no",
    "-o",
    "PasswordAuthentication=yes",
    "-o",
    "KbdInteractiveAuthentication=yes",
    "-o",
    "NumberOfPasswordPrompts=1",
    "-o",
    "ForwardX11=no",
    "-o",
    "ConnectTimeout=10",
    ...user,
  ];
}

/** `ssh <options> <alias> <remote command>`. */
export function sshArgs(target: RemoteTarget, remoteCommand: string): string[] {
  return [...connectionOptions(target), target.alias, remoteCommand];
}

/**
 * `scp <options> <files…> <alias>:<dir>`. The remote path is NOT quoted: current OpenSSH
 * transfers over SFTP, where the path is taken literally and quotes would become part of the
 * name. Scratch directories are chosen without quotes or shell metacharacters for that reason.
 */
export function scpArgs(target: RemoteTarget, localFiles: string[], remoteDir: string): string[] {
  return [...connectionOptions(target), ...localFiles, `${target.alias}:${remoteDir}`];
}

/**
 * `ssh -T -D 127.0.0.1:<port> <alias> sh` — the ONE connection to a host (session.ts). `-T`
 * because it is a command channel, not a terminal; `sh` rather than a login shell, so a
 * profile's banner cannot land in the first command's output; `-D` so the session doubles as a
 * SOCKS server on a loopback port of ours, through which every TCP connection to the host is a
 * channel inside this same session. ExitOnForwardFailure turns "local port taken" into an exit
 * instead of a session that silently cannot dial, and the keepalives surface a dead link
 * within a minute.
 */
export function sessionArgs(target: RemoteTarget, socksPort: number): string[] {
  if (!Number.isInteger(socksPort) || socksPort < 1 || socksPort > 65535) {
    throw new Error(`bad port ${socksPort}`);
  }
  return [
    ...connectionOptions(target),
    "-T",
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=4",
    "-D",
    `127.0.0.1:${socksPort}`,
    target.alias,
    "sh",
  ];
}
