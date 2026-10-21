/**
 * What ssh connects to: the alias the user picked in `~/.ssh/config`, the account override,
 * and — when this server stores one — the password it signs in with.
 *
 * Nothing here resolves an alias: `~/.ssh/config` is ssh's to read, and every spawn is handed
 * the alias for exactly that reason. A target is also all the ssh layer needs to know about
 * whoever is above it — a machine, or anything else that reaches a host over ssh.
 */
export interface RemoteTarget {
  /** Alias as written in ~/.ssh/config — what the user picked. */
  alias: string;
  /** Login account. Empty means "whatever ssh resolves", i.e. no -o User override. */
  user: string;
  /**
   * Present when this host signs in with a password this server stores for its alias. The
   * password itself is not here: `read` fetches it at the moment a connection opens, and it
   * reaches ssh only through that child's environment (login.ts).
   */
  password?: PasswordLogin;
}

/** How a host that signs in with a password gets it to ssh. */
export interface PasswordLogin {
  /** The askpass helper: prints the password ssh's child environment carries. Holds no secret. */
  askpass: string;
  /** The stored password now; null when none is stored any more. */
  read: () => string | null;
}
