import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node24",
  dts: true,
  clean: true,
  sourcemap: true,
  // The DSH chain stays a dependency tree rather than being compiled in: it finds its parts by
  // path at run time (the Windows ACL runner spawned as a file, koffi's native module, the
  // Landlock launcher binary), which a bundle breaks — the Windows rung failed exactly there.
  // The tree travels inside this package instead, as dist/node_modules (scripts/vendor-dsh-deps.mjs).
  external: [/^@deepseek-ai\//, "koffi"],
  // Bundled CommonJS calls require(); an ESM bundle has none of its own.
  banner: {
    js: 'import { createRequire as __penguinCreateRequire } from "node:module"; const require = __penguinCreateRequire(import.meta.url);',
  },
});
