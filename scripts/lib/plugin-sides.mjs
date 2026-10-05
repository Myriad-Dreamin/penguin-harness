/**
 * Which host runs each module of a plugin package: the platform (`server`) or the web app
 * (`web`). Nothing in the module says so; the host is where its wiring goes, derived here by one
 * rule and written into the package's `ifaces.json` as generated data (the plugin build and the
 * server read it; neither runtime infers it).
 *
 * The rule: a module's hosts are the hosts its wiring names —
 * - a requirement keyed by a host's package (`@prismshadow/penguin-web#Language` names the web
 *   app, `@prismshadow/penguin-server#Paths` the platform);
 * - a module its contribution (the slot's owner), a requirement's `from` or the package's
 *   `replaces` names, when exactly one host table carries that module. A name both hosts carry,
 *   or neither (a sibling in the same package, another plugin, a typo), names no host; a slot
 *   owner no tree has is refused by the runtime check of the tree that loads the module.
 * One host → that host. Both → an error naming the two wirings. None → the platform, which is
 * where every plugin module ran before the web app could take one (a module wired only to its
 * own siblings is in this case too: the rule does not follow sibling wiring).
 *
 * Also checked: one source file holds modules of one host (each host's build takes a module's
 * file as its entry, and one file cannot be both a browser module and a Node one); a web
 * module's requirement of an interface the package restates (declares, provides nowhere) can
 * never be met, since the page wires by interface identity (core kernel/exact-check.ts).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const SIDES = ["server", "web"];
const HOST_LABEL = { server: "the platform", web: "the web app" };
/** The package that keys each host's interfaces (gen-ifaces keys an interface by its package). */
const HOST_PACKAGE = { server: "@prismshadow/penguin-server", web: "@prismshadow/penguin-web" };

/**
 * The built file of a web module, relative to its package: one file per module, named by the
 * module. The plugin build writes exactly this path (scripts/build-plugin.mjs).
 */
export const WEB_DIR = "dist/web";
export function webFileOf(moduleName) {
  return `${WEB_DIR}/${moduleName}.js`;
}

/**
 * The two host tables as this checkout generated them, read as they are (never regenerated
 * here). A missing one is an error: without it a module's host cannot be derived.
 *
 * TODO(plugin-host-contract): read from the checkout, so a plugin built outside it cannot derive
 * its hosts; remove when the host tables ship with the published host packages.
 */
export function readHostTables(root = ROOT) {
  const out = {};
  for (const side of SIDES) {
    const file = path.join("packages", side, "src", "ifaces.json");
    let text;
    try {
      text = fs.readFileSync(path.join(root, file), "utf8");
    } catch {
      throw new Error(
        `${file} is missing: a plugin module's host is derived from it — generate it with \`pnpm gen:ifaces\` at the repository root`,
      );
    }
    out[side] = JSON.parse(text);
  }
  return out;
}

/** `<module>.<slot>` → its module half; null when malformed. Same rule as core kernel/manifest.ts. */
function slotOwner(key) {
  const at = key.lastIndexOf(".");
  return at <= 0 || at === key.length - 1 ? null : key.slice(0, at);
}

/** The wirings of `m` that name a host, as `[side, what]` pairs (see the header). */
function hostWirings(m, manifests, hosts, replaces) {
  const carried = (name) => {
    const on = SIDES.filter((s) => hosts[s].modules?.[name] !== undefined);
    return on.length === 1 ? on[0] : null;
  };
  // A name the package defines itself is a sibling, whatever a host calls its own module.
  const only = (name) => (name === null || name in manifests ? null : carried(name));
  const out = [];
  for (const [alias, req] of Object.entries(m.requires ?? {})) {
    const owner = req.iface.slice(0, req.iface.indexOf("#"));
    for (const s of SIDES)
      if (owner === HOST_PACKAGE[s]) out.push([s, `requires.${alias} ('${req.iface}')`]);
    const from = req.from === undefined ? null : only(req.from);
    if (from !== null) out.push([from, `requires.${alias} (from '${req.from}')`]);
  }
  for (const key of Object.keys(m.contributes ?? {})) {
    const s = only(slotOwner(key));
    if (s !== null) out.push([s, `its contribution to '${key}'`]);
  }
  if (replaces.includes(m.name)) {
    const s = carried(m.name);
    if (s !== null) out.push([s, `its replacement of '${m.name}'`]);
  }
  return out;
}

