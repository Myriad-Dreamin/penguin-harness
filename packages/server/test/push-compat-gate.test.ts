/**
 * The static compatibility gate deploy.mjs runs before a push (scripts/check-push-compat.mjs).
 *
 * The gate reads four declarations out of two trees — the one being pushed and the target's
 * serving tree — and compares them. Every check here is on the pure functions over fixture
 * trees: what each extractor reads (including the constants the declarations name through
 * their import chains), every direction of every comparison, how a target's serving tree is
 * identified out of its version report, and what a failed push's receipt says the receiver
 * did. The wiring — deploy.mjs printing the verdicts and refusing — is the script's own;
 * what it calls is what these tests pin.
 */
import { describe, expect, it } from "vitest";
import {
  checkPushCompat,
  compareFaces,
  extractDeclaredResources,
  extractHmrInterfaces,
  extractMigrationsLedger,
  extractPlatformApiMembers,
  recoveredFromRefusal,
  targetTreeCommit,
} from "../../../scripts/check-push-compat.mjs";
import type { TreeFaces, TreeReader } from "../../../scripts/check-push-compat.mjs";

/** A tree small enough to read at a glance, with every shape the extractors must follow. */
const FIXTURES: Record<string, string> = {
  "packages/server/src/hmr/capabilities.ts": `
const PENGUIN_FAMILY = "penguin";
// A comment inside the declaration, where a naive scan would trip.
export const HMR_INTERFACES: HmrInterfaces = {
  family: PENGUIN_FAMILY,
  config: [
    "root",
    "port",
  ],
  proxy: [],
  hmr: ["resources", "ensure"],
};
`,
  "packages/server/src/hmr/platform.ts": `
import { PENGUIN_FAMILY } from "./capabilities.js";
import { SESSION_GROUP } from "../machines/transport/index.js";
import type { HeldSession } from "../machines/transport/index.js";

export interface PlatformApi extends Park {
  /** A doc comment with a { link } and braces {} where a naive scan would trip. */
  info(): Json;
  log(line: string): void;
  http(request: Request): Promise<Response | null>;
  business(): ModuleTree | null;
}

export const DECLARED_RESOURCES: ParkedInterfaces = {
  family: PENGUIN_FAMILY,
  // A comment inside the declaration, again.
  terminal: ["id", "kill"],
  [SESSION_GROUP]: ["hold", "close"],
};
`,
  "packages/server/src/machines/transport/index.ts": `
export {
  SESSION_GROUP,
} from "./ssh-session.js";
export type { HeldSession } from "./ssh-session.js";
`,
  "packages/server/src/machines/transport/ssh-session.ts": `
export const SESSION_GROUP = "machineSession.v2";
`,
  "packages/server/src/db/migrations/index.ts": `
import type { Migration } from "./migration.js";
import { stepOne } from "./steps/2026-01-01-step-one.js";
import { stepTwo } from "./steps/2026-02-02-step-two.js";

export const MIGRATIONS: readonly Migration[] = [stepOne, stepTwo];

export function migrate(db: DatabaseSync): MigrateResult {
  return runner.migrate(db, MIGRATIONS);
}
`,
  "packages/server/src/db/migrations/steps/2026-01-01-step-one.ts": `
export const stepOne: Migration = {
  name: "2026-01-01-step-one",
  swapSafe: true,
  up(db) {},
  down: null,
};
`,
  "packages/server/src/db/migrations/steps/2026-02-02-step-two.ts": `
export const stepTwo: Migration = {
  name: "2026-02-02-step-two",
  // A contract migration: narrowing work, applied by the runtime's own open only.
  swapSafe: false,
  up(db) {},
  down: null,
};
`,
};

const fixtureReader: TreeReader = (rel) => FIXTURES[rel] ?? null;

/** Two trees with identical faces, overriden per comparison. */
const faces = (overrides: Partial<TreeFaces> = {}): TreeFaces => ({
  interfaces: {
    family: "penguin",
    need: { config: ["root", "port"], proxy: [], hmr: ["resources"] },
  },
  platform: { heritage: "Park", members: ["info", "log", "http", "business"] },
  ledger: [
    { name: "2026-01-01-step-one", swapSafe: true },
    { name: "2026-02-02-step-two", swapSafe: false },
  ],
  resources: {
    family: "penguin",
    groups: { terminal: ["id", "kill"], "machineSession.v2": ["hold", "close"] },
  },
  ...overrides,
});

