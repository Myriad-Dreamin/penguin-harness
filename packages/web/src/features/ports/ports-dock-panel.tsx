/**
 * The Ports panel (`DockModule.panels`, kind `ports`): the open conversation's Workspace's port
 * forwards. Keyed by the Workspace, not the Session: a forward belongs to the directory on its
 * machine, and two conversations there are looking at the same rows.
 */
import { DraftPanelEmpty } from "../../lib/dock-panel-empty";
import { useChatSession } from "../../lib/chat-session";
import { machineForSession } from "../../lib/session-machines";
import { PortsPanel } from "./ports-panel";

export function PortsDockPanel({ active }: { active: boolean }) {
  const { selected } = useChatSession();
  if (!selected) return <DraftPanelEmpty />;
  const machineId = machineForSession(selected.sessionId);
  return (
    <PortsPanel
      key={`${machineId ?? ""}:${selected.workspace}`}
      machineId={machineId}
      workspace={selected.workspace}
      active={active}
    />
  );
}
