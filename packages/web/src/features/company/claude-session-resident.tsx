/**
 * The session dialog's terminals stay alive after it closes. The last few Claude Code sessions
 * the dialog showed keep their terminal view — the xterm, its byte stream, its scrollback —
 * mounted in a container this module owns, outside the dialog; the open dialog adopts the
 * container with a plain appendChild and gives it back on close. Reopening one of them shows
 * it at once, with nothing to ask the server first: the chain behind a first open (the link's
 * answer, the Session, its surface, its terminal, the stream's replay) is a handful of round
 * trips, each slow when the organization runs on another machine.
 *
 * As many stay as the queue has slots ({@link setResidentCapacity}, from the run list's
 * `capacity`; {@link DEFAULT_RESIDENTS} until a list has said), the least recently shown leaving
 * first. A session whose run ended leaves at once ({@link dropResident}), since its terminal has
 * nothing more to show. A kept terminal is detached from the document while hidden, so its size
 * never reaches the program: a fit with no box measures nothing and sends nothing.
 *
 * The same module remembers what the roadmap page learned ahead of a click
 * ({@link warmTarget}): the Session a link leads to while its run is running, so a first open
 * shows that Session without waiting for the link's answer either.
 */
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { SessionInfo } from "@prismshadow/penguin-server/api";
import { SessionSurfaceView } from "../chat/session-surface-view";
import type { RunRef } from "./claude-session-open";

/** How many terminals stay when no run list has named the queue's capacity. */
export const DEFAULT_RESIDENTS = 4;

/** How long a Session learned ahead of a click is trusted to open with. */
export const WARM_TARGET_MS = 120_000;

interface Resident {
  session: SessionInfo;
  run: RunRef;
  /** The dialog targets (claude-session-open.ts `openTargetKey`) that showed this Session. */
  keys: Set<string>;
}

let capacity = DEFAULT_RESIDENTS;
// Most recently shown first. Replaced, never mutated, so a snapshot is a stable reference.
let residents: readonly Resident[] = [];
const containers = new Map<string, HTMLDivElement>();
const warm = new Map<string, { at: number; session: SessionInfo; run: RunRef }>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function settle(next: Resident[]): void {
  const kept = next.slice(0, Math.max(1, capacity));
  for (const id of containers.keys()) {
    if (!kept.some((r) => r.session.sessionId === id)) {
      containers.get(id)?.remove();
      containers.delete(id);
    }
  }
  residents = kept;
  emit();
}

/** The queue's capacity, as a run list states it: that many terminals stay. */
export function setResidentCapacity(slots: number): void {
  if (!Number.isInteger(slots) || slots < 1 || slots === capacity) return;
  capacity = slots;
  settle([...residents]);
}

/** Keeps the Session's terminal, as the one shown most recently, reached from `key`. */
export function retainResident(session: SessionInfo, run: RunRef, key: string): void {
  const found = residents.find((r) => r.session.sessionId === session.sessionId);
  const keys = new Set(found?.keys ?? []);
  keys.add(key);
  const rest = residents.filter((r) => r !== found);
  // A key leads to one Session: an older one it led to no longer answers for it.
  for (const r of rest) r.keys.delete(key);
  settle([{ session: found?.session ?? session, run, keys }, ...rest]);
}

/** Lets the Session's terminal go (its run ended, or it is held elsewhere now). */
export function dropResident(sessionId: string): void {
  if (!residents.some((r) => r.session.sessionId === sessionId)) return;
  settle(residents.filter((r) => r.session.sessionId !== sessionId));
}

/** Lets go of every kept terminal of the organization whose run is not among `running` run ids. */
export function dropEndedResidents(projectId: string, orgId: string, running: number[]): void {
  const ended = residents.filter(
    (r) => r.run.projectId === projectId && r.run.orgId === orgId && !running.includes(r.run.runId),
  );
  if (ended.length > 0) settle(residents.filter((r) => !ended.includes(r)));
}

/** Records the running Session a target leads to, learned before anyone opened it. */
export function warmTarget(key: string, session: SessionInfo, run: RunRef): void {
  warm.set(key, { at: Date.now(), session, run });
}

/** The Session a target is known to lead to — a kept terminal, or one learned ahead — or null. */
export function knownSession(key: string): { session: SessionInfo; run: RunRef } | null {
  const resident = residents.find((r) => r.keys.has(key));
  if (resident !== undefined) return { session: resident.session, run: resident.run };
  const ahead = warm.get(key);
  if (ahead === undefined) return null;
  if (Date.now() - ahead.at > WARM_TARGET_MS) {
    warm.delete(key);
    return null;
  }
  return { session: ahead.session, run: ahead.run };
}

/** The kept Session ids, most recent first (for tests and the runtime). */
export function residentSessionIds(): string[] {
  return residents.map((r) => r.session.sessionId);
}

function containerFor(sessionId: string): HTMLDivElement {
  let container = containers.get(sessionId);
  if (container === undefined) {
    container = document.createElement("div");
    container.className = "flex min-h-0 flex-1 flex-col";
    containers.set(sessionId, container);
  }
  return container;
}

/** The kept terminals, each rendered into its own container. Mounted once, beside the dialog's host. */
export function ResidentSessionsRuntime() {
  const kept = useSyncExternalStore(
    subscribe,
    () => residents,
    () => residents,
  );
  return (
    <>
      {kept.map((r) =>
        createPortal(
          <SessionSurfaceView session={r.session} fontSize={15} />,
          containerFor(r.session.sessionId),
          r.session.sessionId,
        ),
      )}
    </>
  );
}

/**
 * Where the open dialog shows a kept terminal: it keeps the Session, adopts its container, and
 * hands it back (detached, still alive) when the dialog closes or moves to another view.
 */
export function ResidentSurface({
  session,
  run,
  targetKey,
}: {
  session: SessionInfo;
  run: RunRef;
  targetKey: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const sessionId = session.sessionId;
  useLayoutEffect(() => {
    retainResident(session, run, targetKey);
    const container = containerFor(sessionId);
    host.current?.appendChild(container);
    return () => container.remove();
    // The Session id is the identity; a fresher object for the same Session changes nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, targetKey]);
  return (
    <div ref={host} className="flex min-h-0 flex-1 flex-col" data-resident-session={sessionId} />
  );
}
