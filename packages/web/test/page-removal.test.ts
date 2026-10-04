/**
 * Pages removed by the modules' `ShellModule.pageRemovals` contributions (shell/page-table.ts
 * `removedPagesOf`, shell/contributions.tsx `pageTableFor`, the shell's provider).
 *
 * - A removal drops the page its key names and every page whose route lies under that page's
 *   path (`benchmark` takes `/benchmark/:benchmarkId`, not the other way round); a key naming no
 *   page does nothing; a page at "/" takes only itself; the pages answering HOME_PATHS stay —
 *   the home page (`*`) and the homes it leads to in both modes (company-nav.ts `homePath`).
 * - The table: removals apply to compiled and contributed pages alike, before the parent check,
 *   so a removed page's children go too — a module's child page as well as a contributed one.
 * - The provider applies the shell's removals from the first render, before (and without) any
 *   answer from the server.
 */
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ContributionsResponse } from "@prismshadow/penguin-server/api";
import { describe, expect, it, vi } from "vitest";
import {
  pageTableFor,
  ShellPagesProvider,
  useShellPages,
  useShellPagesPending,
} from "../src/shell/contributions";
import { shellDeps } from "../src/shell/deps";
import type { ShellDeps } from "../src/shell/deps";
import { homePath } from "../src/features/company/company-nav";
import { HOME_PATHS, removedPagesOf } from "../src/shell/page-table";
import type { ShellPage } from "../src/shell/page-table";

vi.mock("../src/state/auth", () => ({ useAuth: () => ({ user: { userId: "bob" } }) }));
vi.mock("../src/api/endpoints", () => ({
  getContributions: vi.fn(() => new Promise<never>(() => undefined)),
}));

const Blank: ComponentType = () => null;

function page(key: string, path: string, extra: Partial<ShellPage> = {}): ShellPage {
  return {
    id: `${key}.page`,
    key,
    path,
    frame: "shell",
    nav: "main",
    admin: false,
    released: true,
    order: 0,
    Component: Blank,
    ...extra,
  };
}

/** The compiled pages that matter here, with the app's own paths. */
const COMPILED: ShellPage[] = [
  page("chat", "/chat/:sessionId?", { order: 10 }),
  page("agents", "/agents", { order: 20 }),
  page("agent-settings", "/agents/:agentId", { nav: "none", order: 21 }),
  page("plugins", "/plugins", { order: 40 }),
  page("plugin-detail", "/plugins/registry/*", { nav: "none", order: 41 }),
  page("benchmark", "/benchmark", { order: 70 }),
  page("benchmark-detail", "/benchmark/:benchmarkId", { nav: "none", order: 71 }),
  page("workflow-app", "/app/:projectId/:agentId/:workflowId", { frame: "bare", order: 110 }),
  page("workflow-app-tab", "/app/:projectId/:agentId/:workflowId/:tabKey", {
    frame: "bare",
    order: 111,
  }),
];

const keysOf = (pages: readonly ShellPage[]) => pages.map((p) => p.key);

/** No builtin page renderer: the contributed pages here are iframes. */
const NONE: ReadonlyMap<string, ComponentType> = new Map();

/** An answer as the server might send it. */
function answer(pages: readonly object[]): ContributionsResponse {
  return {
    pages,
    webModules: [],
    agentTabs: [],
    sessionTabs: [],
  } as unknown as ContributionsResponse;
}

/** A page the server contributes under the Evaluation Center. */
const CONTRIBUTED_CHILD = {
  id: "child.page",
  from: "ChildPage",
  key: "contributed-child",
  path: "/contributed-child",
  nav: "main",
  admin: false,
  parent: "benchmark",
  renderer: { iframe: { src: "/child.html", namespace: "child" } },
};
/** A module's page under the Evaluation Center, as example-hello-page contributes it. */
const HELLO = page("example-hello", "/example-hello", { parent: "benchmark", order: 72 });

