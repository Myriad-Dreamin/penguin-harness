/**
 * The keep-alive http.Agent for one port on one machine: every socket it holds is a channel
 * dialled through the machine's ssh session (socks.ts), and an idle one is kept for the next
 * request instead of being closed after each answer. A fresh channel costs a round trip of its
 * own before the request can leave, so on a slow link a closed-after-use connection doubles
 * every forwarded call (proxy.ts).
 *
 * A KEPT SOCKET BELONGS TO THE SESSION IT WAS DIALLED THROUGH. When the transport reopens the
 * session — a drop, a reconnect, a close and a later open — the channels of the old one are
 * dead whether or not their close has reached this process yet, and none of them may carry
 * another request: `retire()` destroys every socket tagged with a session other than the one
 * up now, and the caller runs it each time it hands the agent out. This is the same rule the
 * API socket cache keeps (machines/machine-sockets.ts), for the same reason.
 *
 * Cancellation is unchanged by keeping sockets: a forward that is given up on destroys its
 * request, and node:http never returns a destroyed socket to the pool.
 */
import http from "node:http";
import type net from "node:net";

/** A channel to the machine and the ssh session (its pid) it rides. */
export interface SessionDial {
  socket: net.Socket;
  session: number;
}

export class SessionAgent {
  readonly agent: http.Agent;
  /** Every socket the agent holds, idle or busy, by the session it was dialled through. */
  readonly #sessions = new Map<net.Socket, number>();

  constructor(dial: () => Promise<SessionDial>) {
    // How long an idle socket is kept is the machine's to say: node honours the server's
    // `Keep-Alive: timeout=` hint and lets go a second early, so a request is not sent down a
    // socket the far side is closing.
    this.agent = new http.Agent({ keepAlive: true });
    // createConnection is documented on Agent (and overridable); the typings omit it.
    (this.agent as unknown as { createConnection: unknown }).createConnection = (
      _options: unknown,
      callback: (err: Error | null, socket?: net.Socket) => void,
    ) => {
      dial().then(
        ({ socket, session }) => {
          this.#sessions.set(socket, session);
          socket.once("close", () => this.#sessions.delete(socket));
          callback(null, socket);
        },
        (err: unknown) => callback(err instanceof Error ? err : new Error(String(err))),
      );
    };
  }

  /** Destroys every socket dialled through a session other than `current` (null: none is up). */
  retire(current: number | null): void {
    for (const [socket, session] of this.#sessions) {
      if (session !== current) socket.destroy();
    }
  }

  /** Lets go of every socket, idle or busy. */
  destroy(): void {
    this.agent.destroy();
  }
}
