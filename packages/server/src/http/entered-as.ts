/**
 * Who a request entered through `Http.fetchAs` was entered as (http/app.ts) — for the one
 * route group that authenticates on its own instead of behind the surface's gate: the
 * terminal routes (terminal/identity.ts), which also serve a bare kernel that has no gate.
 *
 * A request over the API socket carries no cookie: its user was established by the socket's
 * handshake, and `fetchAs` is told who that is. Keyed by the Request object the surface is
 * handed, which only server code holds — a frame's headers are whitelisted (socket/frames.ts),
 * so nothing a client sends can name a user here.
 */
const entered = new WeakMap<Request, string>();

/** Records that `request` is being entered as `userId`. */
export function markEnteredAs(request: Request, userId: string): void {
  entered.set(request, userId);
}

/** The user `request` was entered as, or undefined for a request that came in over HTTP. */
export function enteredAsOf(request: Request): string | undefined {
  return entered.get(request);
}
