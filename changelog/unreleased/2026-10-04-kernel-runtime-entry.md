# The Web App boots without loading arktype

- **Date:** 2026-10-04
- **Type:** feature
- **Scope:** `core`, `web`

[中文版](2026-10-04-kernel-runtime-entry.zh.md)

The kernel gains an arktype-free runtime entry, and the Web App's boot path moves onto it: the module tree it boots is verified when the app is built, not on every page load.

## Details

- `@prismshadow/penguin-core/kernel/runtime` boots a verified module tree with no arktype in its import graph: the module decorators, `Interface`, `moduleDefOf`, and `bootVerified`, which wires each requirement by interface identity (or to the provider its `from` names) and, on every boot, still refuses duplicate module names and contribution ids, contributions to slots nobody declares, unknown interfaces and requirements without a provider. A tree that only a structural match would wire, or a parked context with a schema, is refused rather than booted unchecked. The full `@prismshadow/penguin-core/kernel` entry keeps its surface and behaviour; the server boots through it unchanged.
- The Web App boots its builtin tree through the runtime entry. `pnpm build` in `packages/web` runs the kernel's full check over the generated `ifaces.json` before `vite build` and fails on any problem, the build fails when arktype reaches a chunk the page loads up front, and a lint rule refuses value imports of the full kernel under `packages/web/src`.
- Plugin tables have a verifier for the Web App to call (`lib/verify-plugins.ts`): each table is checked against the app's own with the full kernel, loaded as a lazy chunk only when some table has not been verified before. Passed verdicts are kept in `localStorage` (`penguin.verifiedPlugins`) by table content hash, under an identity of the app's interface table and the kernel's check version; the current identity and the three most recently used before it are kept. Safe mode does not use it.
- A parked module context's schema is parsed once per process instead of on every boot.
