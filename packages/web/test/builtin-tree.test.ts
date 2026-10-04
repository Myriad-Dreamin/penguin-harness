/**
 * The builtin module tree is verified when it is built, since the page boots it unchecked
 * (web-root.ts boots through the kernel's runtime entry).
 *
 * - The generated table passes the kernel's full check.
 * - The build step (scripts/verify-builtin-tree.mjs) passes on it and fails, naming the
 *   problems, on a deliberately broken copy: a requirement wired to a module that does not
 *   exist, and an interface the table does not carry.
 * - The build step also runs the page's boot check (`checkExact`): a requirement only a
 *   structural match meets passes the full check and still fails the build, as it would fail
 *   the boot.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkTables } from "@prismshadow/penguin-core/kernel";
import type { ModuleTable } from "@prismshadow/penguin-core/kernel";
import table from "../src/ifaces.json";

const script = join(dirname(fileURLToPath(import.meta.url)), "../scripts/verify-builtin-tree.mjs");
const host = table as unknown as ModuleTable;

type ManifestDoc = { name: string; children: string[]; provides?: Record<string, string> };

/** Runs the build step over `doc`, written to a temporary file. */
function runOn(doc: object): { status: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "builtin-tree-"));
  try {
    const path = join(dir, "ifaces.json");
    writeFileSync(path, JSON.stringify(doc));
    return runScript(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runScript(tablePath?: string): { status: number; output: string } {
  try {
    const out = execFileSync(process.execPath, [script, ...(tablePath ? [tablePath] : [])], {
      encoding: "utf8",
      stdio: "pipe",
    });
    return { status: 0, output: out };
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string };
    return { status: e.status, output: `${e.stdout}${e.stderr}` };
  }
}

describe("the builtin module tree", () => {
  it("passes the full check", () => {
    expect(checkTables(host)).toEqual([]);
  });

  it("passes the build step, which refuses a broken table", () => {
    expect(runScript().status).toBe(0);
    const root = Object.values(host.modules).find(
      (m) => (m as { name: string }).name === "WebRoot",
    ) as {
      children: string[];
    };
    const broken = {
      ...host,
      modules: {
        ...host.modules,
        WebRoot: { ...root, children: [...root.children, "BrokenModule"] },
        BrokenModule: {
          name: "BrokenModule",
          requires: {
            ghost: { iface: Object.keys(host.ifaces)[0], from: "NoSuchModule" },
            missing: { iface: "Nowhere#Nothing" },
          },
          provides: {},
          contributes: {},
          children: [],
        },
      },
    };
    const run = runOn(broken);
    expect(run.status).toBe(1);
    expect(run.output).toContain(
      "/WebRoot/BrokenModule: requires.ghost from 'NoSuchModule': no such module",
    );
    expect(run.output).toContain("'missing' names interface 'Nowhere#Nothing'");
  });

  it("refuses at build a requirement the page's boot check refuses: a structural match only", () => {
    const modules = host.modules as Record<string, ManifestDoc>;
    const root = modules.WebRoot!;
    // A module directly under the root provides this interface; a copy under another key
    // matches it structurally, never by identity.
    const [key, provider] = root.children
      .flatMap((c) => Object.values(modules[c]?.provides ?? {}).map((k) => [k, c] as const))
      .find(([k]) => k.endsWith("#Language"))!;
    expect(provider).toBeDefined();
    const copyKey = "@acme/probe#Language";
    const structural = {
      ...host,
      ifaces: { ...host.ifaces, [copyKey]: host.ifaces[key] },
      modules: {
        ...host.modules,
        WebRoot: { ...root, children: [...root.children, "StructuralProbe"] },
        StructuralProbe: {
          name: "StructuralProbe",
          requires: { language: { iface: copyKey } },
          provides: {},
          contributes: {},
          children: [],
        },
      },
    } as unknown as ModuleTable;
    expect(checkTables(structural)).toEqual([]);
    const run = runOn(structural);
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/StructuralProbe.*\(boot check\)/);
  });
});