describe("removedPagesOf", () => {
  it("drops the named page and the routes under its path, not the pages above it", () => {
    expect(keysOf(removedPagesOf(COMPILED, ["benchmark"]))).toEqual([
      "chat",
      "agents",
      "agent-settings",
      "plugins",
      "plugin-detail",
      "workflow-app",
      "workflow-app-tab",
    ]);
    expect(keysOf(removedPagesOf(COMPILED, ["benchmark-detail"]))).toContain("benchmark");
    expect(keysOf(removedPagesOf(COMPILED, ["plugins"]))).not.toContain("plugin-detail");
    expect(keysOf(removedPagesOf(COMPILED, ["workflow-app"]))).not.toContain("workflow-app-tab");
    expect(keysOf(removedPagesOf(COMPILED, ["workflow-app-tab"]))).toContain("workflow-app");
  });

  it("compares whole segments: /agents does not take /agentsx", () => {
    const table = [...COMPILED, page("agentsx", "/agentsx")];
    expect(keysOf(removedPagesOf(table, ["agents"]))).toContain("agentsx");
  });

  it("returns the table as it is for no keys or keys naming no page", () => {
    expect(removedPagesOf(COMPILED, [])).toBe(COMPILED);
    expect(removedPagesOf(COMPILED, ["nowhere"])).toBe(COMPILED);
  });

  it("removes a page at / alone, not the whole table under it", () => {
    const table = [...COMPILED, page("root", "/")];
    expect(keysOf(removedPagesOf(table, ["root"]))).toEqual(keysOf(COMPILED));
  });

  it("keeps the page the catch-all leads to, however it is named", () => {
    expect(keysOf(removedPagesOf(COMPILED, ["chat"]))).toEqual(keysOf(COMPILED));
    // Kept by what it answers, not by its key: any page a home path would land on stays.
    const table = [...COMPILED, page("section", "/:section")];
    expect(keysOf(removedPagesOf(table, ["section"]))).toEqual(keysOf(table));
  });

  it("keeps the home page and the homes it leads to in either mode", () => {
    expect(HOME_PATHS).toEqual([homePath("dev"), homePath("company")]);
    const table = [
      ...COMPILED,
      page("org", "/org/*", { nav: "none", order: 120 }),
      page("home", "*", { nav: "none", order: 130 }),
    ];
    expect(keysOf(removedPagesOf(table, ["home", "org", "chat"]))).toEqual(keysOf(table));
    expect(keysOf(removedPagesOf(table, ["home", "benchmark"]))).toEqual(
      keysOf(table).filter((k) => !k.startsWith("benchmark")),
    );
  });
});

describe("pageTableFor", () => {
  it("is the compiled table without an answer or a removal", () => {
    expect(pageTableFor(COMPILED, null, NONE)).toBe(COMPILED);
    expect(pageTableFor(COMPILED, null, NONE, [])).toBe(COMPILED);
  });

  it("removes a compiled page with its children, a module's and a contributed one alike", () => {
    const compiled = [...COMPILED, HELLO];
    const kept = keysOf(pageTableFor(compiled, answer([CONTRIBUTED_CHILD]), NONE));
    expect(kept).toContain("example-hello");
    expect(kept).toContain("contributed-child");
    const removed = keysOf(
      pageTableFor(compiled, answer([CONTRIBUTED_CHILD]), NONE, ["benchmark"]),
    );
    expect(removed).not.toContain("benchmark");
    expect(removed).not.toContain("benchmark-detail");
    expect(removed).not.toContain("example-hello");
    expect(removed).not.toContain("contributed-child");
    expect(removed).toContain("agents");
  });

  it("removes a contributed page by its key", () => {
    const table = pageTableFor(COMPILED, answer([CONTRIBUTED_CHILD]), NONE, ["contributed-child"]);
    expect(keysOf(table)).toEqual(keysOf(COMPILED));
  });

  it("removes nothing in a table that does not hold the key", () => {
    expect(keysOf(pageTableFor(COMPILED, null, NONE, ["nowhere"]))).toEqual(keysOf(COMPILED));
  });
});

describe("the shell's provider", () => {
  it("applies the modules' removals from the first render, before any answer", () => {
    function Probe() {
      const keys = keysOf(useShellPages()).join(",");
      return createElement("p", null, `${keys} pending=${String(useShellPagesPending())}`);
    }
    const Root = shellDeps.provide(
      {
        pages: [...COMPILED, HELLO],
        pageRenderers: NONE,
        pageRemovals: ["benchmark"],
      } as unknown as ShellDeps,
      () => createElement(ShellPagesProvider, null, createElement(Probe)),
    );
    const kept = COMPILED.filter((p) => !p.key.startsWith("benchmark"));
    expect(renderToStaticMarkup(createElement(Root))).toBe(
      `<p>${keysOf(kept).join(",")} pending=true</p>`,
    );
  });
});
