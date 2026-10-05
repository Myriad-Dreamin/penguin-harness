/**
 * The Claude Code slot list: who holds this server's Claude Code slots, seen at once and dealt
 * with in one click. Opened by the `claudeCode.slots` command — Ctrl+Alt+; (⌥⌘; on macOS) on
 * any page, rebindable in Settings, and the command palette's entry — and drawn on the session
 * dialog's shell (claude-session-dialog.tsx): the same headerless `Modal`, heading and close cross.
 *
 * It lists the slots of the organization the shell is in (the org routes set it, and it stays
 * set on a desk's chat page): each running run with the roadmap whose session it continues,
 * its employee, whether its program works or sits idle (and since when), who queued it and the
 * prompt it began with; below, the runs waiting by their place in the server's line; slots
 * other organizations hold as a count only. **Open** enters the run's session in the session
 * dialog; **Release** asks first, then ends the run (cancels a queued one) and reads again.
 * While open it reads the queue every few seconds (claude-code-slots-model.ts).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Button,
  CloseButton,
  ConfirmModal,
  ICON_GAP,
  Modal,
  Notice,
  Spinner,
  toastError,
} from "@prismshadow/penguin-ui";
import { apiErrorText } from "../../lib/api-error";
import { S } from "../../lib/strings";
import { toneDot } from "../../lib/tone";
import { machineForOrg } from "../../lib/org-machines";
import { useCompany } from "../../state/company";
import { parseOrgKey } from "./company-nav";
import { CLAUDE_CODE_PAGE_KEY } from "./roadmap-session";
import { useOrgPages } from "./use-org-pages";
import { openClaudeRun } from "./claude-session-open";
import { idleMinutesSince } from "./claude-session-slot";
import { dropEndedResidents, setResidentCapacity } from "./claude-session-resident";
import {
  SlotsFeed,
  closeClaudeCodeSlots,
  promptPreview,
  queuedByName,
  registerClaudeCodeSlotsCommand,
  useClaudeCodeSlotsOpen,
} from "./claude-code-slots-model";
import type { SlotRow, SlotsState } from "./claude-code-slots-model";

/** The one mount, in the app shell beside the session dialog's host; it owns the command. */
export function ClaudeCodeSlotsHost() {
  useEffect(() => registerClaudeCodeSlotsCommand(), []);
  const open = useClaudeCodeSlotsOpen();
  if (!open) return null;
  return <ClaudeCodeSlotsDialog onClose={closeClaudeCodeSlots} />;
}

/** The organization the list is about: the shell's current one, when the plugin is installed. */
type Scope =
  { kind: "org"; projectId: string; orgId: string } | { kind: "no-org" } | { kind: "no-plugin" };

