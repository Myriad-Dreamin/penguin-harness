/**
 * The `pages` slot as the shell's table (shell/page-table.ts pageTableOf).
 *
 * - The app's own pages, which state their placement, come by `order`; the pages that state none
 *   (a plugin module's) follow them in slot order — package by package, as the tree lists them —
 *   offered and open to every role, so a plugin's child row sits after the app's own children.
 * - A page bound as a loader is deferred: the table holds a preloadable component, which is what
 *   the nav's hover prefetch calls (shell/sidebar/router-link.tsx).
 * - A plugin page that states its placement is refused before the boot (plugins/page-claims.ts).
 */
import type { Contributed } from "@prismshadow/penguin-core/kernel";
import { describe, expect, it } from "vitest";
import { pageTableOf } from "../src/shell/page-table";
import { pageClaimOf } from "../src/plugins/page-claims";

const Blank = () => null;

const page = (id: string, data: Record<string, unknown>, code: unknown = Blank): Contributed =>
  ({
    id,
    from: "M",
    data: { key: id, path: `/${id}`, frame: "shell", nav: "main", ...data },
    code,
  }) as unknown as Contributed;

describe("the page table", () => {
  const table = pageTableOf([
    page("bench", { admin: false, released: true, order: 70 }),
    page("hello", { parent: "bench" }),
    page("agents", { admin: false, released: true, order: 10 }),
    page("bench-child", { admin: true, released: false, order: 71, parent: "bench" }),
    page("second", {}),
  ]);

  it("orders the app's own pages, then places the rest after them in slot order", () => {
    expect(table.map((p) => [p.key, p.order])).toEqual([
      ["agents", 10],
      ["bench", 70],
      ["bench-child", 71],
      ["hello", 72],
      ["second", 73],
    ]);
  });

  it("keeps what the app's own pages state, and offers the placed ones to every role", () => {
    expect(table.find((p) => p.key === "bench-child")).toMatchObject({
      admin: true,
      released: false,
    });
    for (const key of ["hello", "second"]) {
      expect(table.find((p) => p.key === key)).toMatchObject({ admin: false, released: true });
    }
  });

  it("defers a page bound as a loader, so a hover can preload its code", async () => {
    let calls = 0;
    const [lazy] = pageTableOf([
      page(
        "lazy",
        {},
        {
          load: () => {
            calls += 1;
            return Promise.resolve(Blank);
          },
        },
      ),
    ]);
    const preload = (lazy!.Component as unknown as { preload(): Promise<unknown> }).preload;
    expect(typeof preload).toBe("function");
    expect(calls).toBe(0);
    expect(await preload()).toBe(Blank);
    expect(calls).toBe(1);
  });
});

describe("a plugin page's claims", () => {
  const manifest = (entry: Record<string, unknown>) => ({
    name: "P",
    contributes: { "ShellModule.pages": [{ id: "p.page", key: "p", ...entry }] },
  });

  it("takes a page that states none of the app's decisions", () => {
    expect(pageClaimOf([manifest({ parent: "x", nav: "main" })])).toBeNull();
    expect(pageClaimOf([{ name: "Q", contributes: {} }])).toBeNull();
  });

  it("refuses one that states its order, its admin gate or its release, naming them", () => {
    expect(pageClaimOf([manifest({ released: true })])).toMatch(
      /module 'P': page 'p\.page' states 'released'/,
    );
    expect(pageClaimOf([manifest({ order: 1, admin: false })])).toMatch(/'admin', 'order'/);
  });
});
