/**
 * The full module boot: {@link bootModules} checks the whole contract before anything is
 * created — structural interface satisfaction, contribution shapes ({@link checkTree}) —
 * wires a requirement to a structural match when no provider declares the interface
 * itself, and validates a parked context against its schema. Those are the arktype parts;
 * the assembly itself is ./assemble.ts, shared with the arktype-free runtime entry.
 *
 * The server and the hot-update host boot here. The web boots its verified builtin tree
 * through the runtime entry (./runtime.ts) instead.
 */
import { type } from "arktype";
import type { Json } from "./json.js";
import { satisfies } from "./sig.js";
import { checkTree } from "./check.js";
import type { AssemblyRules, BootModulesOptions, ModuleTree } from "./assemble.js";
import { assemble } from "./assemble.js";
import type { ModuleDef } from "./module-def.js";
import { ModuleBootError } from "./module-def.js";

/**
 * A context schema, parsed once per definition: arktype files every parse in a registry
 * that lives as long as the process and never shrinks, and every boot with parked context
 * validated it afresh (see slotSchema in ./check.ts).
 */
const contextSchemas = new Map<string, (v: unknown) => unknown>();

function contextSchema(def: Json): (v: unknown) => unknown {
  const key = JSON.stringify(def);
  let schema = contextSchemas.get(key);
  if (schema === undefined) {
    schema = type.raw(def).onUndeclaredKey("reject");
    contextSchemas.set(key, schema);
  }
  return schema;
}

const FULL: AssemblyRules = {
  check: checkTree,
  satisfies: (offered, required, ifaces) => satisfies(offered, required, ifaces).length === 0,
  validateContext(module, schema, self) {
    const out = contextSchema(schema)(self);
    if (out instanceof type.errors) {
      throw new ModuleBootError(`${module}: parked context does not fit: ${out.summary}`);
    }
  },
};

export async function bootModules(root: ModuleDef, opts: BootModulesOptions): Promise<ModuleTree> {
  return assemble(root, opts, FULL);
}
