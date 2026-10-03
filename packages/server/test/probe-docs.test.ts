/**
 * The probe reference (src/telemetry/probes.<lang>.md): the performance panel links each probe's
 * name to its section and shows the section's summary behind a "?". Both languages must cover
 * exactly the probes the code records, with site lines that match the code — `pnpm
 * gen:probe-docs` rewrites them when a probe moves.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { probeSummaries, renderProbeDocs } from "../../../scripts/gen-probe-docs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("probe reference", () => {
  it("covers every probe in both languages, with site lines that match the code", () => {
    for (const [rel, content] of Object.entries(renderProbeDocs())) {
      expect(fs.readFileSync(path.join(ROOT, rel), "utf8"), `${rel}: run pnpm gen:probe-docs`).toBe(
        content,
      );
    }
  });

  it("gives every probe a one-sentence summary in each language", () => {
    const { en, zh } = probeSummaries();
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const lang of [en, zh]) {
      for (const [name, summary] of Object.entries(lang)) {
        expect(summary, name).not.toBe("");
        expect(summary, name).not.toContain("<!--");
      }
    }
  });
});
