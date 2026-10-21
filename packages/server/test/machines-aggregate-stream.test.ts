/**
 * The machines aggregate stream (`/api/projects/:projectId/machines/events`) with no hub
 * behind it: each watched machine's own `/api/events` is read as one streaming call on that
 * machine's API socket through its forward (machines/machine-socket.ts,
 * machines/aggregate-stream.ts), and every event it carries is re-tagged as `machine_event`
 * with the machine it came from.
 *
 * What this pins:
 * - ONE response for the tab, carrying every machine's events tagged with its id and given an
 *   id of this stream's own — the whole point of the aggregate, whatever the machine count.
 * - Each machine's call resumes with THAT MACHINE'S last event id when its socket drops; one
 *   machine's cut is not the other's.
 * - A stream re-issued with a last event id is answered `resync_required`: this layer keeps no
 *   buffer to replay from, so it says so rather than pretending nothing was missed.
 * - A machine connected after the tab opened joins on the stream's beat, and one that leaves
 *   is detached.
 *
 * The machines are real WebSocket servers on loopback, standing in for the forward's endpoint:
 * the handshake records the cookie and Host the appliance insists on, and each call frame is
 * answered the way a machine's `/api/socket` answers one (socket/frames.ts).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import type { SseEvent } from "../src/socket/sse-text.js";
import { SseParser } from "./helpers/sse-parser.js";
import { machineEventsStream } from "../src/machines/aggregate-stream.js";
import type { WatchedMachine } from "../src/machines/aggregate-stream.js";

/** One streaming call a fake machine opened, as the machine saw it. */
interface FakeCall {
  /** The path the call named. */
  path: string;
  /** The headers the call frame carried — where a resume point rides. */
  headers: Record<string, string>;
}

/** One machine's stand-in: records its handshakes and calls, and writes what a test says. */
interface FakeMachine {
  port: number;
  /** The upgrade's own headers, one per `/api/socket` handshake, in order. */
  handshakes: http.IncomingHttpHeaders[];
  /** Every streaming call opened on those sockets, in order. */
  calls: FakeCall[];
  /** How many `/api/events` streams are open right now. */
  readers(): number;
  /** Writes one event to every open stream. */
  push(id: string, event: string, data: string): void;
  /** Ends every open stream, as a restarted machine would. */
  cut(): void;
}

const stops: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const stop of stops.splice(0).reverse()) await stop();
});

function machine(): Promise<FakeMachine> {
  const handshakes: http.IncomingHttpHeaders[] = [];
  const calls: FakeCall[] = [];
  /** The open streams, with the id of the call each one answers. */
  const open = new Map<WebSocket, number>();
  const server = http.createServer();
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    handshakes.push(req.headers);
    ws.on("message", (raw, isBinary) => {
      if (isBinary) return;
      const frame = JSON.parse(raw.toString()) as {
        id: number;
        call?: { path: string; headers?: Record<string, string> };
      };
      if (frame.call === undefined) return;
      const call: FakeCall = { path: frame.call.path, headers: frame.call.headers ?? {} };
      calls.push(call);
      if (call.path !== "/api/events") {
        ws.send(JSON.stringify({ id: frame.id, status: 404, headers: {}, body: null }));
        return;
      }
      open.set(ws, frame.id);
      ws.on("close", () => open.delete(ws));
      ws.send(
        JSON.stringify({
          id: frame.id,
          status: 200,
          stream: true,
          headers: { "content-type": "text/event-stream" },
        }),
      );
    });
    ws.on("close", () => open.delete(ws));
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      stops.push(
        () =>
          new Promise<void>((done) => {
            for (const ws of open.keys()) ws.terminate();
            open.clear();
            for (const client of wss.clients) client.terminate();
            wss.close();
            server.closeAllConnections();
            server.close(() => done());
          }),
      );
      resolve({
        port,
        handshakes,
        calls,
        readers: () => open.size,
        push: (id, event, data) => {
          for (const [ws, callId] of open) {
            ws.send(JSON.stringify({ id: callId, event, eventId: id, data }));
          }
        },
        cut: () => {
          for (const ws of open.keys()) ws.terminate();
          open.clear();
        },
      });
    });
  });
}

/** The aggregate as a tab reads it: the events it carried, in order, and a way to close it. */
interface Aggregate {
  events: SseEvent[];
  close(): void;
}

function open(
  watched: () => readonly WatchedMachine[],
  options: { lastEventId?: string; heartbeatMs?: number } = {},
): Aggregate {
  const events: SseEvent[] = [];
  const response = machineEventsStream(watched, options.lastEventId ?? null, () => undefined, {
    heartbeatMs: options.heartbeatMs ?? 20,
    retryMs: { first: 5, max: 20 },
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        for (const event of parser.feed(decoder.decode(value))) events.push(event);
      }
    } catch {
      // A stream ended by the test: nothing more to read.
    }
  })();
  return {
    events,
    close: () => {
      void reader.cancel().catch(() => undefined);
    },
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits for `predicate`, giving up after `attempts` × 5 ms. */
async function settle(predicate: () => boolean, attempts = 200): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return;
    await sleep(5);
  }
}

