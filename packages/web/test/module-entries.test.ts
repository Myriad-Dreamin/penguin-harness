/**
 * Every Web module's entry evaluates on its own, first, in a fresh module graph. Routing every
 * outside import through an entry turns file-level import chains into module-level cycles
 * (chat ↔ company, dock ↔ terminal); a cycle only bites when a file uses an imported binding
 * while the graph is still evaluating — a top-level table naming another module's component —
 * and which file that is depends on which entry is loaded first. Loading each entry first is
 * that check, for every order a page can start from.
 */
import { describe, expect, it, vi } from "vitest";
import { WEB_MODULES } from "./web-modules";

/** A fresh graph is most of the app, transformed cold when this file runs alone. */
const COLD_GRAPH_MS = 60_000;

describe("web module entries", () => {
  for (const m of WEB_MODULES) {
    it(
      `the ${m.name} entry evaluates first, in a fresh graph`,
      { timeout: COLD_GRAPH_MS },
      async () => {
        vi.resetModules();
        await expect(import(`../src/features/${m.name}/index.ts`)).resolves.toBeDefined();
      },
    );
  }

  it("the router evaluates in a fresh graph", { timeout: COLD_GRAPH_MS }, async () => {
    vi.resetModules();
    await expect(import("../src/router")).resolves.toBeDefined();
  });
});
