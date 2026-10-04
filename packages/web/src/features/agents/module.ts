/** The Agents list and one Agent's settings. */
import { Bind, Module } from "@prismshadow/penguin-core/kernel";
import { lazyComponent } from "../../lib/lazy-component";

@Module({
  contributes: {
    "ShellModule.pages": [
      {
        id: "agents.list",
        key: "agents",
        path: "/agents",
        frame: "shell",
        nav: "main",
        admin: false,
        released: true,
        order: 20,
        title: "Agents",
        titleZh: "智能体",
        icon: "robot",
      },
      {
        id: "agents.settings",
        key: "agent-settings",
        path: "/agents/:agentId",
        frame: "shell",
        nav: "none",
        admin: false,
        released: true,
        order: 21,
      },
    ],
  },
})
export class AgentsModule {
  @Bind("agents.list") list = lazyComponent(() => import("./agents-page"), "AgentsPage");
  @Bind("agents.settings") settings = lazyComponent(
    () => import("./agent-settings-page"),
    "AgentSettingsPage",
  );
}
