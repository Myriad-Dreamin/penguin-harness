/**
 * A group's body, shared by every grouping mode: its active conversations (display-capped,
 * revealed and loaded a page at a time, drag-reordered under manual sort), then its
 * collapsed-by-default folders. Plain render functions over the list's controller, called
 * inline where the groups render.
 */
import type { DragEvent as ReactDragEvent } from "react";
import type {
  SessionCategory,
  SessionCategoryCounts,
  SessionInfo,
} from "@prismshadow/penguin-server/api";
import { FolderSection, MoreRow, SkeletonList } from "@prismshadow/penguin-ui";
import { S } from "../../lib/strings";
import { formatRelativeShort } from "../../lib/format";
import { sessionBackgroundTasks, sessionRowActivity } from "../../lib/session-activity";
import {
  FOLDER_CATEGORIES,
  SIDEBAR_PAGE_SIZE,
  cutAtWatermark,
  revealPlan,
} from "../../lib/session-grouping";
import type { FolderCategory, SessionPartition } from "../../lib/session-grouping";
import { orderSessionRows } from "../../lib/session-order";
import { GroupPager } from "../../components/ui/group-list";
import { SidebarSessionRow } from "./session-row";
import { SESSION_DRAG_MIME } from "./use-session-drag";
import { folderKey } from "./use-group-reveal";
import type { SessionListController } from "./use-session-list";

/** Pager below the group list — rendered only once the groups overflow a single page. */
export const renderGroupPager = ({
  searching,
  groupPageTotal,
  shownGroupPage,
  setGroupPage,
}: SessionListController) =>
  !searching && groupPageTotal > 1 ? (
    <GroupPager page={shownGroupPage} pageCount={groupPageTotal} onChange={setGroupPage} />
  ) : null;

