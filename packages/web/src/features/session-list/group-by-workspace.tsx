/**
 * The list grouped by Workspace: one group per directory on a machine — the loaded rows' groups,
 * the ones the server's counts know, and the manually-added ones — with the temporary
 * workspaces merged into one trailing group.
 */
import { Fold, GroupHeader, ICONS, ICON_SIZE, SkeletonList } from "@prismshadow/penguin-ui";
import type { SessionCategory } from "@prismshadow/penguin-server/api";
import { S } from "../../lib/strings";
import { partitionSessions } from "../../lib/session-grouping";
import { nameOnMachine } from "../../lib/workspace-machines";
import { Icon } from "../../components/ui/group-list";
import { GROUP_ACTION_CLASS, GroupBlock } from "./group-block";
import { GroupOverflowMenu } from "./group-overflow-menu";
import { GroupPinButton } from "./group-pin-button";
import { renderGroupBody, renderGroupPager } from "./group-body";
import type { SessionListController } from "./use-session-list";

export function WorkspaceGroups({ list }: { list: SessionListController }) {
  const {
    loading,
    sessions,
    orderedWorkspaceGroups,
    searching,
    groupsOnPage,
    filterRows,
    folderOnlyWorkspaceGroups,
    collapsedGroups,
    expandedFolderOnlyGroups,
    pinnedGroups,
    machineNameOf,
    groupDragProps,
    workspaceGroupSequence,
    workspaceGroupCounts,
    toggleGroup,
    togglePin,
    newChat,
    browseFiles,
    registeredKeys,
    openRenameWorkspace,
    setDeletingWorkspace,
  } = list;
  return (
    <>
      {loading && sessions.length === 0 ? (
        <SkeletonList rows={5} />
      ) : orderedWorkspaceGroups.length === 0 && !searching ? (
        <p className="px-2.5 pt-3 text-xs text-gray-400 dark:text-gray-600">{S.chat.noSessions}</p>
      ) : (
        // Same search treatment as agent mode: paging bypassed, zero-match groups hidden, the rest forced open.
        groupsOnPage(orderedWorkspaceGroups).map((group) => {
          const groupRows = filterRows(group.sessions);
          if (searching && groupRows.length === 0) return null;
          const parts = partitionSessions(groupRows);
          /** Conversations folded inside a folder-only group; undefined = an ordinary group, with active rows of its own. */
          const foldedOnly = folderOnlyWorkspaceGroups.get(group.key);
          const collapsed =
            !searching &&
            (foldedOnly === undefined
              ? collapsedGroups.has(group.key)
              : !expandedFolderOnlyGroups.has(group.key));
          const pinned = pinnedGroups.has(group.key);
          /**
           * Header tooltip: the full Workspace path, or — for a folder-only group — the
           * sentence that says what the dimmed header and its count mean, which carries that
           * same path inside it.
           */
          const qualifiedPath =
            group.fullPath !== null
              ? nameOnMachine(group.fullPath, machineNameOf(group.machineId))
              : null;
          const headerTitle =
            foldedOnly === undefined
              ? qualifiedPath
              : S.chat.folderOnlyGroup(foldedOnly, qualifiedPath ?? undefined);
          const drag = groupDragProps(group.key, workspaceGroupSequence);
          /** This group's exact server share (per-Workspace fold) and its per-category fetch fan-out. */
          const counts = workspaceGroupCounts.get(group.key);
          /** Read once so the registry actions below keep the narrowing (null = the merged temp group, which has no single path). */
          const fullPath = group.fullPath;
          /** The ssh alias qualifying this group's names, or null when it is on this server. */
          const machineName = machineNameOf(group.machineId);
          const contributingAgents = [...new Set(group.sessions.map((s) => s.agentId))];
          const agentsFor = (category: SessionCategory) => [
            ...new Set([...(counts?.agents[category] ?? []), ...contributingAgents]),
          ];
          return (
            <GroupBlock key={group.key} dropEdge={drag.dropEdge}>
              {/* Group header: collapse toggle (folder icon + directory basename + count, full
                  path in the tooltip; the count = the group's active conversations only, exact
                  server share, loaded rows win a disagreement — the folders never feed it,
                  except in a folder-only group, where they are all there is to count) +
                  pin + new chat in this Workspace; also the group's drag handle. */}
              <GroupHeader
                {...drag.header}
                open={!collapsed}
                onToggle={() => toggleGroup(group.key, foldedOnly !== undefined)}
                // The folder opens and closes with the group.
                glyph={collapsed ? ICONS.folder : ICONS.folderOpen}
                label={nameOnMachine(group.temp ? S.chat.tempWorkspaces : group.label, machineName)}
                count={
                  foldedOnly !== undefined
                    ? foldedOnly
                    : searching
                      ? parts.active.length
                      : Math.max(counts?.totals.active ?? 0, parts.active.length)
                }
                muted={foldedOnly !== undefined}
                {...(headerTitle !== null ? { title: headerTitle } : {})}
                actions={
                  <>
                    <GroupPinButton pinned={pinned} onToggle={() => togglePin(group.key)} />
                    {/* New chat in this Workspace: pre-fills the group's path in the draft ("" = temporary workspace); the Agent is the Project's new-chat default, like any other new chat */}
                    <button
                      type="button"
                      data-tooltip={S.chat.newSessionInWorkspace}
                      aria-label={S.chat.newSessionInWorkspace}
                      onClick={() =>
                        newChat({
                          workspace: fullPath ?? "",
                          // The machine travels with the path: this group's rows live on it,
                          // and the same path here is a different directory (or none).
                          ...(group.machineId ? { machineId: group.machineId } : {}),
                        })
                      }
                      className={GROUP_ACTION_CLASS}
                    >
                      <Icon d={ICONS.plus} size={ICON_SIZE.groupHeaderAction} />
                    </button>
                    {/* A group that is one directory (not the merged temporary group):
                              the overflow right of the "+" — browse its files, and, for a
                              manually-added (registry-backed) Workspace, rename the alias or
                              remove it from the sidebar (session-derived groups have no
                              registry entry for those two to act on). */}
                    {fullPath !== null && (
                      <GroupOverflowMenu
                        onBrowse={() => browseFiles(fullPath, group.machineId)}
                        {...(registeredKeys.has(group.key)
                          ? {
                              onRename: () => openRenameWorkspace(fullPath, group.machineId),
                              onDelete: () =>
                                setDeletingWorkspace({
                                  path: fullPath,
                                  machineId: group.machineId,
                                  label: group.label,
                                }),
                            }
                          : {})}
                      />
                    )}
                  </>
                }
              />

              {/* A workspace group can span Agents: the group body fans folder loads and "More"
                  out per category to the Agents whose share of THIS group is non-zero (plus the
                  Agents already contributing loaded rows) — the active list and each folder
                  page independently. */}
              <Fold open={!collapsed}>
                {() => renderGroupBody(list, group.key, parts, true, counts?.totals, agentsFor)}
              </Fold>
            </GroupBlock>
          );
        })
      )}
      {renderGroupPager(list)}
    </>
  );
}
