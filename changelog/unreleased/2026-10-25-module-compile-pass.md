# The module tree gains a compile phase: passes registered as data rewrite the tree before boot

- **Date:** 2026-10-25
- **Type:** feature
- **Scope:** `server`, `docs`

[中文版](2026-10-25-module-compile-pass.zh.md)

A module tree now compiles between assembly and boot: modules contribute passes to `CompileModule.passes` — an id, and the ids each pass runs behind — and the pipeline orders them by those declarations, checks each pass's requirements against the current tree, hands every pass an immutable copy to rewrite, sets a failing pass aside without taking the boot down, and verifies the result with the kernel's own whole-tree check before the first node is created. Instrumentation, replacement and policy are declared with the tree and checked as data, instead of hiding behind runtime hooks. Design: PRFC-0021.

- The registration surface: a `Compile` interface carrying a data-only `passes` slot, validated per entry by the same checker that validates routes and settings groups; the `CompileModule` node mounts under the platform root in both boot branches, so a full platform tree and a declared bare kernel compile the same way.
- A pass's code half is resolved by the host from the registration's id (the pipeline's `resolve` option); a plugin host can answer this from what plugin bundles export. A registered id nothing resolves is warned and skipped, and a tree that registers nothing runs a compile of the verify alone.
- `PENGUIN_MODULE_COMPILE_DEBUG=1` gates the debug output: the per-pass trace with timings, skip and failure reasons, and a dump of the compiled tree. The quiet path collects nothing and times nothing.
- The kernel is untouched: the mechanism is built entirely on exported primitives (`checkTree`, `satisfies`, `Interface`, `Slot`, `defineModule`), and the pipeline reads the tree as data — manifests are the program, `create()` functions are opaque leaves.