/** Session rows shared by both modes; withAgentHint adds a small Agent avatar per row (workspace mode, where the group no longer names the Agent). */
export const renderRows = (
  list: SessionListController,
  rows: SessionInfo[],
  withAgentHint: boolean,
  /** Manual sort only: the drag scope (group key) plus the group's FULL ordered active list — the drop must commit every loaded row of the partition, not the display-capped slice the user happens to see. */
  dragCtx?: { scope: string; fullRows: SessionInfo[] },
  /** Whether these rows are the group's ACTIVE list (the only rows pinning can reorder). */
  activeList = false,
) => {
  const {
    dragSession,
    setDragSession,
    dropHint,
    setDropHint,
    pinnedSessions,
    commitManualDrop,
    activeSessionId,
    sessionSeen,
    rowMarks,
    sessionEntries,
    locale,
    agentNameById,
    openSession,
    toggleSessionPin,
    setRenameError,
    setRenameText,
    setRenamingSession,
    setEntryDialog,
    setDeletingSession,
    toggleArchive,
  } = list;
  return (
    <ul className="space-y-px">
      {rows.map((s) => {
        // Manual-sort drag wiring (active lists only; never while searching — a filtered
        // view is not the real order). A drop stays within its own scope AND its own
        // pin partition: dragging can reorder but never pin or unpin.
        const dragging =
          dragCtx !== undefined && dragSession?.scope === dragCtx.scope ? dragSession : null;
        const samePartition =
          dragging !== null &&
          dragging.id !== s.sessionId &&
          pinnedSessions.has(dragging.id) === pinnedSessions.has(s.sessionId);
        const drag =
          dragCtx === undefined
            ? {}
            : {
                draggable: true,
                onDragStart: (e: ReactDragEvent) => {
                  // Firefox refuses to start a drag without payload data — but the id must
                  // NOT ride on text/plain: the composer is a controlled textarea with no
                  // drop guard, so a mis-aimed reorder would paste a session id straight
                  // into the user's message. A private type is invisible to text drops.
                  e.dataTransfer.setData(SESSION_DRAG_MIME, s.sessionId);
                  e.dataTransfer.effectAllowed = "move" as const;
                  setDragSession({ scope: dragCtx.scope, id: s.sessionId });
                },
                onDragEnd: () => {
                  setDragSession(null);
                  setDropHint(null);
                },
                onDragOver: (e: ReactDragEvent) => {
                  if (!dragging || !samePartition) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const after = e.clientY - rect.top > rect.height / 2;
                  setDropHint((prev) =>
                    prev?.id === s.sessionId && prev.after === after
                      ? prev
                      : { id: s.sessionId, after },
                  );
                },
                onDragLeave: () => setDropHint((prev) => (prev?.id === s.sessionId ? null : prev)),
                onDrop: (e: ReactDragEvent) => {
                  if (!dragging || !samePartition) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const after = e.clientY - rect.top > rect.height / 2;
                  // The FULL partition (every loaded row of this group on the dragged
                  // row's side of the pin boundary), not the visible slice: committing
                  // only the capped rows would drop the hidden ones out of the stored
                  // sequence, and they would come back as "newcomers" at the top.
                  const partitionIds = dragCtx.fullRows
                    .filter(
                      (r) => pinnedSessions.has(r.sessionId) === pinnedSessions.has(dragging.id),
                    )
                    .map((r) => r.sessionId);
                  commitManualDrop(partitionIds, s.sessionId, after);
                  setDragSession(null);
                  setDropHint(null);
                },
                dropEdge:
                  samePartition && dropHint?.id === s.sessionId
                    ? dropHint.after
                      ? ("below" as const)
                      : ("above" as const)
                    : null,
              };
        return (
          <SidebarSessionRow
            key={s.sessionId}
            s={s}
            active={s.sessionId === activeSessionId}
            // Busy / settled / read / never-ran, decided in one place (session-activity.ts) so
            // the whole transition sequence is testable without a DOM.
            activity={sessionRowActivity(s, sessionSeen, activeSessionId)}
            background={sessionBackgroundTasks(s)}
            marks={rowMarks(s)}
            pinned={pinnedSessions.has(s.sessionId)}
            // Pinning is an ACTIVE-list priority: folder rows (subagent / scheduled /
            // evaluations / archived) are ordered by last activity inside their folder and
            // never pass through orderSessionRows, so a pin there would write an id, light
            // the glyph, move nothing — and then shift the active list's drag partition.
            canPin={activeList}
            // Last ACTIVITY, not creation: the server stamps lastActiveAt when a run
            // starts and again when it ends, so a running row shows its run-start time
            // (it recedes while the run continues — the hourglass beside it is what says
            // "active right now"). CLI-adopted and subagent rows are not
            // driven by this server, so theirs stays at createdAt.
            lastActive={formatRelativeShort(s.lastActiveAt, locale)}
            locale={locale}
            {...(withAgentHint ? { agentHint: agentNameById.get(s.agentId) ?? s.agentId } : {})}
            {...drag}
            onOpen={openSession}
            onTogglePin={(x) => toggleSessionPin(x.sessionId)}
            onRename={(x) => {
              setRenameError(null);
              setRenameText(x.title ?? "");
              setRenamingSession(x);
            }}
            entries={sessionEntries}
            onEntry={(entry, x) => setEntryDialog({ entry, session: x })}
            onDelete={(x) => setDeletingSession(x)}
            onToggleArchive={(x) => void toggleArchive(x)}
          />
        );
      })}
    </ul>
  );
};

/**
 * Collapsed-by-default lazy folder (subagent / scheduled / evaluations / archived): nothing is
 * fetched until the first expand, and once open the folder reveals and pages
 * independently with its own "More" and "show less" rows. Everything is driven by the
 * group's **own** exact server share (`totals` — the Agent's counts in agent mode, the
 * per-Workspace fold in workspace mode): the folder exists only while its share is
 * non-zero, the label shows that share, and "More" shows only while something of that
 * share is still hidden — an Agent's content in *other* Workspaces can never surface a
 * folder here.
 *
 * The folder obeys the same display rule the active list does (revealPlan): one page
 * of rows shows at a time and "More" reveals one page more, spending a fetch only when
 * the reveal runs past what is in memory. In time mode the folders span every contributing
 * Agent, so one fetch can return several pages at once; they stay in memory under the
 * cap rather than all landing on screen. In workspace mode a fetched page can land rows
 * in other groups' folders too, so one click may grow this folder by fewer than a full
 * page — the row shows a loading state while the fetch runs.
 */
