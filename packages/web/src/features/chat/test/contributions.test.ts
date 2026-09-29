/**
 * Session surfaces on the client: the label a "New chat" entry shows follows the interface
 * language. (The renderer names a surface may point at are the manifest's registry, pinned
 * in test/renderers.test.ts.)
 */
import { describe, expect, it } from "vitest";
import { surfaceLabel } from "../../../state/contributions";

const summary = {
  id: "x.surface",
  from: "X",
  kind: "x",
  label: "Claude Code",
  renderer: { builtin: "TerminalSurface" as const },
};

describe("surfaceLabel", () => {
  it("shows the Chinese label on a Chinese interface, falling back to the label", () => {
    expect(surfaceLabel(summary, "en")).toBe("Claude Code");
    expect(surfaceLabel(summary, "zh")).toBe("Claude Code");
    expect(surfaceLabel({ ...summary, labelZh: "代码助手" }, "zh")).toBe("代码助手");
    expect(surfaceLabel({ ...summary, labelZh: "代码助手" }, "en")).toBe("Claude Code");
  });
});
