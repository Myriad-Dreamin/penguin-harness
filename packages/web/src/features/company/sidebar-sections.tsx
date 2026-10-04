/**
 * Company mode's sidebar blocks (sidebar-mode.tsx binds them): the channel list, or the block
 * that creates the first organization; the roadmaps; the desks with their Temporary entries; and
 * the rail forms of each, with the all-hands channel in the rail's top slot. Loaded the first
 * time company mode is shown, not with the entry.
 */
import { useMatch } from "react-router";
import { RailDivider } from "@prismshadow/penguin-ui";
import { useNavOrg } from "./sidebar-mode";
import { NoOrganizationsSidebar } from "./org-switcher";
import { ChannelRailRows, ChannelSidebar, DefaultChannelRailRow } from "./channel-sidebar";
import { RoadmapsSidebar } from "./roadmaps-sidebar";
import { DeskRailRows, OrgSessionGroups, TempSessionRailRows } from "./org-session-groups";

/** The rail's top slot in company mode: the organization's all-hands channel. */
export function DefaultChannelRail() {
  return <DefaultChannelRailRow org={useNavOrg()} />;
}

export function Channels({ onNavigate }: { onNavigate?: () => void }) {
  const navOrg = useNavOrg();
  // No organization to list: the create block, not an empty channel list.
  if (navOrg === null) return <NoOrganizationsSidebar {...(onNavigate ? { onNavigate } : {})} />;
  return (
    <ChannelSidebar
      projectId={navOrg.projectId}
      orgId={navOrg.orgId}
      {...(onNavigate ? { onNavigate } : {})}
    />
  );
}

/**
 * The rail's other channels (the all-hands one has the top slot); each carries its own unread
 * count, and the rows draw their own hairline, only when there are any.
 */
export function ChannelsRail() {
  const navOrg = useNavOrg();
  if (navOrg === null) return null;
  return <ChannelRailRows projectId={navOrg.projectId} orgId={navOrg.orgId} />;
}

/** The organization's roadmaps, below its channels; the section hides itself without the roadmaps plugin. No rail form. */
export function Roadmaps({ onNavigate }: { onNavigate?: () => void }) {
  const navOrg = useNavOrg();
  if (navOrg === null) return null;
  return (
    <RoadmapsSidebar
      projectId={navOrg.projectId}
      orgId={navOrg.orgId}
      {...(onNavigate ? { onNavigate } : {})}
    />
  );
}

export function Desks({ onNavigate }: { onNavigate?: () => void }) {
  const navOrg = useNavOrg();
  const activeSessionId = useMatch("/chat/:sessionId")?.params.sessionId ?? null;
  if (navOrg === null) return null;
  return (
    <OrgSessionGroups
      projectId={navOrg.projectId}
      orgId={navOrg.orgId}
      activeSessionId={activeSessionId}
      {...(onNavigate ? { onNavigate } : {})}
    />
  );
}

/** The rail's desks and then its Temporary entries, after a hairline; each carries its running dot. */
export function DesksRail() {
  const navOrg = useNavOrg();
  if (navOrg === null) return null;
  return (
    <>
      <RailDivider />
      <DeskRailRows projectId={navOrg.projectId} orgId={navOrg.orgId} />
      <TempSessionRailRows projectId={navOrg.projectId} orgId={navOrg.orgId} />
    </>
  );
}
