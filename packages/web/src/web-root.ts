/**
 * The composition root: the one file that lists the module classes, the web app's counterpart
 * of the server's platform.ts. `bootWeb()` boots the tree once, before the first render
 * (main.tsx), and hands back the shell's root component — the routed app with every module's
 * contributions bound in.
 *
 * The manifests and interfaces come from `ifaces.json`, which scripts/gen-ifaces.mjs generates
 * from this package's sources (`pnpm gen:ifaces`; not committed). The tree parks nothing and
 * claims no live resource, so its resource registry is an empty one. Booting does no network
 * and takes a few milliseconds.
 *
 * The tree is VERIFIED when it is built (scripts/verify-builtin-tree.mjs runs the kernel's full
 * check over `ifaces.json` before `vite build`), so the page boots it through the kernel's
 * arktype-free runtime entry: identity wiring and the cheap checks, no shape validation. The
 * enabled plugins' web modules join it as the root's runtime children (`"*"`, the way the
 * platform's root takes plugin modules): the entry hands over what GET /api/contributions
 * forwarded (main.tsx), and plugins/assemble.ts loads and checks them.
 */
import type { ComponentType } from "react";
import { bootVerified, Module, moduleDefOf } from "@prismshadow/penguin-core/kernel/runtime";
import type {
  IfaceTable,
  ManifestTable,
  ModuleDef,
  Resources,
} from "@prismshadow/penguin-core/kernel/runtime";
import type { WebModulePackage } from "@prismshadow/penguin-server/api";
import table from "./ifaces.json";
import { assemblePlugins, leaveOutAll, mergedTable } from "./plugins/assemble";
import type { ImportModule } from "./plugins/assemble";
import { ShellModule } from "./shell/module";
import type { Shell } from "./shell/module";
import { SidebarModule } from "./shell/sidebar/module";
import type { AppRouterProps } from "./shell/router";
import { SessionsModule } from "./state/sessions.module";
import { ChatModule } from "./features/chat/module";
import { AgentsModule } from "./features/agents/module";
import { ModelsModule } from "./features/models/module";
import { PluginsModule } from "./features/plugins/module";
import { MachinesModule } from "./features/machines/module";
import { PortsModule } from "./features/ports/module";
import { UsageModule } from "./features/usage/module";
import { BenchmarkModule } from "./features/benchmark/module";
import { DashboardModule } from "./features/dashboard/module";
import { TerminalModule } from "./features/terminal/module";
import { WorkflowsModule } from "./features/workflows/module";
import { CompanyModule } from "./features/company/module";
import { ProposalsModule } from "./features/proposals/module";
import { BuiltinBrowserModule } from "./features/builtin-browser/module";
import { SettingsModule } from "./features/settings/module";
import { SchedulesModule } from "./features/schedules/module";
import { SessionListModule } from "./features/session-list/module";
import { ProjectsModule } from "./features/projects/module";
import { MessagingModule } from "./features/messaging/module";
import { DockModule } from "./features/dock/module";
import { WorkspaceModule } from "./features/workspace/module";
import { TracesModule } from "./features/traces/module";
import { TodosModule } from "./features/todos/module";

@Module({
  children: [
    ShellModule,
    SidebarModule,
    SessionsModule,
    ChatModule,
    AgentsModule,
    ModelsModule,
    PluginsModule,
    MachinesModule,
    PortsModule,
    UsageModule,
    BenchmarkModule,
    DashboardModule,
    TerminalModule,
    WorkflowsModule,
    CompanyModule,
    ProposalsModule,
    BuiltinBrowserModule,
    SettingsModule,
    SchedulesModule,
    SessionListModule,
    ProjectsModule,
    MessagingModule,
    DockModule,
    TodosModule,
    WorkspaceModule,
    TracesModule,
  ],
})
export class WebRoot {}

const NO_RESOURCES: Resources = {
  register: () => () => {},
  claim: () => undefined,
};

/** The root with the plugins' modules as its runtime children (its manifest then accepts `"*"`). */
const rootWith = (extra: ModuleDef[]): ModuleDef =>
  moduleDefOf(WebRoot, { manifests: table.modules as unknown as ManifestTable, extra });

const HOST_TABLE = table as unknown as IfaceTable;

/**
 * Boots the module tree — the app's modules and the plugins' web modules the server forwarded
 * (plugins/assemble.ts) — and returns the component the app mounts. A plugin that does not fit is
 * left out; should the tree with the admitted ones still fail to boot, it boots without plugins.
 */
export async function bootWeb(
  packages: readonly WebModulePackage[] = [],
  load?: ImportModule,
): Promise<ComponentType<AppRouterProps>> {
  const plugins = await assemblePlugins(packages, rootWith, HOST_TABLE, load);
  const boot = async (extra: ModuleDef[], ifaces: IfaceTable) =>
    (await bootVerified(rootWith(extra), { ifaces, resources: NO_RESOURCES })).api<Shell>(
      "ShellModule",
      "shell",
    ).Root;
  if (plugins.length === 0) return boot([], HOST_TABLE);
  try {
    return await boot(
      plugins.flatMap((p) => p.defs),
      mergedTable(HOST_TABLE, plugins),
    );
  } catch (err) {
    leaveOutAll(plugins, err);
    return boot([], HOST_TABLE);
  }
}
