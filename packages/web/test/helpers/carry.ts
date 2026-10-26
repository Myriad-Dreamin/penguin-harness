/**
 * One call, carried by the suite's own `fetch` and answered in the API socket's shape.
 *
 * The node suite has no WebSocket, and the app's calls all go over its socket now, so a suite
 * that wants the real apiFetch/apiRequest (and everything above them) needs something to carry
 * the call. This is that carrier: it makes the same request the HTTP transport used to make —
 * same credentials, same JSON body — against the `fetch` the test stubbed
 * (test/helpers/fetch.ts), and answers `{status, headers, body}` as a frame on the socket would.
 *
 * A body that is not JSON cannot ride a JSON frame. That is what the real socket says with 415
 * `unsupported_transport` for a download, and the client then fetches the same URL over HTTP —
 * so the test's handler sees that request twice, and the HTTP rules (a page instead of the
 * server, an empty answer) still apply to it.
 */
export interface CarriedAnswer {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export async function carryOverTestFetch(
  method: string,
  url: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<CarriedAnswer> {
  const response = await globalThis.fetch(url, {
    method,
    credentials: "same-origin",
    ...(opts.body !== undefined
      ? {
          headers: { "Content-Type": "application/json", ...opts.headers },
          body: JSON.stringify(opts.body),
        }
      : opts.headers !== undefined
        ? { headers: opts.headers }
        : {}),
  });
  const headers = Object.fromEntries(response.headers.entries());
  if (response.status === 204) return { status: 204, headers, body: null };
  const text = await response.text();
  const type = (response.headers.get("content-type") ?? "").split(";")[0]!.trim();
  if (text === "" || type !== "application/json") return { status: 415, headers: {}, body: null };
  try {
    return { status: response.status, headers, body: JSON.parse(text) as unknown };
  } catch {
    return { status: 415, headers: {}, body: null };
  }
}