export const renderFolder = (
  list: SessionListController,
  groupKey: string,
  category: FolderCategory,
  parts: SessionPartition,
  withAgentHint: boolean,
  /** Agents that may hold this group's rows of this category (fetch fan-out set). */
  agentIds: string[],
  totals: SessionCategoryCounts | undefined,
) => {
  const {
    searching,
    folderCaps,
    hasMoreFor,
    activityWatermarkFor,
    activeSessionId,
    fetchScope,
    openFolders,
    toggleFolder,
    pendingLoads,
    loadKey,
    revealFolderMore,
    collapseFolder,
  } = list;
  const loadedRows = parts[category];
  // In last-activity order, cut at the folder's watermark: a folder spanning several
  // streams (Agents, machines) shows only what they have all reached, so its "More" adds
  // rows below the ones on screen and never above them (the active list's rule).
  const rows = cutAtWatermark(
    loadedRows,
    searching || agentIds.length === 0
      ? null
      : activityWatermarkFor(agentIds, category, fetchScope(groupKey)),
    activeSessionId,
  );
  // While searching the folder speaks for its loaded MATCHES only: a match hidden
  // behind a collapsed folder would look like a missing result (the models page's
  // search-forces-open rationale), so the folder is forced open, labelled by the
  // match count, hidden when nothing matches, and never offers "More" or "show less"
  // (the server cannot search unloaded rows, and every match is already on screen).
  if (searching && rows.length === 0) return null;
  // Loaded rows win a disagreement with the totals (counts refresh only on reload).
  const total = searching ? rows.length : Math.max(totals?.[category] ?? 0, loadedRows.length);
  if (total === 0) return null;
  const key = folderKey(groupKey, category);
  const cap = folderCaps.get(key) ?? SIDEBAR_PAGE_SIZE;
  // The folder's whole share is in memory (every Agent that could hold a row of it is
  // fetched out), which is when the loaded rows become the truth — the same clause the
  // active list applies, and what keeps a count drifting above reality from leaving a
  // reveal row with nothing behind it.
  const fullyLoaded =
    agentIds.length > 0 && !agentIds.some((id) => hasMoreFor(id, category, fetchScope(groupKey)));
  const plan = revealPlan({ cap, loaded: rows.length, total, fullyLoaded });
  const shown = searching ? rows : rows.slice(0, plan.shown);
  const hidden = searching ? 0 : plan.hidden;
  return (
    <FolderSection
      key={category}
      label={S.chat.folderGroups[category](total)}
      open={searching || openFolders.has(key)}
      onToggle={() => toggleFolder(groupKey, category, agentIds)}
      more={hidden > 0}
      // The rows past the cap plus the unfetched remainder of this folder's own share —
      // the same count, and the same wording, the active list's reveal row names one
      // level up.
      moreLabel={S.chat.expandRestSessions(hidden)}
      pending={pendingLoads.has(loadKey(groupKey, category))}
      onMore={() => revealFolderMore(groupKey, category, agentIds, rows.length)}
      less={!searching && plan.canCollapse}
      onLess={() => collapseFolder(key)}
    >
      {renderRows(list, shown, withAgentHint)}
    </FolderSection>
  );
};

/**
 * Expanded group body shared by both modes: active user rows (display-capped; "More"
 * reveals and loads further **active-only** pages — the folders below never feed it) +
 * the collapsed-by-default subagent / scheduled / evaluations / archived folders, each
 * loading on first expand and paging on its own. `totals` / `agentsFor` carry the group's
 * exact server share and its fetch fan-out set per category.
 */
