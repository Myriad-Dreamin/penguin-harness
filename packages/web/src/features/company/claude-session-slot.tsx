/**
 * The session dialog's slot line: under its title, how the session stands with the Claude Code
 * queue — it holds a slot (and whether its program works or has sat idle, for how long), it waits
 * in line (its place), or it holds none (held by a terminal outside the queue, ended, or not
 * opened). The slot list (claude-code-slots.tsx) is where a slot is let go of; this line only
 * says which one the reader is looking at.
 *
 * While the session holds a slot its run is read again every {@link SLOT_POLL_MS}, so the line
 * follows the program going idle and a release made from the slot list.
 */
import { useEffect, useState } from "react";
import { ICON_GAP } from "@prismshadow/penguin-ui";
import { getOrgClaudeRun } from "../../api/claude-code";
import type { OrgClaudeRun } from "../../api/claude-code";
import { S } from "../../lib/strings";
import { toneDot } from "../../lib/tone";
import type { Tone } from "../../lib/tone";
import type { OpenView, RunRef } from "./claude-session-open";
import { dropResident } from "./claude-session-resident";

/** How often a running session's run is read for the line. */
export const SLOT_POLL_MS = 5_000;

/** Whole minutes since `since` (ISO time), never below zero; null for a time that does not parse. */
export function idleMinutesSince(since: string | undefined, now: number): number | null {
  if (since === undefined) return null;
  const at = Date.parse(since);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((now - at) / 60_000));
}

/** What the line says: a tone for its dot and its sentence; null while there is nothing to say yet. */
export function sessionSlotLine(
  view: OpenView,
  run: OrgClaudeRun | null,
  now: number,
): { tone: Tone; text: string } | null {
  const T = S.company.roadmaps.sessionDialog.slot;
  switch (view.kind) {
    case "loading":
      return null;
    case "queued":
      return { tone: "attention", text: T.queued(view.position) };
    case "running": {
      if (run !== null && run.status === "ended") return { tone: "muted", text: T.none };
      if (run === null || run.activity === undefined) return { tone: "busy", text: T.held };
      if (run.activity === "working") return { tone: "busy", text: T.working };
      return { tone: "attention", text: T.idle(idleMinutesSince(run.idleSince, now)) };
    }
    case "elsewhere":
    case "ended":
    case "failed":
      return { tone: "muted", text: T.none };
  }
}

/** The run a running view holds, read again while the dialog shows it. */
function useHeldRun(ref: RunRef | null): OrgClaudeRun | null {
  const [run, setRun] = useState<OrgClaudeRun | null>(null);
  const key =
    ref === null ? null : `${ref.machine ?? ""}/${ref.projectId}/${ref.orgId}/${ref.runId}`;
  useEffect(() => {
    setRun(null);
    if (ref === null) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const next = await getOrgClaudeRun(ref.projectId, ref.orgId, ref.runId, ref.machine);
        if (next.status === "ended" && next.sessionId !== undefined) dropResident(next.sessionId);
        if (live) setRun(next);
      } catch {
        // A failed read keeps the last line; the next one may answer.
      }
      if (live) timer = setTimeout(() => void read(), SLOT_POLL_MS);
    };
    void read();
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // The key names the run; the object itself is a new one on every view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return run;
}

export function SessionSlotLine({ view }: { view: OpenView }) {
  const run = useHeldRun(view.kind === "running" ? view.run : null);
  const line = sessionSlotLine(view, run, Date.now());
  if (line === null) return null;
  return (
    <p
      className={`flex items-center ${ICON_GAP.row} text-xs text-fg-muted`}
      role="status"
      data-claude-session-slot=""
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneDot[line.tone]}`}
      />
      <span>{line.text}</span>
    </p>
  );
}
