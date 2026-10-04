/**
 * Which side runs each module of a plugin package: the platform (`server`) or the web app
 * (`web`). The module DECLARES it — `@Module({ side: "web" })`, read statically by gen-ifaces;
 * no declaration means the platform, where every plugin module ran before the web could take
 * one — and gen-ifaces writes it into the package's `ifaces.json`, so neither runtime infers it.
 *
 * Nothing here decides a side from wiring, and nothing here reads a host's table to decide
 * anything: a plugin's build output is a function of the package alone. What is checked:
 *
 * - one source file holds modules of one side (each side's build takes a module's file as its
 *   entry, and one file cannot be both a browser module and a Node one);
 * - a web module's requirement names an interface by identity (the page wires by key, core
 *   kernel/exact-check.ts), so a requirement of an interface the package declares itself and no
 *   module of it provides can never be met: a restated copy of a host interface. The plugin must
 *   import the web app's declaration (`@prismshadow/penguin-web/plugin-types`) instead;
 * - a module requiring an interface keyed by the other host's package is on the wrong side;
 * - when the host tables are generated in this checkout (read as they are, never regenerated
 *   here), a module whose contribution, `from` or replacement names a module only the OTHER
 *   host has is declared on the wrong side. Without them this last check is skipped; each
 *   runtime still checks the tree it assembles (the platform at boot, the web app before it
 *   mounts) and refuses what does not fit.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const SIDES = ["server", "web"];
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

/** The host tables as this checkout last generated them, by side; a missing one is left out. */
export function readHostTables(root = ROOT) {
  const out = {};
  for (const side of SIDES) {
    try {
      out[side] = JSON.parse(
        fs.readFileSync(path.join(root, "packages", side, "src", "ifaces.json"), "utf8"),
      );
    } catch {
      // Not generated yet (a plugin built before the hosts): the misplacement check is skipped.
    }
  }
  return out;
}

/**
 * What gen-ifaces writes for a plugin package: every module's declared `side`, its `source`
 * (what the plugin build takes as the module's entry) and, for a web module, its built `file`.
 * Mutates `manifests`; returns the errors.
 *
 * @param {Record<string, { name: string, requires?: Record<string, { iface: string, from?: string }>, provides?: Record<string, string>, contributes?: object }>} manifests
 * @param {ReadonlyMap<string, string>} sources module → source file
 * @param {ReadonlyMap<string, string>} declared module → the side its decorator declares
 * @param {{ pkgName?: string, replaces?: readonly string[], hosts?: { server?: object, web?: object } }} [opts]
 */
export function assignSides(manifests, sources, declared, opts = {}) {
  const errors = [];
  const sides = {};
  for (const name of Object.keys(manifests)) {
    const side = declared.get(name) ?? "server";
    if (!SIDES.includes(side)) {
      errors.push(`${name}: side '${side}' is neither "server" nor "web"`);
      sides[name] = "server";
    } else sides[name] = side;
  }
  const own = Object.fromEntries(
    Object.keys(manifests)
      .filter((n) => sources.has(n))
      .map((n) => [n, sources.get(n)]),
  );
  errors.push(...mixedFiles(own, sides));
  errors.push(...foreignKeys(manifests, sides, opts.pkgName));
  errors.push(...misplaced(manifests, sides, opts.hosts ?? {}, opts.replaces ?? []));
  for (const [name, m] of Object.entries(manifests)) {
    m.side = sides[name];
    if (own[name] !== undefined) m.source = own[name];
    if (sides[name] === "web") m.file = webFileOf(name);
  }
  return errors;
}

/**
 * Requirements whose interface key cannot be met on the module's side: a web module's
 * requirement of an interface this package restates (declares, provides nowhere), and any
 * module's requirement of an interface keyed by the other host's package.
 */
export function foreignKeys(manifests, sides, pkgName) {
  const errors = [];
  const provided = new Set(
    Object.values(manifests).flatMap((m) => Object.values(m.provides ?? {})),
  );
  for (const m of Object.values(manifests)) {
    const side = sides[m.name];
    const other = side === "web" ? "server" : "web";
    for (const [alias, req] of Object.entries(m.requires ?? {})) {
      const owner = req.iface.slice(0, req.iface.indexOf("#"));
      if (owner === HOST_PACKAGE[other]) {
        errors.push(
          `${m.name}: requires.${alias} is ${HOST_LABEL[other]}'s interface '${req.iface}', but the module is declared for ${HOST_LABEL[side]} — declare @Module({ side: "${other}" })`,
        );
      } else if (
        side === "web" &&
        pkgName !== undefined &&
        owner === pkgName &&
        !provided.has(req.iface)
      ) {
        errors.push(
          `${m.name}: requires.${alias} names '${req.iface}', an interface this package declares and none of its modules provides — a web module wires by interface identity, so a restated copy never matches: import the web app's declaration from @prismshadow/penguin-web/plugin-types`,
        );
      }
    }
  }
  return errors;
}

/** `<module>.<slot>` → its module half; null when malformed. Same rule as core kernel/manifest.ts. */
function slotOwner(key) {
  const at = key.lastIndexOf(".");
  return at <= 0 || at === key.length - 1 ? null : key.slice(0, at);
}

/**
 * Modules declared on one side that name a module only the other host has (see the header).
 * A name both hosts carry, or neither, is left to the runtime check.
 */
export function misplaced(manifests, sides, hosts, replaces = []) {
  if (hosts.server === undefined || hosts.web === undefined) return [];
  const errors = [];
  const has = (side, name) => hosts[side].modules?.[name] !== undefined;
  for (const m of Object.values(manifests)) {
    const side = sides[m.name];
    const other = side === "web" ? "server" : "web";
    const refs = [
      ...Object.keys(m.contributes ?? {}).map((key) => [
        slotOwner(key),
        `its contribution to '${key}'`,
      ]),
      ...Object.entries(m.requires ?? {})
        .filter(([, req]) => req.from !== undefined)
        .map(([alias, req]) => [req.from, `its requirement '${alias}'`]),
      ...(replaces.includes(m.name) ? [[m.name, "its replacement"]] : []),
    ];
    for (const [name, why] of refs) {
      if (name === null || name in manifests) continue;
      if (!has(side, name) && has(other, name)) {
        errors.push(
          `${m.name}: ${why} names ${HOST_LABEL[other]}'s module '${name}', but the module is declared for ${HOST_LABEL[side]} — declare @Module({ side: "${other}" })`,
        );
      }
    }
  }
  return errors;
}

/**
 * A source file holding modules of both sides is an error: each side's build takes a module's
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
        `${file}: holds web module(s) [${web.join(", ")}] and platform module(s) [${server.join(", ")}] — one side per file`,
      );
    }
  }
  return errors;
}
