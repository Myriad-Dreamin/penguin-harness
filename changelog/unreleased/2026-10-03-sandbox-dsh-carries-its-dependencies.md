# sandbox-dsh carries its dependencies

- **Date:** 2026-10-03
- **Type:** feature
- **Scope:** `plugins/sandbox-dsh`, `build`
- **PR:** [Myriad-Dreamin/penguin-harness#191](https://github.com/Myriad-Dreamin/penguin-harness/pull/191)

[中文版](2026-10-03-sandbox-dsh-carries-its-dependencies.zh.md)

`@penguinharness/sandbox-dsh` now loads wherever its package is unpacked, with nothing installed beside it. It used to declare the DSH chain as runtime dependencies, which the builtin build and the plugin store had to collect into its store entry, the peers included, along with every target's koffi binary.

- The package carries the chain as `dist/node_modules`: `@deepseek-ai/cordis`, `@deepseek-ai/dsh-sandbox-local` and what they depend on, including the native parts for every supported host. These are koffi's prebuilt module for Linux x64/arm64, macOS x64/arm64 and Windows x64, and the Landlock launcher for Linux x64/arm64. Every platform loads koffi, because the chain imports its Windows runner statically.
- The chain is not bundled into `dist/index.js`. It finds the Windows ACL runner, koffi's native module and the Landlock launcher by path at run time, and a bundle breaks all three.
- `scripts/vendor-dsh-deps.mjs` builds the tree from `pnpm-lock.yaml`. It reads the carried packages' closure from the lockfile, including every target's platform packages, and has npm install exactly those versions (koffi 3.1.6 and its five platform packages, for example). If npm's tree holds any package or version the lockfile does not name, or any tarball whose integrity (as npm recorded it on download) differs from the `resolution.integrity` the lockfile pins for that version, the build fails. npm installs from the registry, so the build needs npm registry access. The package's build runs the script after tsup. The DSH packages moved to `devDependencies`, so the package declares no runtime dependency, and `publishConfig.executableFiles` keeps the exec bit on the Landlock launchers.
- The tarball grew from about 14 kB (7 files) to 3.7 MB (375 files).
- The plugin store collects no dependency for it: its entry's `package/` is the package as unpacked, its `dist/node_modules` included. `scripts/build-plugins.mjs` no longer allows a builtin plugin any runtime dependency (`koffi` and the DSH packages were the only ones it allowed) and fails the build on one, so it installs no per-platform native packages beside the builtin plugins. Its cache key now also covers the repository scripts a plugin's build runs and, for `vendor-dsh-deps.mjs`, the lockfile entries it vendors from, so a lockfile bump of the DSH chain rebuilds the pack. A store entry still carries a package's peer dependencies, for any other package that declares them.
- The live suite runs the packed package. Its global setup builds and packs it, and unpacks it into an npm prefix in a temp directory outside the repository, so a dependency the tarball does not carry fails the suite. A module the package does not carry fails the suite on every host; any other load failure, a host where no rung of the chain works, still skips unless `PENGUIN_MUST_RUN` names `sandbox-dsh`.
