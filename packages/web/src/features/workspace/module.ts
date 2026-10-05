/** The Workspace files: the dock's Files panel (workspace-panel.tsx). */
import { Bind, Module } from "@prismshadow/penguin-core/kernel/runtime";

@Module({
  contributes: {
    "DockModule.panels": [
      {
        id: "workspace.panel",
        kind: "workspace",
        title: "Files",
        titleZh: "文件浏览",
        icon: "folder",
        order: 20,
      },
    ],
  },
})
export class WorkspaceModule {
  @Bind("workspace.panel") panel = {
    load: () => import("./workspace-panel").then((m) => m.WorkspacePanel),
  };
}
