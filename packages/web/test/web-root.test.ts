/**
 * The booted page table: the real composition root (web-root.ts) boots under vitest, and the
 * shell receives every page the modules contributed.
 *
 * - bootWeb() boots the tree and hands back the shell's root component.
 * - Every page has a unique id, key and path, and the component its module bound.
 * - Terminal and the workflow app pages mount outside the shell; everything else inside it.
 * - The main nav is Agents, Models, Plugins, Machines, Usage, Benchmark in that order, all
 *   released, Machines alone admin-only, and every page names its nav title in both languages
 *   (the words the nav dictionary held) and a glyph in the icon registry.
 * - A member's nav drops admin-only pages and adds nothing the admin lacks.
 * - The shell receives company's provider and the update badges' owner for the signed-in
 *   session, the five layers in their mount order, and the user event handlers of company, the
 *   built-in browser and schedules in their dispatch order.
 * - The sidebar receives the Project switcher and the session list for development mode,
 *   company's mode with its switcher, channels and desks, and the to-do dots and the balance on
 *   their anchors; the session list receives the messaging binding, the scheduled mark and the
 *   dock's "Browse files".
 * - The dock receives the seven panels in their menu order — agents and memory from chat, the
 *   files from workspace, the trace, messaging, schedules and the built-in browser from theirs —
 *   with the names the dictionary held and a glyph in the icon registry; the panel table reaches
 *   the docks as the innermost provider of the signed-in session.
 * - The chat page receives the workflow tab strip beside the conversation.
 */
import type { ReactNode } from "react";
import { bootModules, moduleDefOf } from "@prismshadow/penguin-core/kernel";
import type {
  ClassCtx,
  Contributed,
  IfaceTable,
  ManifestTable,
  ModuleClass,
} from "@prismshadow/penguin-core/kernel";
import { beforeAll, describe, expect, it } from "vitest";
import table from "../src/ifaces.json";
import { bootWeb, WebRoot } from "../src/web-root";
import { ShellModule } from "../src/shell/module";
import { navPagesOf } from "../src/shell";
import type { ShellPage } from "../src/shell";
import { pageTableOf } from "../src/shell/page-table";
import { navKeysFor } from "../src/shell/sidebar/nav-state";
import { SidebarModule } from "../src/shell/sidebar/module";
import { badgesOf, marksFor, modesOf, sectionsIn, sectionsOf } from "../src/shell/sidebar/modes";
import { SessionListModule } from "../src/features/session-list/module";
import { rowExtensionsOf } from "../src/features/session-list/row-actions";
import type { RowExtensions } from "../src/features/session-list/row-actions";
import { zh } from "../src/lib/strings";
import { en } from "../src/lib/strings-en";
import { glyphOf } from "../src/lib/nav-icons";
import { AgentsPage } from "../src/features/agents/agents-page";
import { TerminalPage } from "../src/features/terminal/terminal-page";
import { OrgRoutes } from "../src/features/company/org-routes";
import { CompanyProvider, companyUserEvents } from "../src/features/company/company-state";
import { TerminalDockRuntime } from "../src/features/terminal/terminal-view-pool";
import { ShortcutRuntime } from "../src/features/settings/shortcut-runtime";
import { BuiltinBrowserLayer } from "../src/features/builtin-browser/browser-layer";
import { builtinBrowserUserEvents } from "../src/features/builtin-browser/browser-events";
import { scheduleUserEvents } from "../src/features/schedules/schedule-store";
import { SettingsLayer } from "../src/features/settings/settings-layer";
import { DockScope } from "../src/features/dock/dock-scope";
import {
  UpdateBadgesProvider,
  accountBadge,
  agentsBadge,
  menuBadge,
  modelsBadge,
  pluginsBadge,
  usageBadge,
} from "../src/features/todos/badges-context";
import { PinnedBalanceBadge } from "../src/features/models/group-balance";
import { ProjectSwitcher } from "../src/features/projects/project-switcher";
import {
  companyChannels,
  companyDesks,
  companyMode,
  companySwitcher,
} from "../src/features/company/sidebar-mode";
import { messagingRowAction } from "../src/features/messaging/session-row-action";
import { scheduledRowMark } from "../src/features/schedules/session-row-mark";
import { browseFilesAction } from "../src/features/dock/browse-files";
import type { UserEventHandler } from "../src/state/user-events";
import { DockModule } from "../src/features/dock/module";
import { panelsOf } from "../src/features/dock/deps";
import { AgentsPanel } from "../src/features/chat/panels/agents-panel";
import { MemoryPanel } from "../src/features/chat/panels/memory-panel";
import { WorkspacePanel } from "../src/features/workspace/workspace-panel";
import { TraceDockPanel } from "../src/features/traces/trace-dock-panel";
import { MessagingDockPanel } from "../src/features/messaging/messaging-dock-panel";
import { ScheduleDockPanel } from "../src/features/schedules/schedule-dock-panel";
import { BuiltinBrowserPanel } from "../src/features/builtin-browser/browser-panel";
import { ChatModule } from "../src/features/chat/module";
import { fileRenderersOf, sessionTabsOf } from "../src/features/chat/deps";
import { AudioFile } from "../src/features/audio/audio-file";
import { WorkflowSessionTab } from "../src/features/workflows/session-tab";

