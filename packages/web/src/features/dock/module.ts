/**
 * The dock: its `panels` slot (iface.ts), the layer that keeps its scope on the conversation on
 * screen (dock-scope.tsx), and a Workspace group's "Browse files" in the session list
 * (browse-files.ts).
 *
 * The panel table reaches the docks through a provider of the signed-in session: the docks render
 * inside the chat page, which is another module's, so the table is put around every page rather
 * than bound into a root of the dock's own. The kinds it holds are also what the stored layouts
 * are read against (dock-state.ts `definePanelKinds`).
 */
import type { ComponentType, ReactNode } from "react";
import { Bind, Module, Provide } from "@prismshadow/penguin-core/kernel";
import type { ClassCtx } from "@prismshadow/penguin-core/kernel";
import { DockScope } from "./dock-scope";
import { browseFilesAction } from "./browse-files";
import { definePanelKinds } from "./dock-state";
import { dockDeps, panelsOf } from "./deps";
import type { Dock } from "./iface";

function PanelTable({ children }: { children: ReactNode }) {
  return children;
}

@Module({
  contributes: {
    // Innermost of the session's providers: it reads none of theirs, and nothing above needs it.
    "ShellModule.sessionProviders": [{ id: "dock.panels", order: 30 }],
    // Last of the layers: the layout's own effect it replaces ran after every layer's.
    "ShellModule.layers": [{ id: "dock.scope", order: 50 }],
    "SessionListModule.rowActions": [{ id: "dock.browse-files", order: 10 }],
  },
})
export class DockModule {
  @Provide() dock!: Dock;
  @Bind("dock.panels") panels!: ComponentType<{ children: ReactNode }>;
  @Bind("dock.scope") scope = DockScope;
  @Bind("dock.browse-files") browseFiles = browseFilesAction;
  setup({ contributions }: ClassCtx) {
    const deps = panelsOf(contributions.panels ?? []);
    definePanelKinds(deps.panels.map((panel) => panel.kind));
    this.panels = dockDeps.provide(deps, PanelTable);
    this.dock = {};
  }
}