const target = (machine: FakeMachine) => async () => ({
  host: "127.0.0.1",
  port: machine.port,
  remotePort: 7364,
  cookie: "penguin_session=x",
});

type MachineEventData = { machineId: string; event: { type: string } };

describe("the machines aggregate, over each machine's own socket", () => {
  it("carries every machine's events on one response, tagged and id'd by this stream", async () => {
    const [a, b] = await Promise.all([machine(), machine()]);
    const watched = (): WatchedMachine[] => [
      { machineId: "mA", target: target(a) },
      { machineId: "mB", target: target(b) },
    ];
    const aggregate = open(watched);
    stops.push(async () => aggregate.close());

    await settle(() => a.readers() === 1 && b.readers() === 1);
    // The handshake, as on /api/events.
    expect(aggregate.events[0]).toEqual({
      id: null,
      event: "server_event",
      data: '{"type":"hello"}',
    });
    a.push("a-1", "server_event", '{"type":"machines_changed"}');
    b.push("b-1", "server_event", '{"type":"machines_changed"}');
    await settle(() => aggregate.events.filter((e) => e.event === "machine_event").length === 2);

    const machines = aggregate.events.filter((event) => event.event === "machine_event");
    expect(machines.map((event) => (JSON.parse(event.data) as MachineEventData).machineId)).toEqual(
      ["mA", "mB"],
    );
    for (const event of machines) {
      // This stream's own id: the machine's own (`a-1`, `b-1`) is what its reader resumes with,
      // and a tab's reconnect goes back to this server, not to five machines.
      expect(event.id).toMatch(/^m[AB]:\d+$/);
      expect((JSON.parse(event.data) as MachineEventData).event.type).toBe("machines_changed");
    }
    // The API socket's own handshake, over the forward: the session cookie, and the Host the
    // machine's App insists on (its own port over there, not the forward's).
    expect(a.handshakes[0]?.cookie).toBe("penguin_session=x");
    expect(a.handshakes[0]?.host).toBe("localhost:7364");
    // And the call is what marks the answer a stream (socket/frames.ts, CALL_HEADERS).
    expect(a.calls[0]?.path).toBe("/api/events");
    expect(a.calls[0]?.headers.accept).toBe("text/event-stream");
  });

  it("resumes each machine with ITS last event id, and only that one", async () => {
    const [a, b] = await Promise.all([machine(), machine()]);
    const watched = (): WatchedMachine[] => [
      { machineId: "mA", target: target(a) },
      { machineId: "mB", target: target(b) },
    ];
    const aggregate = open(watched);
    stops.push(async () => aggregate.close());

    await settle(() => a.readers() === 1 && b.readers() === 1);
    a.push("a-1", "server_event", '{"type":"hello"}');
    await settle(() => aggregate.events.some((event) => event.event === "machine_event"));
    // The machine restarts under its reader.
    a.cut();
    await settle(() => a.calls.length === 2);

    expect(a.calls[1]?.headers["last-event-id"]).toBe("a-1");
    // The other machine was not touched: its own stream never dropped.
    expect(b.calls).toHaveLength(1);
  });

  it("answers a re-issued stream with resync_required — it keeps no buffer to replay", async () => {
    const a = await machine();
    const aggregate = open(() => [{ machineId: "mA", target: target(a) }], {
      lastEventId: "mA:7",
    });
    stops.push(async () => aggregate.close());

    await settle(() => aggregate.events.length >= 1);
    expect(aggregate.events[0]).toEqual({
      id: null,
      event: "server_event",
      data: '{"type":"resync_required"}',
    });
    // Each machine is still read from scratch: the resync is the tab re-reading, not a replay.
    await settle(() => a.calls.length === 1);
    expect(a.calls[0]?.headers["last-event-id"]).toBeUndefined();
  });

  it("attaches a machine connected later, and detaches one that goes away", async () => {
    const a = await machine();
    const b = await machine();
    let connectedB = false;
    let watchesB = true;
    const watched = (): WatchedMachine[] => [
      { machineId: "mA", target: target(a) },
      ...(watchesB
        ? [
            {
              machineId: "mB",
              target: async () => (connectedB ? target(b)() : null),
            },
          ]
        : []),
    ];
    const aggregate = open(watched, { heartbeatMs: 10 });
    stops.push(async () => aggregate.close());

    await settle(() => a.readers() === 1);
    // B is watched but not connected: nothing is dialled for it.
    await sleep(40);
    expect(b.calls).toHaveLength(0);

    connectedB = true;
    await settle(() => b.readers() === 1);
    b.push("b-1", "server_event", '{"type":"hello"}');
    await settle(() => aggregate.events.some((event) => event.event === "machine_event"));

    // B leaves the Project: its socket is closed and the machine asked nothing further.
    watchesB = false;
    await settle(() => b.readers() === 0);
    const asked = b.calls.length;
    await sleep(40);
    expect(b.calls).toHaveLength(asked);
  });
});
