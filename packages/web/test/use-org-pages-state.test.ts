// @vitest-environment jsdom
/**
 * The runtime page table's load state (features/company/use-org-pages.ts). The router reads it
 * to tell "this build/plugin does not contribute the page" from "the contributions have not
 * answered yet" — the second is what a cold deep link on a contributed page arrives in, and
 * treating it as the first is how such a link was being thrown away.
 *
 * - while GET /api/contributions is unanswered the state is `loading`, never `ready`;
 * - the answer folds the contributed pages in and settles the state as `ready`;
 * - a failed request settles it as `error`, on the local manifest: no contributed page can
 *   arrive after that, so a route may fall back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { PAGES } from "../src/lib/pages";
import { mount, run, settle, unmountAll } from "./helpers/dom";

/** The one request the store makes, held open until the test answers or refuses it. */
const request = vi.hoisted(() => ({
  answer: null as ((value: unknown) => void) | null,
  refuse: null as ((reason: unknown) => void) | null,
}));

vi.mock("../src/api/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api/endpoints")>();
  return {
    ...actual,
    getContributions: () =>
      new Promise((resolve, reject) => {
        request.answer = resolve;
        request.refuse = reject;
      }),
  };
});

/** Only the signed-in user matters here: the store asks once, for that id. */
vi.mock("../src/state/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/state/auth")>();
  return {
    ...actual,
    useAuth: (): ReturnType<typeof actual.useAuth> =>
      ({ user: { userId: "tester" } }) as ReturnType<typeof actual.useAuth>,
  };
});

/** What the company-proposals plugin contributes: one `nav: "org"` page. */
const CONTRIBUTED = {
  key: "org-proposals",
  path: "proposals/:number?",
  nav: "org",
  released: true,
  renderer: { builtin: "OrgProposalsPage" },
};

/** The state the store hands a caller, as one line: status, all pages, the organization ones. */
async function probe(): Promise<() => string> {
  const { useOrgPagesState } = await import("../src/features/company/use-org-pages");
  function Probe() {
    const { pages, status } = useOrgPagesState();
    const orgPages = pages.filter((page) => page.nav === "org").length;
    return h("p", null, `${status} ${pages.length} ${orgPages}`);
  }
  await mount(h(Probe));
  await settle();
  return () => document.body.textContent ?? "";
}

const LOCAL = PAGES.length;

describe("the runtime page table's load state", () => {
  beforeEach(() => {
    // A fresh module: the store is module-level, and its one fetch is per signed-in user.
    vi.resetModules();
    request.answer = null;
    request.refuse = null;
  });

  afterEach(async () => {
    await unmountAll();
  });

  it("is loading until the contributions answer, then ready with them folded in", async () => {
    const shown = await probe();
    // The local manifest alone, and NOT settled: a page missing from it may still arrive.
    expect(shown()).toBe(`loading ${LOCAL} 0`);
    await run(() => request.answer!({ pages: [CONTRIBUTED] }));
    expect(shown()).toBe(`ready ${LOCAL + 1} 1`);
  });

  it("settles on the local manifest when the request fails, so a route may fall back", async () => {
    const shown = await probe();
    expect(shown()).toBe(`loading ${LOCAL} 0`);
    await run(() => request.refuse!(new Error("offline")));
    expect(shown()).toBe(`error ${LOCAL} 0`);
  });
});
