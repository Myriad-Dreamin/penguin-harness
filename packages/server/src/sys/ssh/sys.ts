/**
 * A machine as a `Sys` — its `forward`, and nothing else.
 *
 * A machine's Penguin server is installed and started ON that machine; this side carries the
 * installer to it over the ssh session's command channel, and from then on everything that
 * matters there — its files, its processes, the Agents it runs — belongs to that server, which
 * this side reaches over its HTTP and socket APIs. So the one capability a machine carries is
 * `forward`: a loopback listener whose every accepted connection is one `direct-tcpip` channel
 * inside the session, so a caller dials `127.0.0.1:<port>` and never learns the machine's
 * address.
 *
 * `fs` and `exec` are deliberately absent — not unimplemented, but the wrong shape for this
 * world: a process started from here would not be one of the machine server's, and a file
 * written here would bypass the server that owns that data root. A caller that needs either
 * fails closed with `SYS_CAPABILITY_ABSENT`, which is the truth. A whole version still lands
 * there — through that server's own HMR stream of its API socket, not through the file tools.
 *
 * `HostSys` (`../host.ts`) is the default world and this is another one, beside it: the caller
 * picks a world before it starts working, and after that nothing above speaks ssh. A Windows
 * remote carries nothing at all (see `createSshSys`): its sshd hands commands to cmd.exe, there
 * is no shell to hold a session on, and without a session there is nothing to forward.
 */
import net from "node:net";
import type { Forward, ForwardedPort, Sys } from "@prismshadow/penguin-core/sys";

/**
 * What this provider needs of a machine: the transport's one dial — a TCP connection to
 * `127.0.0.1:<remotePort>` as seen from the machine. `SshConnection` is the real one; the shape
 * is separate so a test can hand a scripted transport instead of opening ssh.
 */
export interface SshSysTransport {
  dial(remotePort: number): Promise<net.Socket>;
}

export interface SshSysOptions {
  /**
   * What shell the machine's sshd hands us: `posix` for Linux and macOS, `cmd` for a default
   * Windows OpenSSH install. Only a POSIX one has a session to forward through; the provider
   * cares about the shell, not about the operating system's name.
   */
  shell: "posix" | "cmd";
}

/**
 * The machine as a Sys. A `cmd` shell answers `{}`: a caller that needs anything then fails
 * closed by name, which is the truth — no session, no forward.
 */
export function createSshSys(connection: SshSysTransport, opts: SshSysOptions): Sys {
  if (opts.shell === "cmd") return {};
  return { forward: sshForward(connection) };
}

function sshForward(connection: SshSysTransport): Forward {
  return {
    async forwardPort(port: number): Promise<ForwardedPort> {
      const live = new Set<net.Socket>();
      const server = net.createServer((socket) => {
        live.add(socket);
        socket.once("close", () => live.delete(socket));
        socket.on("error", () => socket.destroy());
        connection.dial(port).then(
          (remote) => {
            // The listener may have closed while the dial was in flight: that connection
            // belongs to a forward nobody can use any more, so it is dropped rather than
            // left open with no reader on either end.
            if (socket.destroyed) {
              remote.destroy();
              return;
            }
            remote.on("error", () => socket.destroy());
            remote.once("close", () => socket.destroy());
            socket.once("close", () => remote.destroy());
            socket.pipe(remote);
            remote.pipe(socket);
          },
          () => socket.destroy(),
        );
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("the forward did not bind a loopback port");
      }
      return {
        host: "127.0.0.1",
        port: address.port,
        close: async (): Promise<void> => {
          for (const socket of live) socket.destroy();
          await new Promise<void>((resolve) => server.close(() => resolve()));
        },
      };
    },
  };
}
