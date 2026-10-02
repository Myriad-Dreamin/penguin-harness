/**
 * Resizing a PagedDialog by its borders (src/components/overlays/paged-dialog: dialog-size.ts,
 * use-dialog-resize.ts, dialog-resize-handles.tsx): the size is held between a minimum and the
 * viewport, a border moves the centred dialog symmetrically, the remembered size survives a
 * storage that refuses, and a narrow screen gets no handles at all.
 */
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DIALOG_MIN_SIZE,
  browserSizeStorage,
  clampDialogSize,
  maxDialogSize,
  readDialogSize,
  resizeFromEdge,
  stepFromKey,
  writeDialogSize,
} from "../src/components/overlays/paged-dialog/dialog-size";
import type { SizeStorage } from "../src/components/overlays/paged-dialog/dialog-size";
import { PagedDialog } from "../src/components/overlays/paged-dialog/paged-dialog";
import { renderStatic } from "../src/testing";
import { stubDialogGlobals } from "./helpers/dialog-env";

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  createPortal: (node: ReactNode) => node,
}));
stubDialogGlobals();

const KEY = "penguin.test.dialogSize";

function memoryStorage(initial: Record<string, string> = {}): SizeStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const throwingStorage: SizeStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("clampDialogSize", () => {
  const viewport = { width: 1280, height: 800 };

  it("keeps a size that fits", () => {
    expect(clampDialogSize({ width: 900, height: 600 }, viewport)).toEqual({
      width: 900,
      height: 600,
    });
  });

  it("raises a size below the minimum to it", () => {
    expect(clampDialogSize({ width: 100, height: 50 }, viewport)).toEqual(DIALOG_MIN_SIZE);
  });

  it("never exceeds the viewport less the overlay's padding on each side", () => {
    expect(maxDialogSize(viewport)).toEqual({ width: 1248, height: 768 });
    expect(clampDialogSize({ width: 5000, height: 5000 }, viewport)).toEqual({
      width: 1248,
      height: 768,
    });
    // The padding is the live root size: 18px at the default text-size tier.
    expect(clampDialogSize({ width: 5000, height: 5000 }, viewport, { margin: 18 })).toEqual({
      width: 1244,
      height: 764,
    });
  });

  it("lets the viewport win over the minimum in a window smaller than both", () => {
    expect(clampDialogSize({ width: 700, height: 500 }, { width: 660, height: 400 })).toEqual({
      width: 628,
      height: 368,
    });
  });

  it("rounds to whole px", () => {
    expect(clampDialogSize({ width: 700.6, height: 500.2 }, viewport)).toEqual({
      width: 701,
      height: 500,
    });
  });
});

describe("resizeFromEdge", () => {
  const start = { width: 800, height: 600 };

  it("moves the centred dialog's opposite border too, so the size changes by twice the drag", () => {
    expect(resizeFromEdge("right", start, 10, 99)).toEqual({ width: 820, height: 600 });
    expect(resizeFromEdge("left", start, -10, 99)).toEqual({ width: 820, height: 600 });
    expect(resizeFromEdge("bottom", start, 99, 15)).toEqual({ width: 800, height: 630 });
    expect(resizeFromEdge("corner", start, 10, -15)).toEqual({ width: 820, height: 570 });
  });

  it("steps a border the way the arrow points", () => {
    expect(stepFromKey("right", "ArrowRight", 16)).toEqual({ dx: 16, dy: 0 });
    expect(stepFromKey("left", "ArrowLeft", 16)).toEqual({ dx: -16, dy: 0 });
    expect(stepFromKey("bottom", "ArrowUp", 16)).toEqual({ dx: 0, dy: -16 });
    expect(stepFromKey("bottom", "ArrowLeft")).toBeNull();
    expect(stepFromKey("right", "Enter")).toBeNull();
    // The left border's ← widens the dialog, as the right border's → does.
    const left = stepFromKey("left", "ArrowLeft")!;
    expect(resizeFromEdge("left", start, left.dx, left.dy).width).toBeGreaterThan(start.width);
  });
});

