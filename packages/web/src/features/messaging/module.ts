/**
 * Messaging: the session list's binding entry and relay mark (session-row-action.tsx), and the
 * dock's messaging panel (messaging-dock-panel.tsx).
 */
import { Bind, Module } from "@prismshadow/penguin-core/kernel";
import { lazyComponent } from "../../lib/lazy-component";
import { messagingRowAction } from "./session-row-action";

@Module({
  contributes: {
    "SessionListModule.rowActions": [{ id: "messaging.binding", order: 10 }],
    "DockModule.panels": [
      {
        id: "messaging.panel",
        kind: "messaging",
        title: "Remote control",
        titleZh: "远程控制",
        icon: "paperPlane",
        order: 50,
      },
    ],
  },
})
export class MessagingModule {
  @Bind("messaging.binding") binding = messagingRowAction;
  @Bind("messaging.panel") panel = lazyComponent(
    () => import("./messaging-dock-panel"),
    "MessagingDockPanel",
  );
}
