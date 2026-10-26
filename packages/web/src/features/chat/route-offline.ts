/**
 * What the server's own 503 says about a Session nobody can reach right now: which machine
 * holds it, by the alias a person recognises. The server puts both in the error's `details`
 * (machines/session-forward.ts) on every session-scoped request it cannot forward — the answer
 * is the same whichever endpoint asked.
 *
 * The cold path this serves: the Session's machine is offline, so the sidebar's list does not
 * carry the Session and the session-to-machine map has nothing for it — the page could not say
 * WHICH machine even though the server just said so. The chat page keeps this answer beside the
 * direct lookup's other outcomes: the offline note reads it (the alias, the machine's own
 * retry), and the lookup's effect reads it too — the Session is not gone, so it stays pending
 * and is looked up again once the machine is back (chat-page.tsx).
 */
import { ApiError } from "../../api/client";

/** The machine the server named as holding the Session. */
export interface OfflineMachine {
  /** The machine's id as every machine row carries it (`MachineInfo.machineId`). */
  machineId: string;
  /** The alias the server sent, when it sent one: the name a person recognises. */
  alias: string | null;
  /** The server's own sentence, for the fold under the note. */
  message: string;
}

/**
 * The machine a failed lookup named, or null when it named none: a cause that is not the
 * server's 503 (another failure, a machine that refused, the network), a 503 without details,
 * or details without a machine id in them.
 */
export function offlineMachineOf(cause: unknown): OfflineMachine | null {
  if (!(cause instanceof ApiError)) return null;
  if (cause.status !== 503 || cause.code !== "not_connected") return null;
  const details = cause.details;
  if (details === undefined) return null;
  const machineId = details.machineId;
  if (typeof machineId !== "string" || machineId === "") return null;
  const alias = details.alias;
  return {
    machineId,
    alias: typeof alias === "string" && alias !== "" ? alias : null,
    message: cause.message,
  };
}
