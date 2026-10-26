/**
 * What the server's 503 `not_connected` says about a Session it cannot reach
 * (features/chat/route-offline.ts): the machine holding it, by its alias — the answer the chat
 * page's offline note is built from when the sidebar's list cannot even name the Session.
 *
 * - The 503 a session-scoped read gets while its machine is down names the machine and its
 *   alias; both are kept, with the server's own sentence for the fold.
 * - An answer without an alias keeps the machine id; one without details, with another code,
 *   a 404, or a cause that is not the server's names nothing.
 */
import { describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { offlineMachineOf } from "../src/features/chat/route-offline";

/** The 503 the server answers for a session-scoped read while its machine is down. */
const OFFLINE_503 = new ApiError(
  503,
  "not_connected",
  "The machine holding session session-2026-10-25-06-01-37-896e1a10 is not connected.",
  undefined,
  { machineId: "5QR0DutzvjoAGspD", alias: "qa-once-20261025" },
);

describe("the server's offline answer for a Session", () => {
  it("keeps the machine the 503 names, with its alias and the server's sentence", () => {
    expect(offlineMachineOf(OFFLINE_503)).toEqual({
      machineId: "5QR0DutzvjoAGspD",
      alias: "qa-once-20261025",
      message: OFFLINE_503.message,
    });
  });

  it("keeps the machine when the server sent no alias", () => {
    const noAlias = new ApiError(503, "not_connected", "down", undefined, {
      machineId: "5QR0DutzvjoAGspD",
    });
    expect(offlineMachineOf(noAlias)).toEqual({
      machineId: "5QR0DutzvjoAGspD",
      alias: null,
      message: "down",
    });
  });

  it("names nothing for another answer, another status, or no machine in the details", () => {
    expect(offlineMachineOf(new ApiError(404, "session_not_found", "no such session"))).toBeNull();
    expect(
      offlineMachineOf(
        new ApiError(502, "machine_refused", "refused", undefined, {
          machineId: "5QR0DutzvjoAGspD",
        }),
      ),
    ).toBeNull();
    expect(offlineMachineOf(new ApiError(503, "not_connected", "no details"))).toBeNull();
    expect(
      offlineMachineOf(new ApiError(503, "not_connected", "no machine", undefined, {
        alias: "qa-once-20261025",
      })),
    ).toBeNull();
    expect(offlineMachineOf(new Error("the network"))).toBeNull();
    expect(offlineMachineOf(null)).toBeNull();
  });
});
