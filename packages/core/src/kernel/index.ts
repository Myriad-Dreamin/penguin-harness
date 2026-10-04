/**
 * Hot-update kernel: Park + boot + a static instance tree.
 *
 * No Node/React/SDK dependencies (arktype is the one library: context schemas, contribution
 * shapes and data assignability) so both the server platform and the web platform run the
 * same code. See the architecture proposal ("可热更新、可分发的 Agent Harness").
 *
 * This is the FULL entry: everything in the runtime entry (./runtime.ts, arktype-free) plus
 * the check, the signature comparison and the boot that runs them. A page boot path imports
 * the runtime entry and reaches this one only through a dynamic import.
 */
export * from "./runtime.js";
export type { ParseFail, ParseResult, Schema } from "./schema.js";
export { schema, type } from "./schema.js";
export type { AnyIface, ChildDecl, Iface, KeyedDecl, Park } from "./iface.js";
export { defineIface, ifaceData, isKeyed, keyed } from "./iface.js";
export type { AnyImpl, Impl, Instance, KeyedHandle, NodeCtx, ParkedNode } from "./boot.js";
export { boot, BootError, initialDoc } from "./boot.js";
export type { UpgradeBlocked, UpgradeFailed, UpgradeResult } from "./upgrade.js";
export { upgrade } from "./upgrade.js";
export { assignable, closedShape, extendsExpr, satisfies, show } from "./sig.js";
export { parseManifest } from "./manifest.js";
export { checkTree, inlineRefs } from "./check.js";
export type { ModuleTable } from "./tables.js";
export { checkTables, mergeTables, treesOf } from "./tables.js";
export { bootModules } from "./module.js";
export { dataExtends } from "./data.js";
export type { TypeTable } from "./data.js";
