/**
 * When the Sandbox card offers to install a backend (lib/sandbox-backend-prompt.ts).
 *
 * - Given a machine that reports no backend for its OS and names defaults, every default is
 *   offered together; given one with a backend installed, no default, or no report, nothing is.
 *   An older server naming its one default as a bare string has that package offered.
 * - Given "Don't ask again" ticked for a machine, that machine is not asked again in this
 *   browser, and every other machine still is.
 * - Given storage that throws or holds garbage, the prompt is offered (never silently
 *   dismissed) and nothing throws.
 * - Given an install request that throws, the run stops there, reports it and resolves, so the
 *   prompt closes and the card is read again with what did install.
 */
import { describe, expect, it } from "vitest";
import {
  BACKEND_PROMPT_DISMISSED_KEY,
  backendPromptDismissed,
  backendToOffer,
  dismissBackendPrompt,
  installInOrder,
} from "../src/lib/sandbox-backend-prompt";
import type { PromptStorage } from "../src/lib/sandbox-backend-prompt";

function memoryStorage(): PromptStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

const LINUX = ["@penguinharness/sandbox-bwrap", "@penguinharness/sandbox-dsh"];
const MISSING = { backend: { installed: false, recommended: LINUX } };

describe("the default-backend prompt", () => {
  it("offers the OS's default only when no backend for the OS is installed", () => {
    const storage = memoryStorage();
    expect(backendToOffer(MISSING, "m1", storage)).toEqual(LINUX);
    expect(
      backendToOffer({ backend: { installed: true, recommended: LINUX } }, "m1", storage),
    ).toBeNull();
    expect(backendToOffer({ backend: { installed: false } }, "m1", storage)).toBeNull();
    expect(
      backendToOffer({ backend: { installed: false, recommended: [] } }, "m1", storage),
    ).toBeNull();
    expect(backendToOffer({}, "m1", storage)).toBeNull();
  });

  it("offers the one package an older server reports as a bare string, not its characters", () => {
    const old = { backend: { installed: false, recommended: "@penguinharness/sandbox-bwrap" } };
    expect(backendToOffer(old as never, "m1", memoryStorage())).toEqual([
      "@penguinharness/sandbox-bwrap",
    ]);
  });

  it("remembers don't-ask-again per machine, in this browser's storage only", () => {
    const storage = memoryStorage();
    dismissBackendPrompt("m1", storage);
    dismissBackendPrompt("m1", storage);
    expect(backendPromptDismissed("m1", storage)).toBe(true);
    expect(backendToOffer(MISSING, "m1", storage)).toBeNull();
    expect(backendToOffer(MISSING, "m2", storage)).toEqual(LINUX);
    expect(JSON.parse(storage.data.get(BACKEND_PROMPT_DISMISSED_KEY)!)).toEqual(["m1"]);
  });

  it("asks again when storage is unavailable, throws or holds garbage", () => {
    const throwing: PromptStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => dismissBackendPrompt("m1", throwing)).not.toThrow();
    expect(backendToOffer(MISSING, "m1", throwing)).toEqual(LINUX);
    expect(backendToOffer(MISSING, "m1", null)).toEqual(LINUX);
    const garbage = memoryStorage();
    garbage.setItem(BACKEND_PROMPT_DISMISSED_KEY, "{not json");
    expect(backendPromptDismissed("m1", garbage)).toBe(false);
    dismissBackendPrompt("m1", garbage);
    expect(backendPromptDismissed("m1", garbage)).toBe(true);
  });
});

describe("installing the offered backends", () => {
  it("reports each, and stops at a request that throws without rejecting", async () => {
    const events: string[] = [];
    const tried: string[] = [];
    await expect(
      installInOrder(
        ["a", "b", "c", "d"],
        async (pkg) => {
          tried.push(pkg);
          if (pkg === "b") return "load failed";
          if (pkg === "c") throw new Error("network down");
          return undefined;
        },
        {
          installed: (pkg) => events.push(`ok ${pkg}`),
          failed: (pkg, error) => events.push(`failed ${pkg}: ${error}`),
          threw: (e) => events.push(`threw ${(e as Error).message}`),
        },
      ),
    ).resolves.toBeUndefined();
    expect(events).toEqual(["ok a", "failed b: load failed", "threw network down"]);
    expect(tried).toEqual(["a", "b", "c"]);
  });
});
