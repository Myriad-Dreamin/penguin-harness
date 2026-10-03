import { describe, expect, it } from "vitest";
import type { ProbeSites } from "@prismshadow/penguin-server/api";
import { githubAnchor, probeLink, probeSummary } from "../src/lib/perf/sites";

const table: ProbeSites = {
  repo: "https://github.com/Myriad-Dreamin/penguin-harness",
  commit: "0123456789abcdef",
  dirty: true,
  sites: {
    "web.boot": "packages/web/src/lib/perf/collector.ts:251",
    "trace.read": "packages/server/src/services/trace-service.ts:355",
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

  it("answers null for a name the table lacks, and for no table", () => {
    expect(probeLink("web.turn", table, "en")).toBeNull();
    expect(probeLink("web.boot", null, "en")).toBeNull();
  });

  it("spells anchors the way GitHub does", () => {
    expect(githubAnchor("http.request")).toBe("httprequest");
    expect(githubAnchor("sessions.list.sql")).toBe("sessionslistsql");
  });

  it("finds a summary in the asked language", () => {
    const summaries = { en: { "trace.read": "One file." }, zh: { "trace.read": "一个文件。" } };
    expect(probeSummary("trace.read", summaries, "zh")).toBe("一个文件。");
    expect(probeSummary("web.boot", summaries, "en")).toBeNull();
    expect(probeSummary("trace.read", null, "en")).toBeNull();
  });
});
