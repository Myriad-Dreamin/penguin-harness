// The global setup builds and packs this plugin, so the live suite runs it as it ships (see test/global-setup.ts).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
  },
});