/**
 * What gen-ifaces writes for a plugin package: every module's derived `side`, its `source`
 * (what the plugin build takes as the module's entry) and, for a web module, its built `file`.
 * Mutates `manifests`; returns the errors.
 *
 * @param {Record<string, { name: string, requires?: Record<string, { iface: string, from?: string }>, provides?: Record<string, string>, contributes?: object }>} manifests
 * @param {ReadonlyMap<string, string>} sources module → source file
 * @param {{ hosts: { server: object, web: object }, pkgName?: string, replaces?: readonly string[] }} opts
 */
export function assignSides(manifests, sources, opts) {
  const errors = [];
  const sides = {};
  for (const [name, m] of Object.entries(manifests)) {
    const wired = hostWirings(m, manifests, opts.hosts, opts.replaces ?? []);
    const web = wired.find(([s]) => s === "web");
    const server = wired.find(([s]) => s === "server");
    if (web !== undefined && server !== undefined) {
      errors.push(
        `${name}: ${web[1]} wires it into the web app and ${server[1]} into the platform — split it into two modules`,
      );
    }
    sides[name] = web !== undefined && server === undefined ? "web" : "server";
  }
  const own = Object.fromEntries(
    Object.keys(manifests)
      .filter((n) => sources.has(n))
      .map((n) => [n, sources.get(n)]),
  );
  errors.push(...mixedFiles(own, sides));
  errors.push(...restatedCopies(manifests, sides, opts.pkgName));
  for (const [name, m] of Object.entries(manifests)) {
    m.side = sides[name];
    if (own[name] !== undefined) m.source = own[name];
    if (sides[name] === "web") m.file = webFileOf(name);
  }
  return errors;
}

/** A web module's requirements of an interface this package declares and provides nowhere. */
function restatedCopies(manifests, sides, pkgName) {
  if (pkgName === undefined) return [];
  const provided = new Set(
    Object.values(manifests).flatMap((m) => Object.values(m.provides ?? {})),
  );
  const errors = [];
  for (const m of Object.values(manifests)) {
    if (sides[m.name] !== "web") continue;
    for (const [alias, req] of Object.entries(m.requires ?? {})) {
      if (req.iface.startsWith(`${pkgName}#`) && !provided.has(req.iface)) {
        errors.push(
          `${m.name}: requires.${alias} names '${req.iface}', an interface this package declares and none of its modules provides — a web module wires by interface identity, so a restated copy never matches: import the web app's declaration from @prismshadow/penguin-web/plugin-types`,
        );
      }
    }
  }
  return errors;
}

/**
 * A source file holding modules of both hosts is an error: each host's build takes a module's
 * file as its entry, and one file cannot be both a browser module and a Node one.
 *
 * @param {Record<string, string>} sources module → source file
 * @param {Record<string, "server" | "web">} sides
 */
export function mixedFiles(sources, sides) {
  const byFile = new Map();
  for (const [name, file] of Object.entries(sources)) {
    const list = byFile.get(file) ?? [];
    list.push(name);
    byFile.set(file, list);
  }
  const errors = [];
  for (const [file, names] of byFile) {
    const web = names.filter((n) => sides[n] === "web");
    const server = names.filter((n) => sides[n] !== "web");
    if (web.length > 0 && server.length > 0) {
      errors.push(
        `${file}: holds module(s) wired into the web app [${web.join(", ")}] and module(s) that run on the platform [${server.join(", ")}] — one host per file`,
      );
    }
  }
  return errors;
}