let pages: readonly ShellPage[] = [];
let sessionProviders: readonly Contributed[] = [];
let layers: readonly Contributed[] = [];
let userEvents: readonly UserEventHandler[] = [];
let sidebarSlots: Readonly<Record<string, readonly Contributed[]>> = {};
let rows: RowExtensions | null = null;
let sessionListSection: unknown = null;
let dockPanels: readonly Contributed[] = [];
let sessionTabs: readonly Contributed[] = [];
let fileRenderers: readonly Contributed[] = [];

/** The dock double's stand-in for the provider that carries the panel table. */
function PanelTableDouble({ children }: { children: ReactNode }) {
  return children;
}

/** A slot's code halves in the order the shell mounts them. */
const codeByOrder = (list: readonly Contributed[]): unknown[] =>
  [...list].sort((a, b) => (a.data.order as number) - (b.data.order as number)).map((c) => c.code);

/**
 * Boots the real tree as bootWeb does, with the shell, the sidebar, the session list, the dock and
 * the chat page standing in by doubles that keep their slots' contributions instead of binding
 * them into components (which need a browser to render).
 */
beforeAll(async () => {
  const shell = Object.assign(new ShellModule(), {
    setup({ contributions }: ClassCtx) {
      pages = pageTableOf(contributions.pages ?? []);
      sessionProviders = contributions.sessionProviders ?? [];
      layers = contributions.layers ?? [];
      userEvents = shell.userEventHandlers.all();
      shell.shell = { Root: () => null };
    },
  });
  const sidebar = Object.assign(new SidebarModule(), {
    setup({ contributions }: ClassCtx) {
      sidebarSlots = contributions;
      sidebar.sidebar = {
        Column: () => null,
        Rail: () => null,
        useColumnState: () => ({ inDefaultMode: true, listName: "", menuNote: null }),
      };
    },
  });
  const sessionList = Object.assign(new SessionListModule(), {
    setup({ contributions }: ClassCtx) {
      rows = rowExtensionsOf(contributions.rowActions ?? []);
      sessionList.section = { Full: () => null };
      sessionList.sessionList = {};
      sessionListSection = sessionList.section;
    },
  });
  const dock = Object.assign(new DockModule(), {
    setup({ contributions }: ClassCtx) {
      dockPanels = contributions.panels ?? [];
      dock.panels = PanelTableDouble;
      dock.dock = {};
    },
  });
  const chat = Object.assign(new ChatModule(), {
    setup({ contributions }: ClassCtx) {
      sessionTabs = contributions.sessionTabs ?? [];
      fileRenderers = contributions.fileRenderers ?? [];
      chat.page = () => null;
      chat.chat = {};
    },
  });
  await bootModules(
    moduleDefOf(WebRoot, {
      manifests: table.modules as unknown as ManifestTable,
      instances: new Map<ModuleClass, object>([
        [ShellModule, shell],
        [SidebarModule, sidebar],
        [SessionListModule, sessionList],
        [DockModule, dock],
        [ChatModule, chat],
      ]),
    }),
    {
      ifaces: table as unknown as IfaceTable,
      resources: { register: () => () => {}, claim: () => undefined },
    },
  );
});

