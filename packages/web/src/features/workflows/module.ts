/**
 * The Agent's workflow pages: as tabs beside the chat (session-tab.tsx), and one page as the whole
 * app, outside the shell like the terminal (with and without a tab).
 */
import { Bind, Module } from "@prismshadow/penguin-core/kernel/runtime";
import { WorkflowSessionTab } from "./session-tab";

/**
 * One loader for both routes: the shell defers it once, so its code loads once whichever is
 * opened first.
 */
const workflowAppPage = {
  load: () => import("./workflow-app-page").then((m) => m.WorkflowAppPage),
};

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
  @Bind("workflows.app") app = workflowAppPage;
  @Bind("workflows.app-tab") appTab = workflowAppPage;
  @Bind("workflows.tabs") tabs = WorkflowSessionTab;
}
