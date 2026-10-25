# PRFC-0021 Module Pass: the compile phase of the module tree

[中文版](PRFC-0021-module-pass.zh.md)

- Feature Name: `module_compile`
- Start Date: 2026-10-25

## Summary
[summary]: #summary

The module tree gains a compile phase between assembly and boot. A set of **ModulePass** entries, registered into the tree as manifest data, rewrite the tree as data — instrumentation, replacement and policy are applied at assembly time and checked with the tree, instead of hiding behind runtime hooks. The lifecycle of a tree becomes **assemble → compile → check → boot**, and the whole mechanism is built on the primitives [PRFC-0001](PRFC-0001-module.md) already exports: the kernel itself changes by zero lines.

## Motivation
[motivation]: #motivation

Anything that must touch the tree before it boots — instrumentation, test scaffolding, policy rewrites — has had two homes, both wrong. A runtime hook wraps live objects after the fact: the wrapping is invisible to the tree's own check, ordered by call time rather than declaration, and one broken wrapper takes the boot down. A list inside the booter is code: it travels with the booter rather than with the tree, so a tree assembled without it silently loses the behavior.

Registration as manifest data fixes all three: what runs, and in what order, is declared where the tree is assembled, checked as data before any code runs, isolated per pass, and verified with the kernel's own whole-tree check before the first node is created.

## Guide-level explanation
[guide-level-explanation]: #guide-level-explanation

A module that ships a pass contributes a registration to `CompileModule.passes`, the same way a route group reaches `HttpModule.routes`:

```json
{ "contributes": { "CompileModule.passes": [{ "id": "my-pass", "after": ["other-pass"] }] } }
```

