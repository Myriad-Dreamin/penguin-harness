/**
 * The transcript's place when a conversation's history could not be read.
 *
 * For a conversation on a machine the server cannot reach right now, the history lives on that
 * machine, so the failure is the machine's state and is said as such: the machine by its alias
 * and where its link stands, the Machines page's own retry status (the countdown, Retry now,
 * where it stopped), and the history loads again on its own once the machine is connected. The
 * transport's error — the machine's internal id, a SOCKS port — is kept one fold away for
 * whoever has to diagnose it, never the headline.
 *
 * Anything else is the read's own failure: the error and a Retry.
 *
 * `MachineAwayPanel` is that machine half on its own, for the page that holds a Session the
 * list cannot even name yet: the chat page's direct lookup of a deep link into a machine's
 * conversation is answered 503 with the machine in the error's `details`, and the panel says
 * it from there — the same words, the same retry, whether the history read failed
 * (`HistoryLoadFailed`) or never happened (the routed note, chat-page.tsx).
 */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Button, GlyphIcon, HelpFold, ICONS, ICON_SIZE } from "@prismshadow/penguin-ui";
import { machineLink } from "../../lib/machine-link";
import { machineForSession } from "../../lib/session-machines";
import { S } from "../../lib/strings";
import { useMachines } from "../../state/machines";
import { MachineAwayRetry } from "./machine-away-notice";
import { machineAway } from "./machine-away";

/**
 * A conversation on a machine out of reach, said as the machine's state: its alias, where its
 * link stands, the Machines page's own retry, and the transport's words one fold away.
 *
 * `fallback` is what stands here while there is nothing machine-shaped to say — the machine
 * answers again, the list has not answered yet, or nothing is known to be wrong with it — and
 * for a `machineId` the caller cannot name at all. It is the caller's, because the two callers
 * say different things there: a failed read shows its error, a routed note says the machine by
 * the alias the server sent and that the conversation will open on its own.
 */
export function MachineAwayPanel({
  projectId,
  machineId,
  alias,
  error,
  onRetry,
  fallback,
}: {
  /** The Project whose machines the reconnect route takes; null disables the press. */
  projectId: string | null;
  /** The machine the conversation lives on, as the machines list carries it. */
  machineId: string;
  /**
   * The alias the server itself sent for this machine (route-offline.ts), kept for the states
   * the list cannot say better: while it has not answered, and a machine it no longer lists.
   */
  alias: string | null;
  /** The transport's own words, one fold away; null hides the fold. */
  error: string | null;
  /** The Retry while no machine retry is on offer; null hides the button. */
  onRetry: (() => void) | null;
  /** What stands here while the machine is not the thing to speak about. */
  fallback: ReactNode;
}) {
  const machines = useMachines();
  const away = machineAway(machines.state, machines.settled, machineId);
  // The list has not answered yet, or the machine is back — the caller's words stand. A machine
  // the list does not carry is the one case the server's alias says better: it named the
  // machine holding this Session, so "not on the list" is the list's silence, not a name.
  if (away === null || (away.link === "missing" && alias !== null)) return <>{fallback}</>;
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
        <GlyphIcon d={ICONS.server} size={ICON_SIZE.sectionMark} className="text-fg-subtle" />
        <h2 className="max-w-full break-words text-base font-semibold text-fg">{away.headline}</h2>
        <p className="text-sm text-fg-muted">{S.chat.machineAway.hint}</p>
        {away.retry !== null ? (
          <MachineAwayRetry projectId={projectId} machineId={machineId} layout="block" />
        ) : onRetry !== null ? (
          <Button onClick={onRetry}>{S.common.retry}</Button>
        ) : null}
        {error !== null && (
          <HelpFold title={S.chat.machineAway.details} className="mt-2 max-w-full text-left">
            <p className="break-words font-mono text-xs text-fg-muted">{error}</p>
          </HelpFold>
        )}
      </div>
    </div>
  );
}

export function HistoryLoadFailed({
  projectId,
  sessionId,
  error,
  onRetry,
}: {
  projectId: string | null;
  sessionId: string;
  /** The read's error, in words. */
  error: string;
  /** Reads the history again. */
  onRetry: () => void;
}) {
  const machines = useMachines();
  const machineId = machineForSession(sessionId);
  const link = machineId === null ? null : machineLink(machines.state, machines.settled, machineId);

  // Back from being away: read the history again, once per return. A failure while the machine
  // still reads as connected waits for a Retry — nothing about it is known to have changed.
  const wasAway = useRef(false);
  useEffect(() => {
    if (link === null || link === "unknown") return;
    if (link !== "connected") {
      wasAway.current = true;
      return;
    }
    if (!wasAway.current) return;
    wasAway.current = false;
    onRetry();
  }, [link, onRetry]);

  // The read's own failure: this server's conversation, or nothing machine-shaped to say.
  const readFailed = (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
      <p className="text-sm text-red-600 dark:text-red-400">
        {S.chat.historyLoadFailed}：{error}
      </p>
      <Button onClick={onRetry}>{S.common.retry}</Button>
    </div>
  );
  if (machineId === null) return readFailed;
  return (
    <MachineAwayPanel
      projectId={projectId}
      machineId={machineId}
      alias={null}
      error={error}
      onRetry={onRetry}
      fallback={readFailed}
    />
  );
}
