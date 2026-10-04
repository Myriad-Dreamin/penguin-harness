/**
 * Which side runs each module of a plugin package: the platform (`server`) or the web app
 * (`web`). gen-ifaces decides it at build time and writes it into the package's `ifaces.json`,
 * so neither runtime has to infer it.
 *
 * A module belongs to the tree its wiring fits. Every module it names — the owner of a slot it
 * contributes to (`<Owner>.<slot>`), the module a requirement is wired `from`, the node it
 * replaces — must be a module of one host's table (the platform's or the web app's generated
 * `ifaces.json`), another module of the same package, or a module of a plugin package it depends
 * on; the latter two lend their side. A slot it
 * contributes to must exist on the owner's provided interfaces. Naming modules of both hosts, or
 * a module neither has, is an error naming the module.
 *
 * A module that names no module at all keeps the side every plugin module had before the web
 * could take one: the platform, wired by interface alone.
 *
 * This is a build-time sort, not the tree check: each runtime still checks the tree it assembles
 * (the platform at boot, the web app before it mounts) and leaves out what does not fit.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The two host tables, generated from this checkout. A table not generated yet, or older than a
 * source file of its package (a plugin built before the host packages, as `pnpm -r` may order
 * it, or after a pull that changed a host slot), is generated here the way the host's own
 * `gen:ifaces` script does — a stale table would decide sides, and which web modules carry no
 * code, against slots that are no longer there. gen-ifaces writes atomically, so two plugin
 * builds racing to it read a whole file either way.
 */
export function hostTables(pkgDir = process.cwd()) {
  const out = { plugins: dependencyModules(pkgDir) };
  for (const side of ["server", "web"]) {
    const dir = path.join(ROOT, "packages", side);
    const file = path.join(dir, "src", "ifaces.json");
    if (!fs.existsSync(file) || newestSource(path.join(dir, "src")) > fs.statSync(file).mtimeMs) {
      execFileSync(
        process.execPath,
        [
          path.join(ROOT, "scripts", "gen-ifaces.mjs"),
          "--project",
          "tsconfig.json",
          "--out",
          "src/ifaces.json",
        ],
        { cwd: dir, stdio: ["ignore", "ignore", "inherit"] },
      );
    }
    out[side] = JSON.parse(fs.readFileSync(file, "utf8"));
  }
  return out;
}

/** The latest mtime of the TypeScript sources under `dir`. */
function newestSource(dir) {
  let newest = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || !/\.tsx?$/.test(e.name)) continue;
    newest = Math.max(newest, fs.statSync(path.join(e.parentPath, e.name)).mtimeMs);
  }
  return newest;
}

/**
 * The modules of the plugin packages `pkgDir` depends on (any dependency field), by name → the
 * side their generated table records (the platform when it records none). Read from the
 * dependency's installed copy, which its own build has already written (pnpm builds a workspace
 * dependency first).
 */
function dependencyModules(pkgDir) {
  const out = {};
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  } catch {
    return out;
  }
  const names = Object.keys({
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  });
  for (const name of names) {
    let table;
    try {
      table = JSON.parse(
        fs.readFileSync(
          path.join(pkgDir, "node_modules", ...name.split("/"), "ifaces.json"),
          "utf8",
        ),
      );
    } catch {
      continue;
    }
    if (table.plugin === undefined) continue;
    for (const [mod, m] of Object.entries(table.modules ?? {})) out[mod] = m.side ?? "server";
  }
  return out;
}

/**
 * What gen-ifaces writes for a plugin package: every module's `side`, a web module's built
 * `file`, and each module's `source` (what the plugin build takes as the module's entry).
 * A web module with no code (codeless below) gets no `file`: nothing of it is built, and the web
 * app assembles it from its manifest alone. `bodyless` names the module classes declared with an
 * empty body. Mutates `manifests`; returns the errors.
 */
export function assignSides(
  manifests,
  sources,
  pluginDecl,
  hosts = hostTables(),
  bodyless = new Set(),
) {
  const { sides, errors } = decideSides(manifests, hosts, pluginDecl?.replaces ?? []);
  const own = Object.fromEntries(
    Object.keys(manifests)
      .filter((n) => sources.has(n))
      .map((n) => [n, sources.get(n)]),
  );
  errors.push(...mixedFiles(own, sides));
  for (const [name, m] of Object.entries(manifests)) {
    m.side = sides[name];
    if (own[name] !== undefined) m.source = own[name];
    if (sides[name] === "web" && !codeless(m, hosts.web, bodyless)) m.file = webFileOf(name);
  }
  return errors;
}

/**
 * Whether a web module is data and nothing else, so the web app need not import any file of it:
 * its class has an empty body (no field, no `setup`), it requires, provides and holds nothing,
 * and every slot it contributes to is one of the web app's with no code half. Such a module's
 * whole effect is its manifest (example-no-evaluation-center's page removal).
 *
 * @param {{ name: string, requires?: object, provides?: object, children?: unknown[], contributes?: object }} m
 * @param {{ modules?: object, ifaces?: object }} web the web app's table
 * @param {ReadonlySet<string>} bodyless
 */