export const renderGroupBody = (
  list: SessionListController,
  groupKey: string,
  parts: SessionPartition,
  withAgentHint: boolean,
  totals: SessionCategoryCounts | undefined,
  agentsFor: (category: SessionCategory) => string[],
) => {
  const {
    pinnedSessions,
    effectiveSortMode,
    sessionOrder,
    searching,
    hasMoreFor,
    activityWatermarkFor,
    activeSessionId,
    fetchScope,
    groupCaps,
    pendingLoads,
    loadKey,
    loading,
    showMore,
    collapseRows,
  } = list;
  // Row order: the pinned cluster first, then — under manual sort — the stored order
  // within each pin partition (lib/session-order.ts). Both reorder only rows already
  // FETCHED: a pinned conversation that lives past the loaded pages does not surface
  // until "More" pulls its page in (the list has no server-side pin), so the pinned
  // cluster leads what is loaded, not the Agent's whole history. Folder rows keep
  // their last-activity order: pinning and manual order are active-list concerns.
  // While searching, the display cap is bypassed — every loaded match shows, and
  // "More" hides (it pages the unfiltered list and would read as "more matches",
  // which the server cannot promise).
  //
  // Before any of that, the rows are cut at the group's watermark: an Agent group on
  // several machines and a Workspace group spanning Agents both merge several streams,
  // and only the rows above the most recent cursor that still has more are a true prefix
  // of the group's activity order. The rest wait in memory, so "More" only ever adds rows
  // below the ones on screen. A time bucket has no streams of its own (its rows arrive
  // already cut), and a search sees every loaded row.
  const activeAgents = agentsFor("active");
  const visibleActive = cutAtWatermark(
    parts.active,
    searching || activeAgents.length === 0
      ? null
      : activityWatermarkFor(activeAgents, "active", fetchScope(groupKey)),
    activeSessionId,
  );
  const orderedActive = orderSessionRows(visibleActive, (s) => s.sessionId, {
    pinned: pinnedSessions,
    sortMode: effectiveSortMode,
    order: sessionOrder,
    recencyOf: (s) => s.lastActiveAt,
  });
  /** Manual sort only (never on a search-filtered view): drag scope + the group's full ordered list, so a drop commits the whole partition. */
  const dragCtx =
    effectiveSortMode === "manual" && !searching
      ? { scope: groupKey, fullRows: orderedActive }
      : undefined;
  // The reveal row counts THIS group's own hidden conversations and nothing else — the
  // folders never feed it, and no other group's numbers reach it. `fullyLoaded` says the
  // group's whole active share is already in memory (every Agent that could hold a row of
  // it is fetched out), which is when the loaded rows become the truth: server counts
  // refresh only on reload, so a count drifting above reality would otherwise leave a row
  // that reveals nothing behind it.
  const fullyLoaded =
    activeAgents.length > 0 &&
    !activeAgents.some((id) => hasMoreFor(id, "active", fetchScope(groupKey)));
  // One page of rows at a time, what the reveal row still hides, and whether "Show less"
  // has anything to fold away: the single rule revealPlan states, applied here and by
  // every folder below.
  const plan = revealPlan({
    cap: groupCaps.get(groupKey) ?? SIDEBAR_PAGE_SIZE,
    loaded: visibleActive.length,
    total: totals?.active ?? 0,
    fullyLoaded,
  });
  const shownActive = searching ? orderedActive : orderedActive.slice(0, plan.shown);
  const hiddenActive = searching ? 0 : plan.hidden;
  const canCollapse = !searching && plan.canCollapse;
  const folders = FOLDER_CATEGORIES.map((category) =>
    renderFolder(list, groupKey, category, parts, withAgentHint, agentsFor(category), totals),
  );
  const empty = visibleActive.length === 0 && folders.every((f) => f === null);
  const activePending = pendingLoads.has(loadKey(groupKey, "active"));
  // Rows the server counts that no page has loaded yet — a Workspace group known from
  // the counts alone while its own first page is on its way (or, after a failed fetch,
  // waiting on the reveal row below to be asked for again). Not "no conversations".
  const awaitingRows = !searching && visibleActive.length === 0 && hiddenActive > 0;
  return (
    <>
      {empty ? (
        loading || (awaitingRows && activePending) ? (
          // The same window the chat pane's skeleton covers: the Agent groups render as
          // soon as the Agents arrive, but the session pages are still being fetched —
          // "no Sessions yet" is not the honest answer until they land.
          <SkeletonList rows={2} />
        ) : awaitingRows ? null : (
          <p className="px-2.5 py-1 text-xs text-gray-400 dark:text-gray-600">
            {S.chat.noSessions}
          </p>
        )
      ) : (
        // Drag-reorder is offered on the active list under manual sort (folders keep
        // last-activity order), and never on a search-filtered view.
        renderRows(list, shownActive, withAgentHint, dragCtx, true)
      )}

      {/* Reveal / collapse this group's own conversations (kept adjacent to the active
          list they extend, above the folders). Both rows can stand at once: a group
          revealed part-way still has more to show AND something to fold back. */}
      {hiddenActive > 0 && (
        <MoreRow
          label={S.chat.expandRestSessions(hiddenActive)}
          ariaLabel={S.chat.expandRestSessions(hiddenActive)}
          pending={activePending}
          onClick={() => showMore(groupKey, activeAgents, visibleActive.length)}
          className="mt-0.5"
        />
      )}
      {canCollapse && (
        <MoreRow
          label={S.chat.showLess}
          ariaLabel={S.chat.showLess}
          onClick={() => collapseRows(groupKey)}
          {...(hiddenActive > 0 ? {} : { className: "mt-0.5" })}
        />
      )}

      {/* Folders (collapsed by default): subagent first — spawned from the conversations
          at hand — then scheduled background runs, then the Evaluation Center's runs, then
          archived (archived wins over the origin folders). */}
      {folders}
    </>
  );
};