describe("the static push compatibility gate", () => {
  it("reads the runtime interface needs, resolving the family constant in-file", () => {
    const capabilities = FIXTURES["packages/server/src/hmr/capabilities.ts"]!;
    expect(extractHmrInterfaces(capabilities)).toEqual({
      family: "penguin",
      need: { config: ["root", "port"], proxy: [], hmr: ["resources", "ensure"] },
    });
  });

  it("reads nothing out of a declaration that is not there", () => {
    expect(extractHmrInterfaces("export const OTHER = 1;")).toBeNull();
    expect(extractHmrInterfaces(null)).toBeNull();
  });

  it("reads the platform member face above the heritage clause, comments and all", () => {
    const platform = FIXTURES["packages/server/src/hmr/platform.ts"]!;
    expect(extractPlatformApiMembers(platform)).toEqual({
      heritage: "Park",
      members: ["info", "log", "http", "business"],
    });
  });

  it("reads the named migration ledger in order, each entry's swap safety from its step", () => {
    expect(extractMigrationsLedger(fixtureReader)).toEqual([
      { name: "2026-01-01-step-one", swapSafe: true },
      { name: "2026-02-02-step-two", swapSafe: false },
    ]);
  });

  it("fails on a ledger whose steps cannot be followed", () => {
    expect(
      extractMigrationsLedger((rel) => (rel.endsWith("index.ts") ? (FIXTURES[rel] ?? null) : null)),
    ).toBeNull();
    const torn = { ...FIXTURES };
    torn["packages/server/src/db/migrations/steps/2026-01-01-step-one.ts"] =
      "export const stepOne: Migration = { up(db) {}, down: null };";
    expect(extractMigrationsLedger((rel) => torn[rel] ?? null)).toBeNull();
  });

  it("reads the declared resource groups, resolving the computed group name through its imports", () => {
    expect(extractDeclaredResources(fixtureReader)).toEqual({
      family: "penguin",
      groups: { terminal: ["id", "kill"], "machineSession.v2": ["hold", "close"] },
    });
  });

  it("compares nothing when the two trees declare the same faces", () => {
    const { violations, doomed } = compareFaces(faces(), faces());
    expect(violations).toEqual([]);
    expect(doomed).toEqual([]);
  });

  it("wants the push's runtime needs inside the serving tree's", () => {
    const wider = faces({
      interfaces: {
        family: "penguin",
        need: { config: ["root", "port", "seedAdminPassword"], proxy: [], hmr: ["resources"] },
      },
    });
    const { violations } = compareFaces(wider, faces());
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("'seedAdminPassword'");
  });

  it("refuses a capability the serving tree never declared", () => {
    const { violations } = compareFaces(
      faces({
        interfaces: { family: "penguin", need: { desktop: ["onShutdownRequest"] } },
      }),
      faces(),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("the serving tree never did");
  });

  it("wants the push's member face to cover the serving tree's", () => {
    const { violations } = compareFaces(
      faces({ platform: { heritage: "Park", members: ["info", "log", "http"] } }),
      faces(),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("'business'");
    expect(violations[0]).toContain("drops it");
  });

  it("refuses a changed platform interface base", () => {
    const { violations } = compareFaces(
      faces({ platform: { heritage: "Park, Other", members: ["info"] } }),
      faces(),
    );
    expect(violations.some((v) => v.includes("platform interface base"))).toBe(true);
  });

  it("wants the serving ledger to be a prefix of the push's", () => {
    const dropped = compareFaces(
      faces({ ledger: [{ name: "2026-01-01-step-one", swapSafe: true }] }),
      faces(),
    );
    expect(dropped.violations).toHaveLength(1);
    expect(dropped.violations[0]).toContain("'2026-02-02-step-two'");
    expect(dropped.violations[0]).toContain("the push's does not");

    const moved = compareFaces(
      faces({
        ledger: [
          { name: "2026-02-02-step-two", swapSafe: false },
          { name: "2026-01-01-step-one", swapSafe: true },
        ],
      }),
      faces(),
    );
    expect(moved.violations).toHaveLength(1);
    expect(moved.violations[0]).toContain("append-only");
  });

  it("refuses a migration that flips its swap safety", () => {
    const { violations } = compareFaces(
      faces({
        ledger: [
          { name: "2026-01-01-step-one", swapSafe: false },
          { name: "2026-02-02-step-two", swapSafe: false },
        ],
      }),
      faces(),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("flips its swap safety");
  });

  it("passes a ledger the push only appends to", () => {
    const { violations } = compareFaces(
      faces({
        ledger: [
          { name: "2026-01-01-step-one", swapSafe: true },
          { name: "2026-02-02-step-two", swapSafe: false },
          { name: "2026-03-03-step-three", swapSafe: true },
        ],
      }),
      faces(),
    );
    expect(violations).toEqual([]);
  });

  it("reports a renamed resource group as doomed, not as a violation", () => {
    const { violations, doomed } = compareFaces(
      faces({
        resources: {
          family: "penguin",
          groups: { terminal: ["id", "kill"], "machineSession.v3": ["hold", "close"] },
        },
      }),
      faces(),
    );
    expect(violations).toEqual([]);
    expect(doomed).toHaveLength(1);
    expect(doomed[0]).toContain("'machineSession.v2'");
    expect(doomed[0]).toContain("disposed");
  });

  it("reports a group whose members the push reaches beyond", () => {
    const { violations, doomed } = compareFaces(
      faces({
        resources: {
          family: "penguin",
          groups: { terminal: ["id", "kill", "resize"], "machineSession.v2": ["hold", "close"] },
        },
      }),
      faces(),
    );
    expect(violations).toEqual([]);
    expect(doomed).toHaveLength(1);
    expect(doomed[0]).toContain("'terminal'");
    expect(doomed[0]).toContain("'resize'");
  });

  it("dooms every group when the resource family differs", () => {
    const { doomed } = compareFaces(
      faces({ resources: { family: "other", groups: { terminal: ["id"] } } }),
      faces(),
    );
    expect(doomed.map((d) => d.split(":")[0])).toEqual(["'terminal'", "'machineSession.v2'"]);
  });

  it("identifies the serving tree by the pushed platform's provenance, then the packaged build's", () => {
    expect(targetTreeCommit({ harness: { source: { revision: "v1.2.3-45-g0249d7a5b" } } })).toEqual(
      {
        sha: "0249d7a5b",
        why: "",
      },
    );
    expect(
      targetTreeCommit({ harness: { source: { revision: "v1.2.3-45-g0249d7a5b-dirty" } } }).sha,
    ).toBeNull();
    expect(targetTreeCommit({ harness: { source: { revision: "v1.2.3" } } }).sha).toBeNull();
    expect(targetTreeCommit({ harness: { bundles: {} } }).sha).toBeNull();
    const commit = "8aa761232bf6a0463c9131cc3cc93038927099ed";
    expect(targetTreeCommit({ harness: null, commit, dirty: false })).toEqual({
      sha: commit,
      why: "",
    });
    expect(targetTreeCommit({ harness: null, commit, dirty: true }).sha).toBeNull();
    expect(targetTreeCommit(null).sha).toBeNull();
  });

  it("reads the recovery verdict out of a failed push's receipt", () => {
    const body = JSON.stringify({
      error: {
        code: "bad_request",
        message: "the pushed platform failed to boot",
        recovered: true,
      },
    });
    expect(recoveredFromRefusal(body)).toBe(true);
    expect(recoveredFromRefusal(body.replace("true", "false"))).toBe(false);
    expect(recoveredFromRefusal('{"error":{"code":"bad_request","message":"x"}}')).toBeNull();
    expect(recoveredFromRefusal("not json")).toBeNull();
  });

  it("is clean over two identical fixture trees", () => {
    const result = checkPushCompat({ readPush: fixtureReader, readTarget: fixtureReader });
    expect(result.ran).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.doomed).toEqual([]);
  });

  it("fails the gate when a tree cannot be read, instead of passing silently", () => {
    const result = checkPushCompat({ readPush: fixtureReader, readTarget: () => null });
    expect(result.ran).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain("the serving tree: cannot read");
  });
});