export function codeless(m, web, bodyless) {
  if (!bodyless.has(m.name)) return false;
  const empty = (o) => o === undefined || Object.keys(o).length === 0;
  if (!empty(m.requires) || !empty(m.provides) || (m.children ?? []).length > 0) return false;
  return Object.keys(m.contributes ?? {}).every((key) => {
    const split = splitSlotKey(key);
    if (split === null) return false;
    const provides = web.modules?.[split.module]?.provides ?? {};
    const decl = Object.values(provides)
      .map((k) => web.ifaces?.[k]?.slots?.[split.slot])
      .find((d) => d !== undefined);
    return decl !== undefined && decl.code === undefined;
  });
}

/** `<module>.<slot>` → its halves; null when malformed. Same rule as core kernel/manifest.ts. */
function splitSlotKey(key) {
  const at = key.lastIndexOf(".");
  if (at <= 0 || at === key.length - 1) return null;
  return { module: key.slice(0, at), slot: key.slice(at + 1) };
}

const HOST_LABEL = { server: "the platform", web: "the web app" };

/** Whether `slot` is declared on one of the interfaces the host module `owner` provides. */
function hasSlot(host, owner, slot) {
  const provides = host.modules?.[owner]?.provides ?? {};
  return Object.values(provides).some((key) => host.ifaces?.[key]?.slots?.[slot] !== undefined);
}

/**
 * @param {Record<string, { name: string, requires?: object, contributes?: object }>} manifests
 *   the package's own manifests, by module name
 * @param {{ server: { modules?: object, ifaces?: object }, web: { modules?: object, ifaces?: object } }} hosts
 *   the two host tables (`ifaces` here is the table's `ifaces` map)
 * @param {readonly string[]} [replaces] module names the package's default export replaces
 * @returns {{ sides: Record<string, "server" | "web">, errors: string[] }}
 */
export function decideSides(manifests, hosts, replaces = []) {
  const errors = [];
  /** module → what it names: { host side, why } or { local module name }. */
  const named = new Map();
  for (const m of Object.values(manifests)) {
    const refs = [];
    const refer = (name, why, slot, iface) => {
      if (name in manifests && name !== m.name) {
        refs.push({ local: name, why });
        return;
      }
      const found = ["server", "web"].filter((s) => hosts[s].modules?.[name] !== undefined);
      // A module of a plugin this package depends on (company-roadmaps wires to
      // company-proposals) lends the side its own table records.
      const dependency = hosts.plugins?.[name];
      if (found.length === 0 && dependency !== undefined) {
        refs.push({ side: dependency, why });
        return;
      }
      if (found.length === 0) {
        errors.push(
          `${m.name}: ${why} names module '${name}', which neither the platform nor the web app has`,
        );
        return;
      }
      // A name both hosts carry (CompanyModule, AgentsModule, …) is decided by the slot, or by
      // the interface it is required as; failing both, the platform, where every plugin module
      // ran before the web could take one.
      const side =
        found.length === 1
          ? found[0]
          : (found.find((s) =>
              slot !== undefined
                ? hasSlot(hosts[s], name, slot)
                : Object.values(hosts[s].modules[name].provides ?? {}).includes(iface),
            ) ?? (slot === undefined ? "server" : undefined));
      if (side === undefined) {
        errors.push(
          `${m.name}: ${why}: neither host's module '${name}' has a slot '${slot}' (no-such-slot)`,
        );
        return;
      }
      if (slot !== undefined && !hasSlot(hosts[side], name, slot)) {
        errors.push(
          `${m.name}: ${why}: ${HOST_LABEL[side]}'s module '${name}' has no slot '${slot}' (no-such-slot)`,
        );
        return;
      }
      refs.push({ side, why });
    };
    for (const key of Object.keys(m.contributes ?? {})) {
      const split = splitSlotKey(key);
      if (split === null) {
        errors.push(`${m.name}: contribution key '${key}' is not <module>.<slot>`);
        continue;
      }
      refer(split.module, `its contribution to '${key}'`, split.slot);
    }
    for (const [alias, req] of Object.entries(m.requires ?? {})) {
      if (req.from !== undefined)
        refer(req.from, `its requirement '${alias}'`, undefined, req.iface);
    }
    if (replaces.includes(m.name)) refer(m.name, "its replacement");
    named.set(m.name, refs);
  }
  // Local references lend the side of the module they name: settle until nothing changes.
  const sides = {};
  for (let changed = true; changed;) {
    changed = false;
    for (const [name, refs] of named) {
      if (sides[name] !== undefined) continue;
      const pending = refs.some((r) => r.local !== undefined && sides[r.local] === undefined);
      if (pending) continue;
      const found = new Set(refs.map((r) => r.side ?? sides[r.local]));
      if (found.size > 1) {
        const by = (s) =>
          refs
            .filter((r) => (r.side ?? sides[r.local]) === s)
            .map((r) => r.why)
            .join(", ");
        errors.push(
          `${name}: wired to both sides — to the platform by ${by("server")}, to the web app by ${by("web")}; split it into one module per side`,
        );
        sides[name] = "server";
      } else {
        sides[name] = found.size === 0 ? "server" : [...found][0];
      }
      changed = true;
    }
  }
  for (const name of named.keys()) {
    if (sides[name] === undefined) {
      errors.push(`${name}: its side depends on a cycle of the package's own modules`);
      sides[name] = "server";
    }
  }
  return { sides, errors };
}

/**
 * The built file of a web module, relative to its package: one file per module, named by the
 * module. The plugin build writes exactly this path (scripts/build-plugin.mjs).
 */
export const WEB_DIR = "dist/web";
export function webFileOf(moduleName) {
  return `${WEB_DIR}/${moduleName}.js`;
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
