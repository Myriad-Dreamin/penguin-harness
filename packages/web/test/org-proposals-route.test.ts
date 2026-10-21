// @vitest-environment jsdom
/**
 * A company-mode page a plugin contributes (`nav: "org"`) is not in the local manifest: its
 * entry arrives at runtime (features/company/use-org-pages.ts, GET /api/contributions), after
 * the router was built. router.tsx therefore mounts them through one wildcard child of the
 * organization layout (`OrgContributedPages`), which re-matches the table as it stands. These
 * cases pin what that child has to do:
 *
 * - a contributed `proposals/:number?` page is drawn on its own path — the queue without a
 *   number, the graph and the activity feed with theirs — and the address stays where the
 *   reader put it;
 * - a cold deep link is not sent to the overview while the contributions are still on their
 *   way: it shows the page's skeleton, and the page mounts when the table answers;
 * - a child the table does not hold is sent to the overview by an ABSOLUTE path, so an unknown
 *   address can never append `/overview` to itself.
 *
 * The table and the proposals page are stood in for: the mounting is what is under test, and
 * the real page needs the whole signed-in organization around it (its own suite covers its
 * drawing).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { Navigate, Outlet, RouterProvider, createMemoryRouter } from "react-router";
import type { PageEntry } from "../src/lib/pages";
import { OrgContributedPages, appRoutes } from "../src/router";
import { mount, run, settle, unmountAll } from "./helpers/dom";

type Status = "idle" | "loading" | "ready" | "error";

interface Table {
  pages: readonly PageEntry[];
  status: Status;
}

/** The runtime page table, with the store's subscription (the component reads through it). */
const store = vi.hoisted(() => {
  let state = { pages: [] as readonly PageEntry[], status: "idle" as Status };
  const listeners = new Set<() => void>();
  return {
    get: (): Table => state,
    set: (next: Table): void => {
      state = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});

vi.mock("../src/features/company/use-org-pages", async () => {
  const { useSyncExternalStore } = await import("react");
  const useTable = () => useSyncExternalStore(store.subscribe, store.get);
  return {
    useOrgPages: () => useTable().pages,
    useOrgPagesState: () => useTable(),
  };
});

/** The contributed page's renderer, stood in for by a line that names the route's parameter. */
vi.mock("../src/features/proposals/proposals-page", async () => {
  const { createElement } = await import("react");
  const { useParams } = await import("react-router");
  return {
    OrgProposalsPage: () => {
      const params = useParams<{ number?: string }>();
      return createElement(
        "p",
        { "data-testid": "proposals-page" },
        `proposals ${params.number ?? "queue"}`,
      );
    },
  };
});

/** The mounted pages only ask whether the reader is an admin; the organization is elsewhere. */
vi.mock("../src/state/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/state/auth")>();
  return {
    ...actual,
    useAuth: (): ReturnType<typeof actual.useAuth> =>
      ({ user: { userId: "tester", isAdmin: true } }) as ReturnType<typeof actual.useAuth>,
  };
});

/** The contribution the company-proposals plugin makes: the queue and everything after it. */
const PROPOSALS: PageEntry = {
  id: "company-proposals.proposals",
  key: "org-proposals",
  path: "proposals/:number?",
  nav: "org",
  admin: false,
  released: true,
  renderer: { builtin: "OrgProposalsPage" },
};

/** The organization layout's own routes around the wildcard child, and the address it opens on. */
function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/org/:projectId/:orgId",
        element: h(Outlet),
        children: [
          { index: true, element: h(Navigate, { to: "overview", replace: true }) },
          { path: "overview", element: h("p", null, "the overview") },
          { path: "*", element: h(OrgContributedPages) },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return { router, mounted: mount(h(RouterProvider, { router })) };
}

const where = (router: ReturnType<typeof createMemoryRouter>) => router.state.location.pathname;