describe("remembered size", () => {
  it("round-trips through storage as whole px", () => {
    const storage = memoryStorage();
    writeDialogSize(storage, KEY, { width: 900.4, height: 650.6 });
    expect(storage.data.get(KEY)).toBe('{"width":900,"height":651}');
    expect(readDialogSize(storage, KEY)).toEqual({ width: 900, height: 651 });
  });

  it("reads nothing from an empty, malformed or nonsensical value", () => {
    expect(readDialogSize(memoryStorage(), KEY)).toBeNull();
    for (const raw of ["{", "null", "42", '{"width":900}', '{"width":-1,"height":600}', '{"width":"900","height":600}']) {
      expect(readDialogSize(memoryStorage({ [KEY]: raw }), KEY)).toBeNull();
    }
  });

  it("survives a storage that throws, and a missing one", () => {
    expect(readDialogSize(throwingStorage, KEY)).toBeNull();
    expect(() => writeDialogSize(throwingStorage, KEY, { width: 900, height: 600 })).not.toThrow();
    expect(readDialogSize(null, KEY)).toBeNull();
    expect(() => writeDialogSize(null, KEY, { width: 900, height: 600 })).not.toThrow();
  });

  it("finds no browser storage where the accessor itself throws", () => {
    vi.stubGlobal(
      "window",
      Object.defineProperty({}, "localStorage", {
        get: () => {
          throw new Error("SecurityError");
        },
      }),
    );
    expect(browserSizeStorage()).toBeNull();
  });
});

describe("PagedDialog resizable", () => {
  /** A browser window of the given width whose localStorage holds `stored` under KEY. */
  function stubWindow(width: number, stored?: string | (() => never)) {
    const storage: SizeStorage =
      typeof stored === "function"
        ? throwingStorage
        : memoryStorage(stored === undefined ? {} : { [KEY]: stored });
    vi.stubGlobal("window", {
      innerWidth: width,
      innerHeight: 800,
      localStorage: storage,
      matchMedia: (query: string) => ({ matches: query === "(min-width: 40rem)" && width >= 640 }),
    });
  }

  afterEach(() => {
    vi.stubGlobal("window", undefined);
  });

  const dialog = (resizable: boolean) =>
    renderStatic(
      createElement(PagedDialog<"general">, {
        open: true,
        onClose: () => {},
        title: "Settings",
        groups: [{ key: "app", items: [{ key: "general", label: "General" }] }],
        active: "general",
        onSelect: () => {},
        children: "Pane",
        ...(resizable ? { resizable: { storageKey: KEY } } : {}),
      }),
    );

  it("draws focusable width and height separators and pointer-only left and corner handles on a wide screen", () => {
    stubWindow(1280);
    const html = dialog(true);
    expect([...html.matchAll(/role="separator"/g)]).toHaveLength(2);
    expect(html).toMatch(/role="separator" aria-orientation="vertical" aria-label="Resize width"[^>]*tabindex="0"/);
    expect(html).toMatch(/role="separator" aria-orientation="horizontal" aria-label="Resize height"[^>]*tabindex="0"/);
    expect(html).toContain('aria-valuemin="600"');
    expect(html).toContain('data-edge="left"');
    expect(html).toContain('data-edge="corner"');
    expect(html).toContain("cursor-nwse-resize");
    // No size chosen: the stylesheet default applies, no inline dimensions.
    expect(html).not.toContain('style="');
  });

  it("applies the remembered size, held to the viewport", () => {
    stubWindow(1280, '{"width":5000,"height":300}');
    expect(dialog(true)).toContain('style="width:1248px;height:420px"');
  });

  it("renders at the default size when storage throws", () => {
    stubWindow(1280, () => {
      throw new Error("unused");
    });
    const html = dialog(true);
    expect(html).not.toContain('style="');
    expect(html).toContain('role="separator"');
  });

  it("draws no handles and no dimensions on a narrow screen, and fills it", () => {
    stubWindow(500, '{"width":900,"height":600}');
    const html = dialog(true);
    expect(html).not.toContain("separator");
    expect(html).not.toContain("data-edge");
    expect(html).not.toContain('style="');
    expect(html).toContain("h-[100dvh]");
  });

  it("leaves a dialog that did not opt in as it was", () => {
    stubWindow(1280, '{"width":900,"height":600}');
    const html = dialog(false);
    expect(html).not.toContain("data-edge");
    expect(html).not.toContain('style="');
    expect(html).toContain("sm:max-w-4xl");
  });
});