describe("the booted page table", () => {
  it("bootWeb() hands back the shell's root component", async () => {
    expect(typeof (await bootWeb())).toBe("function");
  });

  it("every page has a unique id, key and path, and its bound component", () => {
    expect(pages.length).toBeGreaterThan(0);
    expect(new Set(pages.map((p) => p.id)).size).toBe(pages.length);
    expect(new Set(pages.map((p) => p.key)).size).toBe(pages.length);
    expect(new Set(pages.map((p) => p.path)).size).toBe(pages.length);
    for (const page of pages) expect(typeof page.Component).toBe("function");
    expect(pages.find((p) => p.key === "agents")?.Component).toBe(AgentsPage);
    expect(pages.find((p) => p.key === "terminal")?.Component).toBe(TerminalPage);
    expect(pages.find((p) => p.path === "/org/*")?.Component).toBe(OrgRoutes);
  });

  it("mounts the terminal and the workflow app pages outside the shell", () => {
    expect(pages.filter((p) => p.frame === "bare").map((p) => p.path)).toEqual([
      "/terminal",
      "/app/:projectId/:agentId/:workflowId",
      "/app/:projectId/:agentId/:workflowId/:tabKey",
    ]);
  });

  it("keeps the main nav's order, release and admin flags", () => {
    const nav = navPagesOf(pages);
    expect(nav.map(({ key, admin, released }) => ({ key, admin, released }))).toEqual([
      { key: "agents", admin: false, released: true },
      { key: "models", admin: false, released: true },
      { key: "plugins", admin: false, released: true },
      { key: "machines", admin: true, released: true },
      { key: "usage", admin: false, released: true },
      { key: "benchmark", admin: false, released: true },
    ]);
  });

  it("names every nav page's title in both languages and its glyph", () => {
    const nav = navPagesOf(pages);
    expect(nav.map(({ key, title, titleZh, icon }) => ({ key, title, titleZh, icon }))).toEqual([
      { key: "agents", title: en.nav.agents, titleZh: zh.nav.agents, icon: "robot" },
      { key: "models", title: "Models", titleZh: "模型库", icon: "chip" },
      { key: "plugins", title: en.nav.plugins, titleZh: zh.nav.plugins, icon: "puzzle" },
      {
        key: "machines",
        title: en.machines.pageTitle,
        titleZh: zh.machines.pageTitle,
        icon: "server",
      },
      { key: "usage", title: en.nav.usage, titleZh: zh.nav.usage, icon: "barChart" },
      { key: "benchmark", title: "Evaluation Center", titleZh: "评估中心", icon: "trophy" },
    ]);
    for (const page of nav) expect(glyphOf(page.icon)).not.toBe("");
  });

  it("the nav a member sees drops admin-only pages", () => {
    const nav = navPagesOf(pages);
    const admin = navKeysFor(nav, true);
    const member = navKeysFor(nav, false);
    expect(admin).toContain("machines");
    expect(member).not.toContain("machines");
    expect(member.every((key) => admin.includes(key))).toBe(true);
  });
});

describe("the booted shell slots", () => {
  it("company provides the company state, to-dos the update badges' owner", () => {
    expect(codeByOrder(sessionProviders)).toEqual([
      CompanyProvider,
      UpdateBadgesProvider,
      PanelTableDouble,
    ]);
  });

  it("mounts the five layers in their order, the dock's scope last", () => {
    expect(codeByOrder(layers)).toEqual([
      TerminalDockRuntime,
      ShortcutRuntime,
      SettingsLayer,
      BuiltinBrowserLayer,
      DockScope,
    ]);
  });

  it("dispatches user events to company, the built-in browser and schedules, in that order", () => {
    expect(userEvents).toEqual([companyUserEvents, builtinBrowserUserEvents, scheduleUserEvents]);
  });
});

