/**
 * Finding the terminal an open surface shows, and starting that lookup before the view needs it.
 *
 * Attaching a surface Session's terminal takes two reads in a row — the surface's state (which
 * terminal), then the terminal itself — and on a Session that lives on another machine each is a
 * round trip through this server's connection to it. A host that knows which Session it is about
 * to show (the session dialog, the moment it learns the Session) starts the lookup then, in
 * parallel with its own reads, and the terminal view takes the answer instead of asking again.
 * An answer older than {@link WARM_MS} is not taken: the terminal may have exited since.
 */
import type { TerminalInfo } from "../terminal";
import { probeJson } from "../terminal";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { machineForSession } from "../../lib/session-machines";
import { rememberTerminalMachine } from "../../lib/terminal-machines";

/** How long a lookup started ahead stays good to take. */
export const WARM_MS = 15_000;

/** Probes a terminal the surface names, recording first where it lives: the id is what routes it. */
export async function probeSurfaceTerminal(
  sessionId: string,
  terminalId: unknown,
): Promise<TerminalInfo | null> {
  if (typeof terminalId !== "string") throw new Error(S.chat.surface.noTerminal);
  rememberTerminalMachine(terminalId, machineForSession(sessionId));
  return probeJson<TerminalInfo>(`/api/terminals/${encodeURIComponent(terminalId)}`);
}

/** The terminal the Session's open surface shows; null when the surface is not open or its terminal is gone. */
export async function attachedTerminal(sessionId: string): Promise<TerminalInfo | null> {
  const state = await api.getSessionSurface(sessionId);
  if (!state.opened) return null;
  return probeSurfaceTerminal(sessionId, state.view?.terminalId);
}

const warm = new Map<string, { at: number; answer: Promise<TerminalInfo | null> }>();

/** Starts the lookup for `sessionId` now; the Session's machine must already be recorded. */
export function warmSurface(sessionId: string): void {
  const answer = attachedTerminal(sessionId);
  // A failure is the taker's to see; unhandled here it would be reported twice.
  answer.catch(() => undefined);
  warm.set(sessionId, { at: Date.now(), answer });
}

/** The lookup started ahead for `sessionId`, once, while it is fresh; null otherwise. */
export function takeWarmSurface(sessionId: string): Promise<TerminalInfo | null> | null {
  const entry = warm.get(sessionId);
  warm.delete(sessionId);
  if (entry === undefined || Date.now() - entry.at > WARM_MS) return null;
  return entry.answer;
}
