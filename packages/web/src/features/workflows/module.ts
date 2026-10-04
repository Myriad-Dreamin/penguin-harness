/**
 * The Agent's workflow pages: as tabs beside the chat (session-tab.tsx), and one page as the whole
 * app, outside the shell like the terminal (with and without a tab).
 */
import { Bind, Module } from "@prismshadow/penguin-core/kernel/runtime";
import { WorkflowAppPage } from "./workflow-app-page";
import { WorkflowSessionTab } from "./session-tab";

@Module({
  contributes: {
    "ShellModule.pages": [
      {
        id: "workflows.app",
        key: "workflow-app",
        path: "/app/:projectId/:agentId/:workflowId",
        frame: "bare",
        nav: "none",
        admin: false,
        released: true,
        order: 110,
      },
      {
        id: "workflows.app-tab",
        key: "workflow-app-tab",
        path: "/app/:projectId/:agentId/:workflowId/:tabKey",
        frame: "bare",
        nav: "none",
        admin: false,
        released: true,
        order: 111,
      },
    ],
    "ChatModule.sessionTabs": [{ id: "workflows.tabs", order: 10 }],
  },
})
export class WorkflowsModule {
  @Bind("workflows.app") app = WorkflowAppPage;
  @Bind("workflows.app-tab") appTab = WorkflowAppPage;
  @Bind("workflows.tabs") tabs = WorkflowSessionTab;
}
