/**
 * The CLI's hop to its server, in memory — this process's `net.Pipe`.
 *
 * The CLI leg runs both ends in one process, and until now it spoke to the harness's loopback
 * listener over a real socket. That is the faithful wire, but it is not a wire a *virtual*
 * clock can move through: for as long as an SSE subscription is open, the process holds a live
 * socket, "nothing is in flight" is never true, and the clock — which may only jump while the
 * process is durably blocked — never moves. Every wait then costs its full wall time again,
 * which is the whole thing the clock exists to avoid.
 *
 * So the global `fetch` answers this app's own URLs from `app.fetch()` instead. What the leg
 * still exercises is the product's own client: URL building, headers, the bearer token, status
 * handling, the SSE frame parser, `AbortController`. What it stops exercising is undici's
 * socket plumbing — third-party code, and the price synctest's own examples pay with
 * `net.Pipe`.
 *
 * Anything else goes to the `fetch` this shim replaced: the outbound guard's wrapper (see
 * guards.ts), which records and refuses every non-loopback target. The listener stays bound for
 * whatever reaches for a socket instead of the global `fetch`.
 */
import type { Hono } from "hono";
import type { AppEnv } from "../../../../packages/server/src/auth/middleware.js";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export interface FetchShim {
  /** How many requests were answered from memory (the ones the leg ran). */
  readonly served: number;
  uninstall(): void;
}

/** The error a fetch rejects with when its signal aborts before the response arrives. */
function aborted(signal: AbortSignal): Error {
  const error = signal.reason instanceof Error ? signal.reason : new Error("This operation was aborted");
  if (error.name === "Error") error.name = "AbortError";
  return error;
}

export function installFetchShim(
  app: Hono<AppEnv>,
  port: number,
  trace?: (line: string) => void,
): FetchShim {
  const saved = globalThis.fetch;
  let served = 0;

  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let parsed: URL | null = null;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    if (parsed === null || !LOOPBACK_HOSTS.has(parsed.hostname) || Number(parsed.port) !== port) {
      return saved(input, init);
    }
    const request =
      input instanceof Request
        ? init === undefined
          ? input
          : new Request(input, init)
        : new Request(parsed.href, init);
    const { signal } = request;
    if (signal.aborted) return Promise.reject(aborted(signal));
    served += 1;
    trace?.(`→ ${request.method} ${parsed.pathname}${parsed.search}`);
    // `env` is what the node adapter hands Hono (the incoming request, whose socket app.ts sets
    // an event stream's idle timeout on): there is no socket here, and app.ts reads it as
    // optional.
    const answered = Promise.resolve(app.fetch(request, undefined as never)) as Promise<Response>;
    return new Promise<Response>((resolve, reject) => {
      const onAbort = (): void => reject(aborted(signal));
      signal.addEventListener("abort", onAbort, { once: true });
      answered.then(
        (response) => {
          signal.removeEventListener("abort", onAbort);
          trace?.(`← ${response.status} ${parsed.pathname}`);
          resolve(response);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }) as typeof fetch;

  return {
    get served() {
      return served;
    },
    uninstall() {
      globalThis.fetch = saved;
    },
  };
}
