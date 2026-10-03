/**
 * The Agent's workflow pages beside the chat (`ChatModule.sessionTabs`): the tab strip, and the
 * page of the tab in front, covering the chat below the strip. The chat stays mounted underneath,
 * so its state survives a look at a page; the strip is absent when the Agent has no workflow with
 * a UI.
 */
import type { SessionTabProps } from "../chat";
import { WorkflowFrame, WorkflowTabStrip, useWorkflowTabs } from "./workflow-tabs";

export function WorkflowSessionTab({ projectId, agentId, machineId }: SessionTabProps) {
  const workflowTabs = useWorkflowTabs(projectId, agentId, machineId);
  return (
    <>
      <WorkflowTabStrip
        tabs={workflowTabs.tabs}
        notices={workflowTabs.notices}
        active={workflowTabs.active}
        onSelect={workflowTabs.setActive}
      />
      {workflowTabs.activeTab !== null && (
        <div className="absolute inset-x-0 bottom-0 top-9 z-10">
          <WorkflowFrame
            // Per tab: the frame keeps this workflow's history fold, its error and its
            // armed Remove, and none of that belongs to the next tab.
            key={workflowTabs.activeTab.tabId}
            projectId={projectId}
            agentId={agentId}
            tab={workflowTabs.activeTab}
            onChanged={() => void workflowTabs.refresh()}
            onRemoved={() => {
              workflowTabs.setActive(null);
              void workflowTabs.refresh();
            }}
          />
        </div>
      )}
    </>
  );
}