The registration is data: an `id`, and the ids this pass runs behind. The checker validates it against the slot's schema with the rest of the tree, so a malformed registration is a boot error naming the file, not a runtime surprise. The pass's **code** half — the rewrite function — is resolved by the host from the `id` when the compile starts (the pipeline's `resolve` option); a plugin host answers this from what plugin bundles export. What the manifest carries is the part that had no home until now: WHICH passes a tree runs, and in what order.

The compile runs on every boot — a cold start, a re-assembly, a restore — over both the full platform tree and a declared bare kernel. `PENGUIN_MODULE_COMPILE_DEBUG=1` gates the debug output: the per-pass trace with timings, skip and failure reasons, and a dump of the compiled tree. Off, the quiet path collects nothing and times nothing.

## Reference-level explanation
[reference-level-explanation]: #reference-level-explanation

### Registration surface (`compile/module.ts`)

- `Compile`: an interface class carrying no members of its own. What it carries is the registration slot, so a tree that wants passes declares `CompileModule` and the registrations become checkable data. A module may still require `Compile` for what later grows here.
- `CompileSlots`: the companion interface. Its `passes` property is a data-only `Slot<{ after?: string[] }>`, projected into `ifaces.json` by `gen:ifaces` exactly like `http.routes`, and validated per entry by the checker. An entry's `id` is the contribution's id — the checker's per-entry identity, unique in the slot — and the pass's id the host resolves.
- `compileModuleDef()`: the `CompileModule` node. It provides `Compile` with an empty api — the slot is the point. The host mounts it under the platform root, beside the plugin modules, where the checker's visibility rules make contributions from sibling modules legal. The manifest's `name` is spelled through a constant on purpose: the generator reads a directory's module name from its `module.ts` by a text scan that matches a `name: "…"` string literal, and a literal here would re-key `Compile` away from the package key the manifest's `provides` names.

### The pipeline (`compile/pipeline.ts`, `compile/tree.ts`)

`compileModuleTree(root, { ifaces, resolve?, debug? })` runs, in order:

1. **Collect** the registrations from the tree's own manifests (`contributionsOf`): every `CompileModule.passes` entry, in tree order. The first registration of an id runs; a repeated one is skipped with the reason kept, and the checker reports the duplicate loudly as its own problem.
2. **Order** by the registrations' `after`, topologically; registration order breaks ties. A cycle is a loud error naming the path (`a -> b -> a`). An `after` naming an id nobody registered is vacuous — "behind it, if present".
3. **Check** each pass's `requires` — the interface classes it works on — against the current tree: every required interface must be provided somewhere, by name resolved through the table. The provided set is computed once and recomputed only after a pass actually rewrites the tree. A pass whose requirements the tree cannot satisfy is skipped with the reason kept — the normal condition of a stripped tree, not an error.
4. **Rewrite**: each pass receives an immutable copy of the tree (`copyTree`) and returns a new tree. Mutating the input is a bug in the pass; the copy is what makes the fallback below possible. A pass that throws, or returns no tree, is **set aside**: the tree it was handed is the tree the boot gets, the reason is kept, and the warn is not debug-gated — a throwing pass is a bug worth a line even where nobody asked for a trace. One pass cannot take the boot down.
5. **Verify**: the final tree goes through the kernel's own `checkTree`, the same check the boot runs — a tree the compile accepts is a tree the boot accepts. A tree the passes broke is rejected at the compile, the problems listed with the first problem first.

The pipeline reads the tree as data only: manifests are the program, `create()` functions are opaque leaves. Nothing in the compile executes module code.

### The boot seam (`hmr/platform.ts`)

Both boot branches assemble `compileModuleDef()` into the tree — the full platform tree as one more module under the root, the bare kernel the same way — then compile, then boot:

```ts
const compiled = await compileModuleTree(platformDef(caps, adoptable, [...kept.modules, compileModuleDef()], ...), { ifaces, debug: compileDebug });
return bootModules(compiled.tree, { ifaces, resources, parked });
```

A tree that registers nothing runs a compile of the verify alone; the boot is the same boot either way. The host passes no `resolve` today: with no consumer there is nothing to answer, and a registered id nothing resolves is warned and skipped — the seam a plugin host fills is this call's options, not a code change in the pipeline.

### The two soft edges, said plainly

- **The name bridge.** `requires` are interface classes; the tree provides declared names. The bridge is the class's `.name`: a minifier that renames the binding changes it, and two same-named classes collide. The kernel's own node names avoid this with the decorator context's string literal; the thorough fix is the generator's — stamp the table's key onto the class it projects, and read the stamp here. Until then the bridge is documented on `declNameOf` itself.
- **The pre-generated table.** `ifaces.json` is a build artifact regenerated by `typecheck`, the server's `build` and `test`, and `deploy.mjs`. Until the generator runs with `Compile` in the sources, the checker reports `CompileModule`'s provides and the `passes` slot as unknown — the same pre-gen note every new module carries, and the reason the projection is a build-side fact rather than a code one.

## Drawbacks
[drawbacks]: #drawbacks

- Every boot pays one extra whole-tree check when no pass is registered: manifest data only, the same check the boot runs a moment later. The alternative — skipping the compile when nothing is registered — would make the compile path conditional, so a registration arriving in a plugin would take a path no boot had exercised.
- A pass that rewrites manifest data (rather than wrapping `create()`) must copy what it changes: `copyTree` copies manifests shallowly, so unchanged records are shared with the earlier tree. The contract says so on `ModulePass.rewrite`.

## Rationale and alternatives
[rationale-and-alternatives]: #rationale-and-alternatives

- **A default kernel hook** (a `wrapApi` seam the booter calls): rejected in earlier trials — a hook is a seam the kernel has to keep honest, and it re-introduces exactly the runtime ordering the module tree exists to replace. The compile keeps the kernel untouched: the pipeline is a consumer of the tree, not an extension of the kernel.
- **A pass list in the booter**: the list would be code, invisible to the tree's check and unable to travel with the trees that need it. Registration as contribution data follows the pattern the tree already uses for routes, settings groups and skill catalogs.
- **Dispatch by interface name through a switch**: the reference consumer dispatches by class identity, with each arm typed by the class it casts — the key and the arm cannot drift apart the way a string key and a far-away case can.

## Prior art
[prior-art]: #prior-art

The name follows the compiler tradition: passes over a tree, ordered by declared dependencies, each isolated, verified at the end. The registration mechanism follows the contribution-slot pattern this codebase already uses throughout its module tree.

## Unresolved questions
[unresolved-questions]: #unresolved-questions

- **The pass factory for plugin bundles.** The registration is manifest data; the code half cannot travel with it (`bind` hands a contributor its contribution inside `create()`, which is after the compile). Today the host resolves ids itself; a plugin host answering a factory from what a bundle exports touches the plugin loading contract ([PRFC-0003](PRFC-0003-plugin.md)) and is its own future change.
- **The gen-side name stamp**, replacing the `.name` bridge on `requires` (see the soft edges above).
- **A shared walk for node-local passes**: several passes that touch one node at a time could share one traversal, with a failing pass dropped and the walk restarted; passes that restructure the tree keep the whole-tree form. The cost model trades one copy for a narrower view.
- **Slot granularity**: one `passes` slot today; whether passes split by kind, and whether registrations carry metadata beyond `id` and `after`, waits for a second consumer.
- **Ordering between independent passes**: ties are broken by registration order today; whether two unrelated passes must name each other explicitly is open.

## Future possibilities
[future-possibilities]: #future-possibilities

- Instrumentation is the first consumer; test scaffolding (a tree doubled for a test) and policy rewrites (a tree pruned by configuration) are the same shape and need no new mechanism.
- A pre-push check could run the compile against the target runtime's published interface table, before a bundle that cannot compile is pushed to it.

## Changes

### v1.0.0

- Added: the compile phase of the module tree — the `Compile` registration interface, the `CompileModule.passes` slot, the `compileModuleTree` pipeline, the boot seam in both boot branches, and the debug gate. Landing together with its implementation.
