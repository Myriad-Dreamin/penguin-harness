/**
 * The skills module's copy (strings.ts). That the app dictionaries mount these fragments is
 * checked on the app side (test/module-boundaries.test.ts).
 */
import { describe, expect, it } from "vitest";
import { skillsEn, skillsZh } from "../strings";
import { fragmentShape } from "../../../../test/fragment-shape";

describe("skills strings", () => {
  it("zh and en have the same keys at every depth and the same function arity", () => {
    expect(fragmentShape(skillsEn)).toEqual(fragmentShape(skillsZh));
  });
});
