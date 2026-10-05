/**
 * The Claude Code slot list, without its view: whether it is open (shell state, opened by the
 * `claudeCode.slots` command — its shortcut and its palette entry), what one reading of the
 * queue says about the server's slots, and the feed that reads it again every few seconds while
 * the list is open.
 *
 * The queue's slots are server-wide: `capacity`, `running` and `queued` in the run list count
 * every organization on this server, while its `runs` are the asking organization's alone. So
 * this organization's runs are listed one by one, and the slots other organizations hold are
 * only a count — the difference, since a person here may not read another organization's runs.
 */
import { useSyncExternalStore } from "react";
import {
  listOrgClaudeRuns,
  listOrgClaudeSessions,
  releaseOrgClaudeRun,
} from "../../api/claude-code";
import type { OrgClaudeRun, OrgClaudeRuns } from "../../api/claude-code";
import { apiErrorText } from "../../lib/api-error";
import { onCommand } from "../../lib/shortcuts/dispatcher";

/** How often the open list reads the queue again. */
export const SLOTS_POLL_MS = 3_000;

/** The longest prompt a row shows before it is cut with an ellipsis. */
export const PROMPT_PREVIEW = 120;

// Whether the list is open, as shell state: the command's handler and the palette entry live
// outside the host's component, so the flag is a module store the host subscribes to.
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function openClaudeCodeSlots(): void {
  open = true;
  emit();
}

export function closeClaudeCodeSlots(): void {
  open = false;
  emit();
}

export function useClaudeCodeSlotsOpen(): boolean {
  const read = () => open;
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * Answers the `claudeCode.slots` command (Ctrl+Alt+; by default, rebindable in Settings) by
 * opening the list. The dispatcher holds global commands back while a dialog is open, so the
 * list's own Escape and close cross are what close it. Returns the unregister function.
 */
export function registerClaudeCodeSlotsCommand(): () => void {
  return onCommand("claudeCode.slots", openClaudeCodeSlots);
}

/** One run of this organization in the list, with the roadmap whose session it continues. */
export interface SlotRow {
  run: OrgClaudeRun;
  roadmap: number | null;
}

export interface SlotsModel {
  /** This organization's runs holding a slot, longest-held first. */
  running: SlotRow[];
  /** This organization's runs waiting for one, by place in the server's line. */
  queued: SlotRow[];
  capacity: number;
  /** Slots in use on the server, by every organization. */
  used: number;
  /** Slots other organizations hold. */
  othersRunning: number;
  /** Runs other organizations have waiting. */
  othersQueued: number;
}

/** One reading of the queue as the list shows it; `roadmaps` maps a Claude Code session id to its roadmap. */
export function slotsModel(list: OrgClaudeRuns, roadmaps: ReadonlyMap<string, number>): SlotsModel {
  const row = (run: OrgClaudeRun): SlotRow => ({
    run,
    roadmap: run.claudeSessionId === undefined ? null : (roadmaps.get(run.claudeSessionId) ?? null),
  });
  const started = (r: OrgClaudeRun) => r.startedAt ?? "";
  const running = list.runs
    .filter((r) => r.status === "running")
    .sort((a, b) => (started(a) < started(b) ? -1 : started(a) > started(b) ? 1 : a.id - b.id))
    .map(row);
  const queued = list.runs
    .filter((r) => r.status === "queued")
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.id - b.id)
    .map(row);
  return {
    running,
    queued,
    capacity: list.capacity,
    used: list.running,
    othersRunning: Math.max(0, list.running - running.length),
    othersQueued: Math.max(0, list.queued - queued.length),
  };
}

/** Who queued a run, by name where the organization's chart has one: `agent:<id>` or `user:<id>`. */
export function queuedByName(by: string, names: ReadonlyMap<string, string>): string {
  const at = by.indexOf(":");
  const id = at < 0 ? by : by.slice(at + 1);
  return by.startsWith("agent:") ? (names.get(id) ?? id) : id;
}

/** A prompt on one line, cut to {@link PROMPT_PREVIEW} characters. */
export function promptPreview(prompt: string): string {
  const line = prompt.replace(/\s+/g, " ").trim();
  return line.length <= PROMPT_PREVIEW ? line : `${line.slice(0, PROMPT_PREVIEW - 1)}…`;
}

/** What the list shows: its first reading on the way, a reading (and the last refresh's failure), or a failure before any. */
export type SlotsState =
  | { kind: "loading" }
  | { kind: "ready"; model: SlotsModel; error: string | null }
  | { kind: "failed"; message: string };

/** The calls the list makes, injectable for tests. */
export interface SlotsDeps {
  list(projectId: string, orgId: string): Promise<OrgClaudeRuns>;
  sessions(
    projectId: string,
    orgId: string,
  ): Promise<{
    roadmaps: Array<{ roadmap: number; sessionId: string }>;
  }>;
  release(projectId: string, orgId: string, runId: number): Promise<unknown>;
  /** Calls `fn` after `ms`; returns the cancel function. */
  schedule(fn: () => void, ms: number): () => void;
}

export const SLOTS_DEPS: SlotsDeps = {
  list: (projectId, orgId) => listOrgClaudeRuns(projectId, orgId, true),
  sessions: listOrgClaudeSessions,
  release: releaseOrgClaudeRun,
  schedule: (fn, ms) => {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
};

/**
 * Reads one organization's slots now and every {@link SLOTS_POLL_MS} until stopped. A read that
 * a later one overtook is dropped, so a refresh after a release never loses to the poll before
 * it. The roadmap mapping is read once per feed: it changes when a session is created, not
 * while the list is open, and a failure there only leaves the rows without a roadmap.
 */
export class SlotsFeed {
  private live = true;
  private latest = 0;
  private cancel: (() => void) | null = null;
  private roadmaps: Map<string, number> | null = null;
  private model: SlotsModel | null = null;

  constructor(
    private readonly projectId: string,
    private readonly orgId: string,
    private readonly onState: (state: SlotsState) => void,
    private readonly deps: SlotsDeps = SLOTS_DEPS,
  ) {}

  /** Reads now, then on the poll. */
  async refresh(): Promise<void> {
    this.cancel?.();
    this.cancel = null;
    const seq = ++this.latest;
    await this.read(seq);
    if (this.live && seq === this.latest) {
      this.cancel = this.deps.schedule(() => void this.refresh(), SLOTS_POLL_MS);
    }
  }

  /** Lets go of a run, then reads again. A refused release throws, for the caller to report. */
  async release(runId: number): Promise<void> {
    await this.deps.release(this.projectId, this.orgId, runId);
    if (this.live) await this.refresh();
  }

  stop(): void {
    this.live = false;
    this.cancel?.();
    this.cancel = null;
  }

  private async read(seq: number): Promise<void> {
    try {
      if (this.roadmaps === null) {
        this.roadmaps = await this.deps.sessions(this.projectId, this.orgId).then(
          (res) => new Map(res.roadmaps.map((r) => [r.sessionId, r.roadmap])),
          () => new Map(),
        );
      }
      const list = await this.deps.list(this.projectId, this.orgId);
      if (!this.live || seq !== this.latest) return;
      this.model = slotsModel(list, this.roadmaps);
      this.onState({ kind: "ready", model: this.model, error: null });
    } catch (err) {
      if (!this.live || seq !== this.latest) return;
      const message = apiErrorText(err);
      this.onState(
        this.model === null
          ? { kind: "failed", message }
          : { kind: "ready", model: this.model, error: message },
      );
    }
  }
}
