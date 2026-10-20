import { defineConfig } from "tsup";
import { ESM_CJS_BANNER } from "../../scripts/esm-cjs-banner.mjs";

/**
 * The HMR bootstrap as ONE file: `dist/hmr-server.mjs`, copied to a machine that has a Node
 * but no Penguin, and started there. Nothing is resolved at run time — not `ws`, not the HMR
 * package, not core's kernel — because the data root it lands in holds no node_modules and
 * is not a checkout. The `.mjs` extension is load-bearing too: that store has no package.json,
 * so a `.js` file there is CommonJS to Node and the bundle's `import` statements do not parse.
 *
 * A config of its own rather than an entry in tsup.config.ts: that build's output is the
 * npm-published dist (external core, declarations, entries for subpaths), while this is one
 * self-contained program whose only dependency is the Node that starts it.
 *
 * `clean: false` because it runs after the main build in the same directory — and the banner
 * for the same reason the pushed platform and CLI bundles carry it: `ws` is CommonJS and its
 * wrapper references `require` / `__filename`, which an ESM bundle does not supply.
 */
export default defineConfig({
  entry: { "hmr-server": "src/hmr/bootstrap.ts" },
  format: ["esm"],
  platform: "node",
  target: "node24",
  dts: false,
  splitting: false,
  // A second file would be a map nothing copies to the machine beside the program.
  sourcemap: false,
  clean: false,
  noExternal: [/.*/],
  banner: { js: ESM_CJS_BANNER },
  outExtension: () => ({ js: ".mjs" }),
});
