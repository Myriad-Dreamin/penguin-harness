/**
 * The booted page table: the real composition root (web-root.ts) boots under vitest, and the
 * shell receives every page the modules contributed.
 *
 * - bootWeb() boots the tree and hands back the shell's root component.
 * - Every page has a unique id, key and path, and the component its module bound.
 * - Terminal and the workflow app pages mount outside the shell; everything else inside it.
 * - The main nav is Agents, Models, Plugins, Machines, Usage, Benchmark in that order, all
 *   released, Machines alone admin-only, and every key has a nav label and an icon.
 * - A member's nav drops admin-only pages and adds nothing the admin lacks.
 * - The shell receives company's provider for the signed-in session, the four layers in their
 *   mount order, and the user event handlers of company, the built-in browser and schedules in
 *   their dispatch order.
 */
import { bootModules, moduleDefOf } from "@prismshadow/penguin-core/kernel";
import type {
  ClassCtx,
  Contributed,
  IfaceTable,
  ManifestTable,
} from "@prismshadow/penguin-core/kernel";
import { beforeAll, describe, expect, it } from "vitest";
import table from "../src/ifaces.json";
import { bootWeb, WebRoot } from "../src/web-root";
import { ShellModule } from "../src/shell/module";
import { navPagesOf } from "../src/shell";
import type { ShellPage } from "../src/shell";
import { pageTableOf } from "../src/shell/page-table";
import { navKeysFor } from "../src/shell/sidebar/nav-state";
import { zh } from "../src/lib/strings";
import { NAV_ICONS } from "../src/lib/nav-icons";
import { AgentsPage } from "../src/features/agents/agents-page";
import { TerminalPage } from "../src/features/terminal/terminal-page";
import { OrgRoutes } from "../src/features/company/org-routes";
import { CompanyProvider, companyUserEvents } from "../src/features/company/company-state";
import { TerminalDockRuntime } from "../src/features/terminal/terminal-view-pool";
import { ShortcutRuntime } from "../src/features/settings/shortcut-runtime";
import { BuiltinBrowserLayer } from "../src/features/builtin-browser/browser-layer";
import { builtinBrowserUserEvents } from "../src/features/builtin-browser/browser-events";
import { AppPalette } from "../src/features/palette/app-palette";
import { scheduleUserEvents } from "../src/features/schedules/schedule-store";
import type { UserEventHandler } from "../src/state/user-events";

let pages: readonly ShellPage[] = [];
let sessionProviders: readonly Contributed[] = [];
let layers: readonly Contributed[] = [];
let userEvents: readonly UserEventHandler[] = [];

/** A slot's code halves in the order the shell mounts them. */
const codeByOrder = (list: readonly Contributed[]): unknown[] =>
  [...list].sort((a, b) => (a.data.order as number) - (b.data.order as number)).map((c) => c.code);

/**
 * Boots the real tree as bootWeb does, with the shell standing in by a double that keeps the
 * page table and the other slots' contributions instead of binding them into the router (which needs a browser to render).
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
  await bootModules(
    moduleDefOf(WebRoot, {
      manifests: table.modules as unknown as ManifestTable,
      instances: new Map([[ShellModule, shell]]),
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
    for (const { key } of nav) {
      expect(zh.nav).toHaveProperty(key);
      expect(NAV_ICONS).toHaveProperty(key);
    }
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
  it("company provides the signed-in session's company state", () => {
    expect(codeByOrder(sessionProviders)).toEqual([CompanyProvider]);
  });

  it("mounts the four layers in the order the layout mounted them", () => {
    expect(codeByOrder(layers)).toEqual([
      TerminalDockRuntime,
      ShortcutRuntime,
      BuiltinBrowserLayer,
      AppPalette,
    ]);
  });

  it("dispatches user events to company, the built-in browser and schedules, in that order", () => {
    expect(userEvents).toEqual([companyUserEvents, builtinBrowserUserEvents, scheduleUserEvents]);
  });
});
