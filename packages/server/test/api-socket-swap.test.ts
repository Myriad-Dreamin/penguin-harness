/**
 * The API socket across the two kinds of swap. A re-assembly (a plugin change) replaces the
 * inner App under the platform shell: the socket is the shell's, its calls resolve the App
 * of the moment, so it stays open and its next call enters the new App. A push replaces the
 * shell itself: the sockets are handed to the successor as one registry handle, which
 * closes them (1012) once it is up, and the browser's client comes back to it. Left open
 * across a push, a socket kept dispatching into the replaced shell — local routes still
 * answered, every call through a machine hung without a word.
 *
 * Through the window between one generation's dispose and the next generation's first
 * answer, the shell serves its open sockets from the `http` it captured while the tree was
 * alive: the old generation answers instead of every call turning into a request-time
 * error. The capture is re-taken at every boot the shell runs, so a window after a
 * re-assembly is answered by the generation that re-assembly landed.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { WebSocket } from "ws";
import type { Reassembly } from "../src/hmr/capabilities.js";
import { createTestApp, waitFor } from "./helpers.js";
import type { TestApp } from "./helpers.js";

/** The little of `ws` the socket protocol touches, with the frames and the close recorded. */
function fakeSocket() {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  const socket = {
    OPEN: 1,
    readyState: 1,
    bufferedAmount: 0,
    closed: null as { code: number; reason: string } | null,
    sent: [] as Record<string, unknown>[],
    on(event: string, fn: (...args: unknown[]) => void) {
      handlers.set(event, [...(handlers.get(event) ?? []), fn]);
      return socket;
    },
    once(event: string, fn: (...args: unknown[]) => void) {
      return socket.on(event, fn);
    },
    send(data: string) {
      socket.sent.push(JSON.parse(data) as Record<string, unknown>);
    },
    ping() {},
    terminate() {},
    close(code: number, reason: string) {
      socket.closed = { code, reason };
      socket.readyState = 3;
      for (const fn of handlers.get("close") ?? []) fn(code, reason);
    },
    /** The browser's frame, as the server's `message` listener receives it. */
    call(id: number, path: string) {
      const data = Buffer.from(JSON.stringify({ id, call: { method: "GET", path } }));
      for (const fn of handlers.get("message") ?? []) fn(data, false);
    },
  };
  return socket;
}

const REF = { id: "api-socket@admin", ownerUserId: "admin", apiSocket: true };
const URL_ = new URL("http://localhost:7364/api/terminals/api-socket%40admin/stream");

describe("the API socket across a swap", () => {
  let t: TestApp;
  afterEach(async () => {
    await t.cleanup();
  });

  it("stays open through a re-assembly, and its next call enters the re-assembled App", async () => {
    t = await createTestApp();
    const platform = await t.deps.hmr.ensure();
    const ws = fakeSocket();
    platform.api.attachStream(ws as unknown as WebSocket, REF as never, URL_, () => undefined);
    ws.call(1, "/api/projects");
    await waitFor(() => ws.sent.some((f) => f.id === 1));
    expect(ws.sent.find((f) => f.id === 1)?.status).toBe(200);

    const before = platform.api.business();
    const ok = await t.deps.tree.api<Reassembly>("RuntimeModule", "Reassembly").reassemble();
    expect(ok).toBe(true);
    expect(platform.api.business()).not.toBe(before);
    expect(ws.closed).toBeNull();
    ws.call(2, "/api/projects");
    await waitFor(() => ws.sent.some((f) => f.id === 2));
    expect(ws.sent.find((f) => f.id === 2)?.status).toBe(200);
  });

  it("is handed to the successor as a registry handle that closes it with 1012", async () => {
    t = await createTestApp();
    const platform = await t.deps.hmr.ensure();
    const ws = fakeSocket();
    platform.api.attachStream(ws as unknown as WebSocket, REF as never, URL_, () => undefined);
    const handle = t.deps.hmr.resources.claim<{ close(): void }>("apiSockets:open");
    expect(handle).toBeDefined();
    handle!.close();
    expect(ws.closed).toEqual({ code: 1012, reason: "the harness was updated; reconnect" });
    // A closed socket is off the shell's list: closing again touches nothing.
    handle!.close();
  });

  it("answers from the captured generation while the tree behind the call is disposed", async () => {
    t = await createTestApp();
    const platform = await t.deps.hmr.ensure();
    const ws = fakeSocket();
    platform.api.attachStream(ws as unknown as WebSocket, REF as never, URL_, () => undefined);
    ws.call(1, "/api/projects");
    await waitFor(() => ws.sent.some((f) => f.id === 1));
    expect(ws.sent.find((f) => f.id === 1)?.status).toBe(200);

    // The swap window, as the sockets a push replaces live it: the tree the shell
    // forwards to is disposed, and the shell keeps serving its open sockets through it.
    // The resolution into the disposed tree throws; the captured `http` answers instead,
    // so the window is served by the old generation rather than erroring per call.
    platform.dispose();
    ws.call(2, "/api/projects");
    await waitFor(() => ws.sent.some((f) => f.id === 2));
    const answer = ws.sent.find((f) => f.id === 2);
    expect(answer?.status).toBe(200);
    expect(answer?.error).toBeUndefined();
    expect(ws.closed).toBeNull();
  });

  it("a re-assembly refreshes the capture, and a disposed window is still answered", async () => {
    t = await createTestApp();
    const platform = await t.deps.hmr.ensure();
    const ws = fakeSocket();
    platform.api.attachStream(ws as unknown as WebSocket, REF as never, URL_, () => undefined);

    // The capture follows the App of the moment: a re-assembly that lands re-takes it,
    // so a window opened after the re-assembly is answered by that generation, not by
    // the one the shell first booted.
    const ok = await t.deps.tree.api<Reassembly>("RuntimeModule", "Reassembly").reassemble();
    expect(ok).toBe(true);
    platform.dispose();
    ws.call(3, "/api/projects");
    await waitFor(() => ws.sent.some((f) => f.id === 3));
    const answer = ws.sent.find((f) => f.id === 3);
    expect(answer?.status).toBe(200);
    expect(answer?.error).toBeUndefined();
    expect(ws.closed).toBeNull();
  });
});