function ClaudeCodeSlotsDialog({ onClose }: { onClose: () => void }) {
  const company = useCompany();
  const pages = useOrgPages();
  const org = parseOrgKey(company.currentOrgKey);
  const installed = pages.some((p) => p.key === CLAUDE_CODE_PAGE_KEY && p.nav === "org");
  const scope: Scope =
    org === null ? { kind: "no-org" } : installed ? { kind: "org", ...org } : { kind: "no-plugin" };
  const names = useMemo(
    () => new Map((company.orgChart?.employees ?? []).map((e) => [e.agentId, e.name])),
    [company.orgChart],
  );
  const T = S.company.claudeSlots;
  return (
    <Modal
      open
      title={T.title}
      onClose={onClose}
      headerless
      bare
      widthClass="sm:w-[min(96vw,48rem)] sm:max-w-[calc(100vw-2rem)]"
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 sm:px-6 sm:pt-5">
          <h2 className="min-w-0 truncate text-lg font-semibold">{T.title}</h2>
          <CloseButton onClose={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
          {scope.kind === "org" ? (
            <OrgSlots
              key={`${scope.projectId}/${scope.orgId}`}
              projectId={scope.projectId}
              orgId={scope.orgId}
              names={names}
              onClose={onClose}
            />
          ) : (
            <p className="py-6 text-center text-sm text-fg-muted">
              {scope.kind === "no-org" ? T.noOrg : T.noPlugin}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function OrgSlots({
  projectId,
  orgId,
  names,
  onClose,
}: {
  projectId: string;
  orgId: string;
  names: ReadonlyMap<string, string>;
  onClose: () => void;
}) {
  const [state, setState] = useState<SlotsState>({ kind: "loading" });
  const [confirming, setConfirming] = useState<SlotRow | null>(null);
  const [busy, setBusy] = useState(false);
  const feed = useRef<SlotsFeed | null>(null);
  useEffect(() => {
    const current = new SlotsFeed(projectId, orgId, (next) => {
      if (next.kind === "ready" && next.error === null) {
        // What the queue says also says which kept terminals still have a program behind them.
        setResidentCapacity(next.model.capacity);
        dropEndedResidents(
          projectId,
          orgId,
          next.model.running.map((r) => r.run.id),
        );
      }
      setState(next);
    });
    feed.current = current;
    void current.refresh();
    return () => current.stop();
  }, [projectId, orgId]);
  const open = (row: SlotRow) => {
    onClose();
    openClaudeRun({
      projectId,
      orgId,
      runId: row.run.id,
      machine: machineForOrg(projectId, orgId),
    });
  };
  const release = async (row: SlotRow) => {
    setBusy(true);
    try {
      await feed.current?.release(row.run.id);
      setConfirming(null);
    } catch (err) {
      toastError(`${S.company.claudeSlots.releaseFailed}: ${apiErrorText(err)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SlotsBody
        state={state}
        names={names}
        now={Date.now()}
        onOpen={open}
        onAskRelease={setConfirming}
        onRetry={() => {
          setState({ kind: "loading" });
          void feed.current?.refresh();
        }}
      />
      {confirming !== null && (
        <ReleaseConfirm
          row={confirming}
          names={names}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void release(confirming)}
        />
      )}
    </>
  );
}

const employeeOf = (row: SlotRow, names: ReadonlyMap<string, string>) =>
  names.get(row.run.agentId) ?? row.run.agentId;

/** The confirmation Release asks for (exported for tests). */
export function ReleaseConfirm({
  row,
  names,
  busy,
  onCancel,
  onConfirm,
}: {
  row: SlotRow;
  names: ReadonlyMap<string, string>;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const T = S.company.claudeSlots;
  const run = T.run(row.run.id);
  return (
    <ConfirmModal
      open
      title={T.confirmTitle}
      onClose={onCancel}
      onConfirm={onConfirm}
      confirmLabel={T.release}
      cancelLabel={T.cancel}
      busy={busy}
    >
      <p className="text-sm">
        {row.run.status === "running"
          ? T.confirmRunning(run, employeeOf(row, names))
          : T.confirmQueued(run, employeeOf(row, names))}
      </p>
    </ConfirmModal>
  );
}

/**
 * The list for one reading (exported for tests). Rows are drawn by plain functions rather than
 * components, so the whole list is one element tree a test can read and click through.
 */
export function SlotsBody({
  state,
  names,
  now,
  onOpen,
  onAskRelease,
  onRetry,
}: {
  state: SlotsState;
  names: ReadonlyMap<string, string>;
  now: number;
  onOpen: (row: SlotRow) => void;
  onAskRelease: (row: SlotRow) => void;
  onRetry: () => void;
}) {
  const T = S.company.claudeSlots;
  if (state.kind === "loading") {
    return (
      <p className={`flex items-center ${ICON_GAP.menu} text-sm text-fg-muted`}>
        <Spinner size="sm" label={T.loading} />
        <span aria-hidden="true">{T.loading}</span>
      </p>
    );
  }
  if (state.kind === "failed") {
    return (
      <Notice tone="danger" role="alert" retry={{ label: T.retry, onClick: onRetry }}>
        {`${T.failed}: ${state.message}`}
      </Notice>
    );
  }
  const { model } = state;
  const row = (r: SlotRow) => slotRow(r, names, now, onOpen, onAskRelease);
  return (
    <div className="flex flex-col gap-4">
      {state.error !== null && (
        <Notice tone="danger" role="alert" retry={{ label: T.retry, onClick: onRetry }}>
          {`${T.failed}: ${state.error}`}
        </Notice>
      )}
      <p className="text-sm text-fg-muted" data-slots-summary="">
        {[
          T.summary(model.used, model.capacity),
          ...(model.othersRunning > 0 ? [T.others(model.othersRunning)] : []),
          ...(model.othersQueued > 0 ? [T.othersQueued(model.othersQueued)] : []),
        ].join(" · ")}
      </p>
      {model.running.length === 0 && model.queued.length === 0 ? (
        <p className="py-4 text-center text-sm text-fg-muted">{T.empty}</p>
      ) : (
        <>
          {model.running.length > 0 && section(T.running, model.running.map(row))}
          {model.queued.length > 0 && section(T.queued, model.queued.map(row))}
        </>
      )}
    </div>
  );
}

function section(title: string, rows: ReactNode[]): ReactNode {
  return (
    <section className="flex flex-col gap-2" key={title}>
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="flex flex-col divide-y divide-line border-y border-line">{rows}</ul>
    </section>
  );
}

function slotRow(
  row: SlotRow,
  names: ReadonlyMap<string, string>,
  now: number,
  onOpen: (row: SlotRow) => void,
  onAskRelease: (row: SlotRow) => void,
): ReactNode {
  const T = S.company.claudeSlots;
  const { run } = row;
  const state =
    run.status === "queued"
      ? { tone: "attention" as const, text: T.position(run.position ?? null) }
      : run.activity === "idle"
        ? { tone: "attention" as const, text: T.idle(idleMinutesSince(run.idleSince, now)) }
        : { tone: "busy" as const, text: T.working };
  const label = row.roadmap === null ? T.run(run.id) : T.roadmap(row.roadmap);
  const prompt = run.prompt.trim() === "" ? T.resumed : promptPreview(run.prompt);
  return (
    <li
      key={run.id}
      className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-2.5"
      data-slot-run={run.id}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={`flex min-w-0 flex-wrap items-center ${ICON_GAP.row} text-sm`}>
          <span className="font-medium">{label}</span>
          <span className="text-fg-muted">·</span>
          <span>{employeeOf(row, names)}</span>
          <span className="text-fg-muted">·</span>
          <span className={`inline-flex items-center ${ICON_GAP.row} text-fg-muted`}>
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneDot[state.tone]}`}
            />
            <span data-slot-state="">{state.text}</span>
          </span>
        </p>
        <p className="text-xs text-fg-muted">{T.queuedBy(queuedByName(run.by, names))}</p>
        <p className="truncate text-xs text-fg-muted" data-slot-prompt="">
          {prompt}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          onClick={() => onOpen(row)}
          aria-label={T.openLabel(label)}
          data-slot-action="open"
        >
          {T.open}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => onAskRelease(row)}
          aria-label={T.releaseLabel(label)}
          data-slot-action="release"
        >
          {T.release}
        </Button>
      </div>
    </li>
  );
}
