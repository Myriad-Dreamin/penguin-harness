/**
 * The page's boot never loads arktype: bootWeb() boots the real builtin tree through the
 * kernel's runtime entry, and arktype — which registers itself as `globalThis.$ark` the moment
 * it is evaluated — is still absent afterwards. Loading the full kernel (what plugin
 * verification does, lazily) is the control: it does put arktype there.
 */
import { describe, expect, it } from "vitest";
import { bootWeb } from "../src/web-root";

describe("bootWeb", () => {
  it("boots the builtin tree without evaluating arktype", async () => {
    expect("$ark" in globalThis).toBe(false);
    expect(typeof (await bootWeb())).toBe("function");
    expect("$ark" in globalThis).toBe(false);
    await import("@prismshadow/penguin-core/kernel");
    expect("$ark" in globalThis).toBe(true);
  });
});
