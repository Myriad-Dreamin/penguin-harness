/**
 * The runtime booter's check: what can be refused on every boot without arktype.
 *
 * The full check ({@link checkTree} in ./check.ts) answers "does this tree fit together" —
 * structural interface satisfaction and contribution shapes, both arktype work. It belongs
 * to VERIFICATION: the web's builtin tree is verified when it is built, a plugin's table
 * when it is first seen (web lib/verify-plugins.ts). What a verified tree still needs at
 * assembly is cheap and identity-based, and is checked here on every boot:
 *
 *   - module names are unique, and so are contribution ids;
 *   - every provided and required interface is in the table;
 *   - every requirement has exactly one visible provider DECLARING that interface (the
 *     same table entry), or names its provider with `from`;
 *   - every contribution names a slot a module declares.
 *
 * A requirement only a structural match would satisfy is refused here. That is the rule
 * for the arktype-free runtime: assembly wires by identity; structural compatibility is
 * the verifier's to accept. The resolution mirrors checkTree's exact pass and its
 * problems use the same vocabulary, but it is not a mode of checkTree: checkTree stays
 * the one statement of the full contract, and the two evolve separately.
 */
import type { TableLike } from "./sig.js";
import { tableOf } from "./table.js";
import { ifaceKey, splitSlotKey } from "./keys.js";
import type { CheckResult, Located, ManifestNode, Problem, Published } from "./tree.js";
import { locate, provided } from "./tree.js";

export function checkExact(
  root: ManifestNode,
  table: TableLike,
  published: Published = {},
): CheckResult {
  const problems: Problem[] = [];
  const byName = new Map<string, Located>();
  for (const m of locate(root)) {
    const other = byName.get(m.manifest.name);
    if (other !== undefined) {
      problems.push({ path: m.path, kind: "duplicate-module", name: m.manifest.name, other: other.path });
      continue;
    }
    byName.set(m.manifest.name, m);
  }
  const provides: CheckResult["provides"] = { ...published };
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
      if (need.from !== undefined) {
        const from = need.from;
        const offered = requirable(from) ? provides[from] : undefined;
        const why =
          offered !== undefined
            ? Object.values(offered).includes(required) || Object.keys(offered).length === 1
              ? null
              : Object.keys(offered).length === 0
                ? "provides nothing"
                : `provides several interfaces and none is '${need.iface}' itself — name the interface it declares`
            : m.ancestors.has(from)
              ? "an ancestor — created after its children, so its api is not there yet"
              : from === mf.name
                ? "itself"
                : byName.has(from)
                  ? "not visible from here"
                  : "no such module";
        if (why !== null) problems.push({ path: m.path, kind: "unresolved", alias, from, why });
        continue;
      }
      const declaring = [...m.visible, ...Object.keys(published)].filter(
        (name) =>
          name !== mf.name &&
          requirable(name) &&
          Object.values(provides[name] ?? {}).includes(required),
      );
      const unique = [...new Set(declaring)];
      if (unique.length === 1) continue;
      problems.push({
        path: m.path,
        kind: "unresolved",
        alias,
        from: "",
        why:
          unique.length === 0
            ? "no visible module declares this interface (a structural match is for verification to accept, not for the runtime booter)"
            : `ambiguous: ${unique.join(", ")} all declare it — name one with 'from'`,
      });
    }
    for (const [slotKey, entries] of Object.entries(mf.contributes)) {
      const split = splitSlotKey(slotKey);
      const target = split === null ? undefined : provides[split.module];
      const declared =
        split !== null &&
        target !== undefined &&
        Object.values(target).some((decl) => decl.slots[split.slot] !== undefined);
      if (!declared) {
        problems.push({ path: m.path, kind: "no-such-slot", slotKey });
        continue;
      }
      for (const entry of entries) {
        const other = ids.get(entry.id);
        if (other !== undefined) problems.push({ path: m.path, kind: "duplicate-id", id: entry.id, other });
        else ids.set(entry.id, m.path);
      }
    }
  }
  return { problems, provides };
}
