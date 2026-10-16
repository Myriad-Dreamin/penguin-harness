/**
 * Guard: the Settings dialog's pages never install a plugin.
 *
 * Installing is the Plugins page's card — the one flow every plugin shares, and the shape the
 * plugin experience was unified on (a skill-type plugin's install has always been that card;
 * a server module's is its card, with the re-assembly cost said before it runs). The Sandbox
 * card once asked and installed backends from its switch — that prompt is gone, and this guard
 * is the structural assertion that nothing like it grows back: no module under
 * features/settings may so much as name a plugin install call. The Plugins page's own modules
 * still make those calls, and the positive control below pins that against them — a scan that
 * had gone blind (a moved directory, a renamed file) would pass over nothing.
 */
import { describe, expect, it } from "vitest";
import { expectEveryRootScanned, scanSources } from "./helpers/roots";

/** Every plugin install call the app's API offers: none of them is a settings page's to make. */
const INSTALL_CALLS = ["installPlugin", "installAgentPlugins"] as const;

describe("the Settings dialog never installs a plugin", () => {
  it("names no plugin install call, while the Plugins page still makes its", () => {
    const scan = scanSources([".ts", ".tsx"]);
    expectEveryRootScanned(scan);

    const inSettings: string[] = [];
    let pluginsPageCalls = 0;
    for (const file of scan.files) {
      const calls = INSTALL_CALLS.filter((call) => file.text.includes(call));
      if (calls.length === 0) continue;
      if (file.id.startsWith("packages/web/src/features/settings/")) {
        inSettings.push(...calls.map((call) => `${file.id}: ${call}`));
      }
      if (file.id === "packages/web/src/features/plugins/plugins-page.tsx") pluginsPageCalls++;
    }
    expect(inSettings).toEqual([]);
    // The positive control: the scan still sees the Plugins page's own install calls, so an
    // empty result above is the guard holding, not the scan going blind.
    expect(pluginsPageCalls).toBeGreaterThan(0);
  });
});
