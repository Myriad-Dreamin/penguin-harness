/**
 * The machine a conversation runs on, out of reach, said on the surfaces that keep showing the
 * conversation anyway (features/chat/machine-away.ts is the reading they share):
 *
 * - `MachineAwayRetry` — the Machines page's own retry line (`retryReading` through the shared
 *   `RetryStatus`): which attempt of how many, when the next one runs, and the press that
 *   starts one now, wired to the same reconnect route the Machines page's Retry takes
 *   (`MachineInfo.id`, `ssh:<alias>`). It goes wherever a surface names the machine, so the
 *   words and the numbers cannot drift from the Machines page.
 * - `MachineAwayBanner` — the strip over a conversation whose body is already on screen. The
 *   history was read while the machine answered, and nothing fails again when the machine
 *   drops, so without the strip an open conversation says nothing at all while its machine is
 *   down and being brought back.
 */
import { RetryStatus, toastError } from "@prismshadow/penguin-ui";
import * as api from "../../api/endpoints";
import { apiErrorText } from "../../lib/api-error";
import { machineForSession } from "../../lib/session-machines";
import { useMachines } from "../../state/machines";
import { retryStatus } from "../machines/machine-card";
import { machineAway } from "./machine-away";

/**
 * The machine's retry line: what the server is doing to bring it back, or where it stopped, and
 * the Retry that starts an attempt now. Null while the machine answers, while the list has not
 * answered yet, and for the states no retry reading covers (a machine nothing is bringing
 * back: the surface says its headline and nothing else).
 */
export function MachineAwayRetry({
  projectId,
  machineId,
  layout = "line",
}: {
  /** The Project whose machines the reconnect route takes; null disables the press. */
  projectId: string | null;
  /** The machine the conversation lives on, as the machines list carries it. */
  machineId: string;
  /** `line` sits beside the banner's sentence; `block` is the panel's centred stack. */
  layout?: "line" | "block";
}) {
  const machines = useMachines();
  const away = machineAway(machines.state, machines.settled, machineId);
  if (away === null || away.retry === null) return null;
  const entry = away.machine;
  // The Machines page's Retry: the server tries the connection now. A refusal is said and
  // rejects, so the press can be made again.
  const reconnect = async (): Promise<void> => {
    if (projectId === null || entry === null) return;
    try {
      machines.accept(await api.reconnectMachine(projectId, entry.id));
    } catch (err) {
      toastError(apiErrorText(err));
      throw err;
    }
  };
  return (
    <RetryStatus
      {...retryStatus(away.retry, { onRetry: reconnect, held: false, layout })}
      className="text-left"
    />
  );
}

/**
 * The strip over an open conversation whose machine is out of reach: the machine by its alias
 * and where its link stands, and the retry line beside it. Null — nothing on screen — while
 * the machine answers, so a conversation that is doing fine never grows a strip, and one whose
 * machine came back drops it on its own.
 */
export function MachineAwayBanner({
  projectId,
  sessionId,
}: {
  projectId: string | null;
  /** The conversation on screen; its machine is read from the session-to-machine map. */
  sessionId: string;
}) {
  const machines = useMachines();
  const machineId = machineForSession(sessionId);
  if (machineId === null) return null;
  const away = machineAway(machines.state, machines.settled, machineId);
  if (away === null) return null;
  return (
    <div
      data-machine-away-banner=""
      className="anim-fade flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-line bg-surface-muted px-4 py-2"
    >
      <p className="min-w-0 text-xs font-medium text-fg">{away.headline}</p>
      <MachineAwayRetry projectId={projectId} machineId={machineId} />
    </div>
  );
}
