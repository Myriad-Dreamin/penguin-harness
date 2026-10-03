import { describe, expect, it } from "vitest";
import type { ProbeSites } from "@prismshadow/penguin-server/api";
import { githubAnchor, probeEntry, probeLink, probeSummary } from "../src/lib/perf/sites";

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

describe("probe descriptions", () => {
  it("links a probe to its section of the reference in the asked language, at the table's commit", () => {
    expect(probeLink("web.boot", table, "zh")).toEqual({
      href: "https://github.com/Myriad-Dreamin/penguin-harness/blob/0123456789abcdef/packages/server/src/telemetry/probes.zh.md#webboot",
      site: "packages/web/src/lib/perf/collector.ts:251",
      dirty: true,
    });
  });

  it("prefers an exact name over its family, and falls back to prefix.*", () => {
    expect(probeEntry("turn.run", table.sites)).toBe("turn.run");
    expect(probeEntry("turn.wait", table.sites)).toBe("turn.*");
    expect(probeLink("turn.wait", table, "en")?.href).toMatch(/probes\.en\.md#turn$/);
  });

  it("answers null for a name the table lacks, and for no table", () => {
    expect(probeLink("web.turn", table, "en")).toBeNull();
    expect(probeLink("web.boot", null, "en")).toBeNull();
  });

  it("spells anchors the way GitHub does", () => {
    expect(githubAnchor("http.request")).toBe("httprequest");
    expect(githubAnchor("turn.*")).toBe("turn");
    expect(githubAnchor("sessions.list.sql")).toBe("sessionslistsql");
  });

  it("finds a summary in the asked language, by family when needed", () => {
    const summaries = { en: { "turn.*": "One segment." }, zh: { "turn.*": "某一段。" } };
    expect(probeSummary("turn.tail", summaries, "zh")).toBe("某一段。");
    expect(probeSummary("web.boot", summaries, "en")).toBeNull();
    expect(probeSummary("turn.tail", null, "en")).toBeNull();
  });
});
