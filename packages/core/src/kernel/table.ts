/**
 * The interface table as functions take it. Its own file, apart from the signature
 * comparison in ./sig.ts (which reaches arktype through ./data.ts), so the runtime entry
 * can normalize a table without loading arktype.
 */
import type { IfaceDecl, IfaceTable, TableLike } from "./sig.js";

export function tableOf(t: TableLike | undefined): IfaceTable {
  if (t === undefined) return { ifaces: {}, types: {} };
  if ("ifaces" in t && "types" in t && typeof t.ifaces === "object" && !("methods" in t.ifaces)) {
    return t as IfaceTable;
  }
  return { ifaces: t as Record<string, IfaceDecl>, types: {} };
}
