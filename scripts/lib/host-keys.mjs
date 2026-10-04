/**
 * A plugin web module's requirements of web-app interfaces, keyed the way the web app keys
 * them. gen-ifaces runs it over a plugin package after the sides are decided (plugin-sides.mjs).
 *
 * The web app boots through the kernel's arktype-free runtime, which wires a requirement by
 * interface IDENTITY: the provider must declare the very table entry the requirement names
 * (core kernel/exact-check.ts). A plugin cannot import the web app's interfaces — the app is not
 * a package — so it restates the one it needs, and gen-ifaces keys that copy by the plugin's own
 * package (`@acme/pkg#Chat`), which no module of the app declares. Here such a requirement is
 * re-keyed to the app's entry (`ChatModule#Chat`) and the copy is put in the plugin's table under
 * that key. The merged table then holds the app's entry, so the runtime wires by identity; and
 * the full check, run when the web first meets the plugin, compares the app's entry with the
 * copy the plugin was built against (core kernel/tables.ts), so a host that has moved on is a
 * clear verification problem rather than a boot that throws.
 *
 * Which app interface a copy stands for: one with the same export name, among the provisions of
 * the module the requirement names with `@Use("<Module>")`, or of the whole app when it names
 * none (exactly one such interface; several is an error asking for the module). A requirement
 * naming a module whose provisions have no such name takes its one provision when it has
 * exactly one. A requirement no app interface matches is left as it is (it may be another
 * plugin's, or a mistake verification will report).
 */

const exportName = (key) => key.slice(key.indexOf("#") + 1);

/**
 * Re-keys the web modules' requirements of app interfaces (see above). Mutates `manifests`
 * and `ifaces`; returns the errors.
 *
 * @param {Record<string, { name: string, side?: string, provides?: Record<string, string>, requires?: Record<string, { iface: string, from?: string }> }>} manifests
 * @param {Record<string, unknown>} ifaces the package's interface table (`ifaces`)
 * @param {{ modules?: Record<string, { provides?: Record<string, string> }>, ifaces?: Record<string, unknown> }} host
 *   the web app's generated table
 */
export function adoptHostKeys(manifests, ifaces, host) {
  const errors = [];
  const own = new Set(Object.values(manifests).flatMap((m) => Object.values(m.provides ?? {})));
  const hostModules = host.modules ?? {};
  for (const m of Object.values(manifests)) {
    if (m.side !== "web") continue;
    for (const [alias, req] of Object.entries(m.requires ?? {})) {
      const key = req.iface;
      if (own.has(key) || host.ifaces?.[key] !== undefined || ifaces[key] === undefined) continue;
      if (req.from !== undefined && req.from in manifests) continue;
      const named = req.from !== undefined;
      const providers = named ? [req.from] : Object.keys(hostModules);
      const offered = [
        ...new Set(providers.flatMap((p) => Object.values(hostModules[p]?.provides ?? {}))),
      ];
      let match = offered.filter((k) => exportName(k) === exportName(key));
      if (match.length === 0 && named && offered.length === 1) match = offered;
      if (match.length === 1) {
        req.iface = match[0];
        ifaces[match[0]] ??= ifaces[key];
      } else if (match.length > 1) {
        errors.push(
          `${m.name}: requires.${alias} ('${key}'): the web app has several interfaces named '${exportName(key)}' (${match.join(", ")}) — name the providing module with @Use("<Module>")`,
        );
      } else if (named && hostModules[req.from] !== undefined) {
        errors.push(
          `${m.name}: requires.${alias} ('${key}'): the web app's module '${req.from}' provides no interface named '${exportName(key)}'`,
        );
      }
    }
  }
  return errors;
}
