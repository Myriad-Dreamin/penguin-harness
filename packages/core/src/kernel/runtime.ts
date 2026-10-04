/**
 * The kernel's runtime entry (`@prismshadow/penguin-core/kernel/runtime`): everything a
 * VERIFIED module tree needs to boot, and nothing that loads arktype.
 *
 * The full entry (./index.ts) checks a tree's whole contract at boot — structural interface
 * satisfaction and contribution shapes, both arktype work. The web pays nothing for that on
 * its boot path: its builtin tree is verified when it is built, a plugin's table when the
 * web first meets it, and the page boots through {@link bootVerified}, which wires by
 * interface identity and runs only the identity checks (./exact-check.ts).
 *
 * Nothing under this entry may import arktype, directly or through another file
 * (test/kernel-runtime-entry.test.ts boots with arktype throwing on import; the web build
 * refuses an entry chunk that carries it). The decorators are one module both entries
 * share, so a class decorated through one is read through the other.
 */
import { checkExact } from "./exact-check.js";
import type { BootModulesOptions, ModuleTree } from "./assemble.js";
import { assemble } from "./assemble.js";
import type { ModuleDef } from "./module-def.js";

export type { Json, JsonObject } from "./json.js";
export { isJsonObject } from "./json.js";
export type { ChildRef, ContextDecl, Manifest, Requirement } from "./manifest.js";
export type { IfaceDecl, IfaceTable, Mismatch, Sig, SlotDecl, TableLike, TypeExpr } from "./sig.js";
export type { Resources } from "./boot.js";
export { tableOf } from "./table.js";
export { ifaceKey, splitSlotKey } from "./keys.js";
export type { CheckResult, ManifestNode, Problem, Published } from "./tree.js";
export { describeProblem, provided } from "./tree.js";
export { checkExact } from "./exact-check.js";
export { CHECK_VERSION } from "./check-version.js";
export type { AssemblyRules, BootModulesOptions, ModuleTree } from "./assemble.js";
export { assemble } from "./assemble.js";
export type {
  ApiOf,
  ClassCtx,
  ComponentMeta,
  Contributed,
  IfaceClass,
  IfaceRegistry,
  ManifestTable,
  ModuleClass,
  ModuleCtx,
  ModuleDef,
  ModuleImplOf,
  ModuleInstance,
  ModuleMeta,
  UseOf,
} from "./module-def.js";
export {
  Bind,
  Component,
  defineModule,
  Module,
  ModuleBootError,
  moduleDefiner,
  moduleDefOf,
  moduleMetaOf,
  Provide,
  Use,
  wire,
} from "./module-def.js";
export type { Opaque, Slot } from "./markers.js";
export { Interface } from "./markers.js";

/**
 * Boots a tree whose verification happened elsewhere. Every requirement must resolve by
 * interface identity (or name its provider with `from`); a parked context with a schema
 * refuses the boot, since it cannot be validated here. Same order, same contributions,
 * same api as the full kernel's `bootModules` for any tree that resolves this way.
 *
 * TODO(post-verify): a plugin tree booted before its verification finished (verify after
 * boot) is not supported; plugin tables are verified first (web lib/verify-plugins.ts).
 * Revisit if that wait shows up on the boot path.
 */
export async function bootVerified(root: ModuleDef, opts: BootModulesOptions): Promise<ModuleTree> {
  return assemble(root, opts, { check: checkExact });
}
