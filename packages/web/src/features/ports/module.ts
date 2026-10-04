/**
 * Port forwarding: one machine's forwarded ports, admin-only like the machines page it is reached
 * from, and the dock's Ports panel for the conversation's Workspace (ports-dock-panel.tsx).
 */
import { Bind, Module } from "@prismshadow/penguin-core/kernel/runtime";
import { lazyComponent } from "../../lib/lazy-component";

@Module({
  contributes: {
    "ShellModule.pages": [
      {
        id: "ports.machine",
        key: "machine-ports",
        path: "/machines/:machineId/ports",
        frame: "shell",
        nav: "none",
        admin: true,
        released: true,
        order: 51,
      },
    ],
    "DockModule.panels": [
      {
        id: "ports.panel",
        kind: "ports",
        title: "Ports",
        titleZh: "端口",
        icon: "arrowsOpposed",
        order: 80,
      },
    ],
  },
})
export class PortsModule {
  @Bind("ports.machine") page = lazyComponent(
    () => import("./machine-ports-page"),
    "MachinePortsPage",
  );
  @Bind("ports.panel") panel = lazyComponent(() => import("./ports-dock-panel"), "PortsDockPanel");
}
