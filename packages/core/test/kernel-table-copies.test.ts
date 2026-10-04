/**
 * A plugin table's copy of a host interface (kernel/tables.ts checkTables): the plugin requires the
 * host's key and carries the signature it was built against under it, so the merged table wires
 * it to the host's provider by identity — and the full check still asks whether the host's entry
 * satisfies the copy.
 *
 * - A copy the host satisfies (the host offers more) verifies, and the runtime's identity check
 *   accepts the same tree.
 * - A copy asking for what the host no longer offers is the requiring module's `mismatch`.
 */
import { describe, expect, it } from "vitest";
import { checkExact, checkTables, describeProblem, mergeTables } from "../src/kernel/index.js";
import type { IfaceDecl, ManifestNode, ModuleTable } from "../src/kernel/index.js";

const sig = { params: [{ data: "string" }], returns: { data: "string" } } as const;
const Sessions: IfaceDecl = {
  name: "Sessions",
  methods: { statusOf: sig, titleOf: sig },
  slots: {},
};
const manifest = (name: string, more: object = {}) => ({
  name,
  requires: {},
  provides: {},
  contributes: {},
  children: [],
  ...more,
});
const host: ModuleTable = {
  ifaces: { "core#Sessions": Sessions, "core#Other": { name: "Other", methods: {}, slots: {} } },
  types: {},
  modules: {
    root: manifest("root", { children: ["core"] }),
    core: manifest("core", { provides: { sessions: "core#Sessions", other: "core#Other" } }),
  },
};
const plugin = (methods: Record<string, typeof sig>): ModuleTable => ({
  ifaces: { "core#Sessions": { name: "Sessions", methods, slots: {} } },
  types: {},
  modules: {
    probe: manifest("probe", { requires: { sessions: { iface: "core#Sessions", from: "core" } } }),
  },
});

describe("copied host interfaces", () => {
  it("verify when the host satisfies the copy, and wire by identity", () => {
    const extra = plugin({ statusOf: sig });
    expect(checkTables(host, [extra])).toEqual([]);
    const m = (name: string) => (host.modules[name] ?? extra.modules[name]) as never;
    const tree: ManifestNode = {
      manifest: m("root"),
      children: [
        { manifest: m("core"), children: [] },
        { manifest: m("probe"), children: [] },
      ],
    };
    expect(checkExact(tree, mergeTables(host, [extra])).problems).toEqual([]);
  });

  it("are the requiring module's mismatch when the host no longer offers what they need", () => {
    const problems = checkTables(host, [plugin({ statusOf: sig, archive: sig })]);
    expect(problems.map(describeProblem)).toEqual([
      expect.stringMatching(
        /^\/root\/probe: requires\.sessions from 'core': archive: the host's 'core#Sessions' no longer offers/,
      ),
    ]);
  });
});
