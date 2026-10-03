/** The list grouped by Agent: one group per Agent of the Project, empty ones included. */
import {
  AgentAvatar,
  Fold,
  GroupHeader,
  ICONS,
  ICON_SIZE,
  SkeletonList,
} from "@prismshadow/penguin-ui";
import { S } from "../../lib/strings";
import { partitionSessions } from "../../lib/session-grouping";
import { Icon } from "../../components/ui/group-list";
import { agentDisplayName } from "../../state/project";
import { GROUP_ACTION_CLASS, GroupBlock } from "./group-block";
import { GroupPinButton } from "./group-pin-button";
import { renderGroupBody, renderGroupPager } from "./group-body";
import type { SessionListController } from "./use-session-list";

export function AgentGroups({ list }: { list: SessionListController }) {
  const {
    loading,
    agents,
    groupsOnPage,
    orderedAgents,
    filterRows,
    byAgent,
    searching,
    folderOnlyAgents,
    collapsedGroups,
    expandedFolderOnlyGroups,
    pinnedGroups,
    groupDragProps,
    agentGroupSequence,
    toggleGroup,
    togglePin,
    newChat,
    go,
    countsByAgent,
  } = list;
  return (
    <>
      {loading && agents.length === 0 ? (
        <SkeletonList rows={5} />
      ) : (
        // While searching: every group renders (paging bypassed), zero-match groups
        // hide, and the rest are forced open — a hit inside a collapsed group would
        // look like a missing result.
        groupsOnPage(orderedAgents).map((agent) => {
          const groupRows = filterRows(byAgent.get(agent.agentId) ?? []);
          if (searching && groupRows.length === 0) return null;
          const parts = partitionSessions(groupRows);
          /** Conversations folded inside a folder-only group; undefined = an ordinary group, with active rows of its own. */
          const foldedOnly = folderOnlyAgents.get(agent.agentId);
          const collapsed =
            !searching &&
            (foldedOnly === undefined
              ? collapsedGroups.has(agent.agentId)
              : !expandedFolderOnlyGroups.has(agent.agentId));
          const pinned = pinnedGroups.has(agent.agentId);
          const drag = groupDragProps(agent.agentId, agentGroupSequence);
          return (
            <GroupBlock key={agent.agentId} dropEdge={drag.dropEdge}>
              {/* Group header: collapse toggle (Agent name) + pin + new chat + Agent settings; also the group's drag handle. */}
              <GroupHeader
                {...drag.header}
                open={!collapsed}
                onToggle={() => toggleGroup(agent.agentId, foldedOnly !== undefined)}
                icon={
                  <AgentAvatar
                    id={agent.agentId}
                    name={agentDisplayName(agent)}
                    size={18}
                    className="shrink-0 rounded"
                  />
                }
                label={agentDisplayName(agent)}
                uppercase
                {...(foldedOnly === undefined
                  ? {}
                  : {
                      // An Agent header carries no count otherwise; a folder-only one says
                      // what it holds, because everything it holds is behind its folders.
                      count: foldedOnly,
                      muted: true,
                      title: S.chat.folderOnlyGroup(foldedOnly),
                    })}
                actions={
                  <>
                    <GroupPinButton pinned={pinned} onToggle={() => togglePin(agent.agentId)} />
                    {/* New chat: enters draft state directly with this group's Agent (all options live on the draft input card) */}
                    <button
                      type="button"
                      data-tooltip={S.chat.newSessionMenu}
                      aria-label={S.chat.newSessionMenu}
                      onClick={() => newChat({ agentId: agent.agentId })}
                      className={GROUP_ACTION_CLASS}
                    >
                      <Icon d={ICONS.plus} size={ICON_SIZE.groupHeaderAction} />
                    </button>
                    <button
                      type="button"
                      data-tooltip={S.agent.settings}
                      aria-label={S.agent.settings}
                      onClick={() => go(`/agents/${agent.agentId}`)}
                      className={GROUP_ACTION_CLASS}
                    >
                      <Icon d={ICONS.gear} size={ICON_SIZE.groupHeaderAction} />
                    </button>
                  </>
                }
              />

              <Fold open={!collapsed}>
                {() =>
                  renderGroupBody(
                    list,
                    agent.agentId,
                    parts,
                    false,
                    countsByAgent.get(agent.agentId),
                    () => [agent.agentId],
                  )
                }
              </Fold>
            </GroupBlock>
          );
        })
      )}
      {renderGroupPager(list)}
    </>
  );
}