/** The router's own tree, for the one assertion that is about wiring rather than rendering. */
interface RouteNode {
  path?: string;
  element?: { type?: unknown };
  children?: RouteNode[];
}

function routeAt(routes: RouteNode[], path: string): RouteNode | undefined {
  for (const route of routes) {
    if (route.path === path) return route;
    const hit = route.children === undefined ? undefined : routeAt(route.children, path);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

describe("the company-mode pages a plugin contributes", () => {
  beforeEach(() => {
    store.set({ pages: [], status: "idle" });
  });

  afterEach(async () => {
    await unmountAll();
  });

  it("is the component the organization layout mounts on its wildcard child", () => {
    // The router's real tree: the wildcard child carries the contributed pages, and it is the
    // mounting component — not the bare relative redirect that used to stand there.
    const org = routeAt(appRoutes() as unknown as RouteNode[], "/org/:projectId/:orgId");
    expect(org).toBeDefined();
    const wildcard = org?.children?.find((child) => child.path === "*");
    expect(wildcard?.element?.type).toBe(OrgContributedPages);
  });

  it("draws the contributed page on its own path, leaving the address alone", async () => {
    store.set({ pages: [PROPOSALS], status: "ready" });
    const { router, mounted } = renderAt("/org/proj/org/proposals");
    await mounted;
    await settle();
    expect(document.body.textContent).toContain("proposals queue");
    expect(where(router)).toBe("/org/proj/org/proposals");
  });

  it("hands the page its own route parameter: a proposal, the graph, the activity feed", async () => {
    store.set({ pages: [PROPOSALS], status: "ready" });
    for (const [path, shown] of [
      ["/org/proj/org/proposals/3", "proposals 3"],
      ["/org/proj/org/proposals/graph", "proposals graph"],
      ["/org/proj/org/proposals/activity", "proposals activity"],
    ] as const) {
      const { router, mounted } = renderAt(path);
      await mounted;
      await settle();
      expect(document.body.textContent).toContain(shown);
      expect(where(router)).toBe(path);
      await unmountAll();
    }
  });

  it("follows the queue's own link to one proposal", async () => {
    store.set({ pages: [PROPOSALS], status: "ready" });
    const { router, mounted } = renderAt("/org/proj/org/proposals");
    await mounted;
    await settle();
    expect(document.body.textContent).toContain("proposals queue");
    await run(() => router.navigate("/org/proj/org/proposals/7"));
    expect(document.body.textContent).toContain("proposals 7");
    expect(where(router)).toBe("/org/proj/org/proposals/7");
  });

  it("waits for the table on a cold deep link instead of jumping to the overview", async () => {
    // What a page load is before GET /api/contributions answers: no contributed page yet.
    store.set({ pages: [], status: "loading" });
    const { router, mounted } = renderAt("/org/proj/org/proposals");
    await mounted;
    await settle();
    expect(where(router)).toBe("/org/proj/org/proposals");
    expect(document.body.textContent).not.toContain("the overview");
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    // The table answers with the page: it mounts in place, without a navigation.
    await run(() => store.set({ pages: [PROPOSALS], status: "ready" }));
    expect(document.body.textContent).toContain("proposals queue");
    expect(where(router)).toBe("/org/proj/org/proposals");
  });

  it("sends a child the table does not hold to the overview by an absolute path", async () => {
    store.set({ pages: [PROPOSALS], status: "ready" });
    // Two segments too many for `proposals/:number?` — and nothing else claims them.
    const { router, mounted } = renderAt("/org/proj/org/proposals/3/extra");
    await mounted;
    await settle();
    expect(where(router)).toBe("/org/proj/org/overview");
    expect(document.body.textContent).toContain("the overview");
  });

  it("does not append overview to an address no page claims", async () => {
    store.set({ pages: [PROPOSALS], status: "ready" });
    const { router, mounted } = renderAt("/org/proj/org/not-a-page");
    await mounted;
    await settle();
    expect(where(router)).toBe("/org/proj/org/overview");
  });
});
