/**
 * One loopback endpoint per machine and port, shared by everything that speaks to a machine's
 * server: the request proxy, the API client, the terminal relay and the aggregate event stream.
 *
 * This is `Sys.forward` held to its word. A machine's forward is a listener on this side whose
 * every accepted connection is one channel inside the ssh session — so once it exists, that
 * machine's server IS a local address, and the callers above use node:http and `ws` against it
 * exactly as they would against any other server. Nothing dials SOCKS itself, and nothing keeps
 * a socket of its own to the machine's API socket; the session carries what the callers send.
 *
 * One forward is kept while the machine is connected to that port: opening one per request
 * would cost a listener and a channel per request, and closing it between requests would make
 * every keystroke in a terminal stream a fresh handshake. The table is dropped when the
 * machine's connection is (a session that dropped, a disconnect, a port that changed), so a
 * forward never outlives what it reaches.
 */
import type { ForwardedPort } from "@prismshadow/penguin-core/sys";

/** Where a machine's server answers on this side. */
export interface ForwardEndpoint {
  host: string;
  port: number;
}

/** Opens a forward to `port` on the machine at `address`; null when there is no session to ride. */
export type ForwardFactory = (address: string, port: number) => Promise<ForwardedPort | null>;

export class MachineForwards {
  /** By `address port`, as the promise that will answer the endpoint — one dial, not a race. */
  readonly #open = new Map<string, Promise<ForwardedPort | null>>();
  #closed = false;

  constructor(private readonly open: ForwardFactory) {}

  /**
   * The endpoint for a machine's port, opened on first use. Null when it cannot be opened (no
   * session, a refused dial) — the caller answers "not connected" rather than retrying behind
   * the machine's back.
   */
  async endpoint(address: string, port: number): Promise<ForwardEndpoint | null> {
    if (this.#closed) return null;
    const key = `${address}\u0000${port}`;
    let pending = this.#open.get(key);
    if (pending === undefined) {
      pending = this.open(address, port).catch(() => null);
      this.#open.set(key, pending);
    }
    const forward = await pending;
    if (forward === null) {
      // A dial that failed is not remembered: the next caller asks again (the transport may
      // have its session back by then).
      if (this.#open.get(key) === pending) this.#open.delete(key);
      return null;
    }
    return { host: forward.host, port: forward.port };
  }

  /** Closes every forward to one machine — its connection was dropped, or its port changed. */
  async drop(address: string): Promise<void> {
    const keys = [...this.#open.keys()].filter((key) => key.startsWith(`${address}\u0000`));
    await Promise.all(keys.map((key) => this.#close(key)));
  }

  /** Closes everything: this generation is on its way out. */
  async closeAll(): Promise<void> {
    this.#closed = true;
    await Promise.all([...this.#open.keys()].map((key) => this.#close(key)));
  }

  async #close(key: string): Promise<void> {
    const pending = this.#open.get(key);
    if (pending === undefined) return;
    this.#open.delete(key);
    const forward = await pending.catch(() => null);
    await forward?.close().catch(() => undefined);
  }
}
