/**
 * Importing the kernel builds no arktype type: the web imports it on its boot path, where a
 * type built at module evaluation is paid on every page load whether it is used or not. The
 * manifest document's type is built on the first parse, and only once (an arktype parse is
 * filed in a registry that never shrinks).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

let built = 0;

vi.mock("arktype", async () => {
  const actual = await vi.importActual<typeof import("arktype")>("arktype");
  // Every property (`type.errors`, `type.raw`) reads through; only a call is counted.
  const counted = new Proxy(actual.type, {
    apply(target, self, args) {
      built += 1;
      return Reflect.apply(target as (...a: unknown[]) => unknown, self, args);
    },
  });
  return { ...actual, type: counted };
});

afterEach(() => {
  vi.resetModules();
  built = 0;
});

describe("the kernel's arktype types", () => {
  it("are not built by importing the kernel", async () => {
    await import("../src/kernel/index.js");
    expect(built).toBe(0);
  });

  it("are built on the first manifest parse, and once", async () => {
    const { parseManifest } = await import("../src/kernel/index.js");
    expect(parseManifest({ name: "a" }).children).toEqual([]);
    const afterFirst = built;
    expect(afterFirst).toBeGreaterThan(0);
    parseManifest({ name: "b", children: ["a"] });
    expect(built).toBe(afterFirst);
    expect(() => parseManifest({ name: "" }, "here")).toThrow(/^here: /);
  });
});
