/**
 * The module-tree check: manifests + interface table in, problems out. Nothing here
 * executes module code, so it runs on the sending side of a push (against the target's
 * published table), at boot (before any create), and in CI.
 *
 * Three questions, per module:
 *   1. every `requires` resolves to a visible module whose provided interface
 *      structurally satisfies the required one ({@link satisfies});
 *   2. every contribution names an existing `<module>.<slot>` and parses under that
 *      slot's data schema;
 *   3. every `provides` names an interface the table actually carries.
 *
 * Visibility is lexical: a module sees its siblings, its ancestors and their siblings —
 * not another subtree's internals, and not itself. Anything the host publishes (the
 * runtime's capabilities) is visible everywhere, as a virtual root-level sibling.
 *
 * Ancestors are visible to CONTRIBUTE to (a child fills its parent's slots), not to
 * REQUIRE from: a parent is created after its children, so its api does not exist when
 * a child is created. The booter orders it so; the check refuses the requirement here,
 * before any code runs, rather than letting it surface as a dependency cycle at boot.
 */
import { type } from "arktype";
import type { Json } from "./json.js";
import type { IfaceDecl, TableLike } from "./sig.js";
import { satisfies } from "./sig.js";
import { tableOf } from "./table.js";
import { ifaceKey, splitSlotKey } from "./keys.js";
import type { CheckResult, Located, ManifestNode, Problem, Published } from "./tree.js";
import { locate, provided } from "./tree.js";

export function checkTree(
  root: ManifestNode,
  table: TableLike,
  published: Published = {},
): CheckResult {
  const problems: Problem[] = [];
  const located = locate(root);
  const byName = new Map<string, Located>();
  for (const m of located) {
    const other = byName.get(m.manifest.name);
    if (other !== undefined) {
      problems.push({
        path: m.path,
        kind: "duplicate-module",
        name: m.manifest.name,
        other: other.path,
      });
      continue;
    }
    byName.set(m.manifest.name, m);
  }
  const provides: Record<string, Record<string, IfaceDecl>> = { ...published };
  for (const m of byName.values()) {
    const { byAlias, unknown } = provided(m.manifest, table);
    for (const u of unknown) problems.push({ path: m.path, kind: "unknown-iface", ...u });
    provides[m.manifest.name] = byAlias;
  }
  const ids = new Map<string, string>();
  for (const m of byName.values()) {
    const mf = m.manifest;
    for (const [alias, need] of Object.entries(mf.requires)) {
      const required = tableOf(table).ifaces[ifaceKey(mf.name, need.iface)];
      if (required === undefined) {
        problems.push({ path: m.path, kind: "unknown-iface", alias, ref: need.iface });
        continue;
      }
      const requirable = (from: string) =>
        (m.visible.has(from) && !m.ancestors.has(from)) || from in published;
      const candidates =
        need.from !== undefined
          ? [need.from]
          : [...m.visible, ...Object.keys(published)].filter(
              (name) => name !== mf.name && !m.ancestors.has(name),
            );
      const matches: string[] = [];
      // Providers that DECLARE this very interface (the same table entry): when exactly
      // one does, it wins over the others that merely have the shape.
      const declared: string[] = [];
      let lastMismatch: { from: string; method: string; why: string } | null = null;
      for (const from of candidates) {
        if (!requirable(from)) continue;
        const offered = provides[from];
        if (offered === undefined) continue;
        let satisfied = false;
        for (const decl of Object.values(offered)) {
          const gaps = satisfies(decl, required, table);
          if (gaps.length === 0) {
            satisfied = true;
            if (decl === required) declared.push(from);
            continue;
          }
          lastMismatch = { from, method: gaps[0]!.method, why: gaps[0]!.why };
        }
        if (satisfied) matches.push(from);
      }
      if (matches.length === 1 || declared.length === 1) continue;
      if (need.from !== undefined) {
        const from = need.from;
        if (!requirable(from) || provides[from] === undefined) {
          problems.push({
            path: m.path,
            kind: "unresolved",
            alias,
            from,
            why: m.ancestors.has(from)
              ? "an ancestor — created after its children, so its api is not there yet"
              : from === mf.name
                ? "itself"
                : byName.has(from)
                  ? "not visible from here"
                  : "no such module",
          });
        } else if (lastMismatch !== null) {
          problems.push({ path: m.path, kind: "mismatch", alias, ...lastMismatch });
        } else {
          problems.push({ path: m.path, kind: "unresolved", alias, from, why: "provides nothing" });
        }
      } else {
        problems.push({
          path: m.path,
          kind: "unresolved",
          alias,
          from: "",
          why:
            matches.length === 0
              ? "no visible module provides an interface satisfying it"
              : `ambiguous: ${matches.join(", ")} all satisfy it — name one with 'from'`,
        });
      }
    }
    for (const [slotKey, entries] of Object.entries(mf.contributes)) {
      const split = splitSlotKey(slotKey);
      const target = split === null ? undefined : provides[split.module];
      const slot =
        split === null || target === undefined
          ? undefined
          : Object.values(target)
              .map((decl) => decl.slots[split.slot])
              .find((s) => s !== undefined);
      if (slot === undefined) {
        problems.push({ path: m.path, kind: "no-such-slot", slotKey });
        continue;
      }
      let schema: ((v: unknown) => unknown) | null = null;
      try {
        schema = slotSchema(inlineRefs(slot.data, tableOf(table).types));
      } catch (err) {
        problems.push({
          path: m.path,
          kind: "bad-contribution",
          slotKey,
          id: "*",
          why: `slot schema is not an arktype definition: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }
      for (const entry of entries) {
        const other = ids.get(entry.id);
        if (other !== undefined) {
          problems.push({ path: m.path, kind: "duplicate-id", id: entry.id, other });
        } else {
          ids.set(entry.id, m.path);
        }
        const { id: _id, ...data } = entry;
        const out = schema(data);
        if (out instanceof type.errors) {
          problems.push({
            path: m.path,
            kind: "bad-contribution",
            slotKey,
            id: entry.id,
            why: out.summary,
          });
        }
      }
    }
  }
  return { problems, provides };
}

/**
 * A slot's contribution schema, parsed once per definition. arktype files every parse in a
 * registry that lives as long as the process and never shrinks, and every boot checks every
 * contribution: parsed afresh, each boot grew it (see leafExtends in ./data.ts).
 */
const slotSchemas = new Map<string, (v: unknown) => unknown>();

function slotSchema(def: Json): (v: unknown) => unknown {
  const key = JSON.stringify(def);
  let schema = slotSchemas.get(key);
  if (schema === undefined) {
    schema = type.raw(def).onUndeclaredKey("reject");
    slotSchemas.set(key, schema);
  }
  return schema;
}

/** A definition with its `$ref`s substituted, for arktype (which knows no references); a cycle stays a reference and parses as `unknown`. */
export function inlineRefs(def: Json, types: Record<string, Json>, stack: string[] = []): Json {
  if (Array.isArray(def)) return def.map((d) => inlineRefs(d, types, stack));
  if (def !== null && typeof def === "object") {
    const keys = Object.keys(def);
    if (keys.length === 1 && keys[0] === "$ref" && typeof def.$ref === "string") {
      const name = def.$ref;
      const target = types[name];
      if (target === undefined || stack.includes(name)) return "unknown";
      return inlineRefs(target, types, [...stack, name]);
    }
    return Object.fromEntries(
      Object.entries(def).map(([k, v]) => [k, inlineRefs(v, types, stack)]),
    );
  }
  return def;
}