describe("the booted sidebar slots", () => {
  it("development mode: the Project switcher above, the session list below", () => {
    const sections = sectionsOf(sidebarSlots.sections ?? []);
    expect(sectionsIn(sections, "dev", "header").map((s) => s.section.Full)).toEqual([
      ProjectSwitcher,
    ]);
    expect(sectionsIn(sections, "dev", "body").map((s) => s.section)).toEqual([sessionListSection]);
  });

  it("company contributes its mode, its switcher, its channels and its desks", () => {
    const sections = sectionsOf(sidebarSlots.sections ?? []);
    expect(modesOf(sidebarSlots.modes ?? []).map(({ key, mode }) => ({ key, mode }))).toEqual([
      { key: "company", mode: companyMode },
    ]);
    expect(sectionsIn(sections, "company", "header").map((s) => s.section)).toEqual([
      companySwitcher,
    ]);
    expect(sectionsIn(sections, "company", "body").map((s) => s.section)).toEqual([
      companyChannels,
      companyDesks,
    ]);
  });

  it("puts the to-do dots and the balance on their anchors", () => {
    const badges = badgesOf(sidebarSlots.navBadges ?? []);
    const on = (anchor: string) => badges.filter((b) => b.anchor === anchor).map((b) => b.badge);
    expect(on("agents")).toEqual([agentsBadge]);
    expect(on("models")).toEqual([modelsBadge]);
    expect(on("plugins")).toEqual([pluginsBadge]);
    expect(on("usage")).toEqual([usageBadge]);
    expect(on("menu")).toEqual([menuBadge]);
    expect(on("account")[0]).toBe(accountBadge);
    expect(marksFor(badges, "account").map((m) => m.Mark)).toEqual([PinnedBalanceBadge]);
  });

  it("gives the session list the binding entry, the two marks and Browse files", () => {
    expect(rows?.sessionEntries).toEqual([messagingRowAction.sessionEntry]);
    expect(rows?.marks).toEqual([messagingRowAction.sessionMark, scheduledRowMark.sessionMark]);
    expect(rows?.workspaceEntries).toEqual([browseFilesAction.workspaceEntry]);
  });
});

describe("the booted dock slot", () => {
  it("the dock receives the seven panels, in their order, each from its module", () => {
    const { panels } = panelsOf(dockPanels);
    expect(
      panels.map(({ kind, title, titleZh, icon, Body }) => ({ kind, title, titleZh, icon, Body })),
    ).toEqual([
      {
        kind: "agents",
        title: "Agents panel",
        titleZh: "智能体面板",
        icon: "robotPair",
        Body: AgentsPanel,
      },
      {
        kind: "workspace",
        title: "Files",
        titleZh: "文件浏览",
        icon: "folder",
        Body: WorkspacePanel,
      },
      { kind: "memory", title: "Memory", titleZh: "记忆", icon: "brain", Body: MemoryPanel },
      {
        kind: "trace",
        title: en.nav.traces,
        titleZh: zh.nav.traces,
        icon: "eye",
        Body: TraceDockPanel,
      },
      {
        kind: "messaging",
        title: "Remote control",
        titleZh: "远程控制",
        icon: "paperPlane",
        Body: MessagingDockPanel,
      },
      {
        kind: "schedules",
        title: en.schedule.panelTitle,
        titleZh: zh.schedule.panelTitle,
        icon: "alarmClock",
        Body: ScheduleDockPanel,
      },
      {
        kind: "builtin-browser",
        title: "Browser",
        titleZh: "浏览器",
        icon: "globe",
        Body: BuiltinBrowserPanel,
      },
    ]);
    for (const panel of panels) expect(panel.glyph).not.toBe("");
    expect(Object.fromEntries(dockPanels.map((c) => [c.data.kind as string, c.from]))).toEqual({
      agents: "ChatModule",
      memory: "ChatModule",
      workspace: "WorkspaceModule",
      trace: "TracesModule",
      messaging: "MessagingModule",
      schedules: "SchedulesModule",
      "builtin-browser": "BuiltinBrowserModule",
    });
  });
});

describe("the booted chat slot", () => {
  it("the chat page receives the workflow tab strip", () => {
    expect(sessionTabsOf(sessionTabs).map(({ Tab }) => Tab)).toEqual([WorkflowSessionTab]);
    expect(sessionTabs.map((c) => c.from)).toEqual(["WorkflowsModule"]);
  });

  it("the chat page's file renderer registry holds the audio module's player as `audio`", () => {
    expect([...fileRenderersOf(fileRenderers)]).toEqual([["audio", AudioFile]]);
    expect(fileRenderers.map((c) => c.from)).toEqual(["AudioModule"]);
  });
});
