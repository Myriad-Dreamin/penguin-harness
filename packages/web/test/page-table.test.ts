/**
 * The `pages` slot as the shell's table (shell/page-table.ts pageTableOf): the pages that state an
 * `order` come by it; the rest (a plugin module's) follow in slot order, placed after them —
 * under a parent, after the app's own children — offered and open to every role unless they say
 * otherwise.
 */
import type { Contributed } from "@prismshadow/penguin-core/kernel";
import { describe, expect, it } from "vitest";
import { pageTableOf } from "../src/shell/page-table";

const page = (id: string, data: Record<string, unknown>): Contributed =>
  ({
    id,
    from: "M",
    data: { key: id, path: `/${id}`, frame: "shell", nav: "main", ...data },
    code: () => null,
  }) as unknown as Contributed;

describe("the page table", () => {
  const table = pageTableOf([
    page("bench", { admin: false, released: true, order: 70 }),
    page("hello", { parent: "bench" }),
    page("agents", { admin: false, released: true, order: 10 }),
    page("bench-child", { admin: true, released: false, order: 71, parent: "bench" }),
    page("second", {}),
  ]);

  it("orders the pages that state a place, then places the rest after them in slot order", () => {
    expect(table.map((p) => [p.key, p.order])).toEqual([
      ["agents", 10],
      ["bench", 70],
      ["bench-child", 71],
      ["hello", 72],
      ["second", 73],
    ]);
  });

  it("keeps a stated admin gate and release, and defaults to offered and open", () => {
    expect(table.find((p) => p.key === "bench-child")).toMatchObject({
      admin: true,
      released: false,
    });
    for (const key of ["hello", "second"]) {
      expect(table.find((p) => p.key === key)).toMatchObject({ admin: false, released: true });
    }
  });
});
