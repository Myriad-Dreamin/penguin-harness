import { describe, expect, it } from "vitest";
import type { ProbeSites } from "@prismshadow/penguin-server/api";
import { probeLink } from "../src/lib/perf/sites";

const table: ProbeSites = {
  repo: "https://github.com/Myriad-Dreamin/penguin-harness",
  commit: "0123456789abcdef",
  dirty: true,
  sites: {
    "web.boot": "packages/web/src/lib/perf/collector.ts:251",
    "turn.*": "packages/server/src/telemetry/turn.ts:102",
    "turn.run": "packages/server/src/telemetry/turn.ts:95",
  },
};

describe("probeLink", () => {
  it("builds a permalink at the table's commit, carrying its site and dirty flag", () => {
    expect(probeLink("web.boot", table)).toEqual({
      href: "https://github.com/Myriad-Dreamin/penguin-harness/blob/0123456789abcdef/packages/web/src/lib/perf/collector.ts#L251",
      site: "packages/web/src/lib/perf/collector.ts:251",
      dirty: true,
    });
  });

  it("prefers an exact name over its family, and falls back to prefix.*", () => {
    expect(probeLink("turn.run", table)?.site).toBe("packages/server/src/telemetry/turn.ts:95");
    expect(probeLink("turn.wait", table)?.site).toBe("packages/server/src/telemetry/turn.ts:102");
  });

  it("answers null for a name the table lacks, and for no table", () => {
    expect(probeLink("web.turn", table)).toBeNull();
    expect(probeLink("web.boot", null)).toBeNull();
  });
});
