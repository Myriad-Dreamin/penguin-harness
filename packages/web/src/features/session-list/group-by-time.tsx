/**
 * The list grouped by time: last day / last month / earlier, then the Project-wide folders and
 * the whole-list "More" below the buckets.
 */
import { Fold, GroupHeader, MoreRow, SkeletonList } from "@prismshadow/penguin-ui";
import { S } from "../../lib/strings";
import { FOLDER_CATEGORIES, TIME_FOLDERS_GROUP_KEY } from "../../lib/session-grouping";
import { GROUP_MODE_ICONS } from "../../components/ui/group-list";
import { renderFolder, renderGroupBody } from "./group-body";
import type { SessionListController } from "./use-session-list";

export function TimeGroups({ list }: { list: SessionListController }) {
  const {
    timeParts,
    timeGroups,
    loading,
    sessions,
    searching,
    collapsedGroups,
    toggleGroup,
    bucketPartition,
    projectAgentsFor,
    projectCounts,
    timeMoreAgents,
    pendingLoads,
    loadKey,
    trackedLoadMore,
  } = list;
  /**
   * Time mode's one shared, Project-wide set of folders (rendered once below the buckets):
   * their rows load only on first expand, so an unloaded Session has no known bucket and no
   * bucket could honestly claim a share of them. Counts and fetch fan-out are summed over
   * every Agent. A null entry means the Project holds no rows of that category at all —
   * which is also what tells the empty-list line whether it is telling the truth.
   */
  const timeFolders =
    timeParts === null
      ? []
      : FOLDER_CATEGORIES.map((category) =>
          renderFolder(
            list,
            TIME_FOLDERS_GROUP_KEY,
            category,
            timeParts,
            true,
            projectAgentsFor(category),
            projectCounts,
          ),
        );
  return (
    <>
      {/* Time mode: last day / last month / earlier, bucketed on each conversation's last
          activity — the same stamp the rows' compact timestamps and the recency sort read,
          so a row can never sit under a bucket its own timestamp contradicts. Empty buckets
          are dropped, and there are at most three, so this mode never paginates its groups.
          The buckets span every Agent and every Workspace: a bucket's "More" only reveals
          further rows already shown in it, while fetching the next page and reaching the
          Subagents / Scheduled / Archived rows happen once for the whole Project, below. */}
      {timeParts === null ? null : loading && sessions.length === 0 ? (
        <SkeletonList rows={5} />
      ) : (
        <>
          {timeGroups.map((group) => {
            const collapsed = !searching && collapsedGroups.has(group.key);
            return (
              <div key={group.key} className="pt-2.5">
                <GroupHeader
                  open={!collapsed}
                  onToggle={() => toggleGroup(group.key)}
                  glyph={GROUP_MODE_ICONS.time}
                  label={S.chat.timeGroups[group.bucket]}
                  uppercase
                  count={group.sessions.length}
                />
                <Fold open={!collapsed}>
                  {() =>
                    renderGroupBody(
                      list,
                      group.key,
                      bucketPartition(group.sessions),
                      true,
                      undefined,
                      () => [],
                    )
                  }
                </Fold>
              </div>
            );
          })}

          {/* Empty only when the shared folders below are empty too (renderGroupBody's own
              rule): "no Sessions yet" over an "Archived (3)" row would contradict it. */}
          {timeGroups.length === 0 && !searching && timeFolders.every((f) => f === null) && (
            <p className="px-2.5 pt-3 text-xs text-gray-400 dark:text-gray-600">
              {S.chat.noSessions}
            </p>
          )}

          {/* Whole-list paging: every Agent stream with more advances a page, which lowers
              the watermark and adds rows below the last one shown — in whichever bucket
              their activity puts them, so the row that pulls them belongs to the list, not
              to a bucket, and its label says "conversations" where a bucket's says "more".
              It stands while any stream has more (the server's limit+1 answer). */}
          {!searching && timeMoreAgents.length > 0 && (
            <MoreRow
              label={S.chat.loadMoreSessions}
              ariaLabel={S.chat.loadMoreSessions}
              pending={pendingLoads.has(loadKey(TIME_FOLDERS_GROUP_KEY, "active"))}
              onClick={() => trackedLoadMore(TIME_FOLDERS_GROUP_KEY, "active", timeMoreAgents)}
              className="mt-1"
            />
          )}

          {/* The shared, Project-wide folders (see timeFolders). */}
          <div className="pt-2.5">{timeFolders}</div>
        </>
      )}
    </>
  );
}
