/**
 * The dependencies a plugin's web module shares with the web app instead of bundling: one React
 * (hooks only work against the renderer's own copy), one kernel (the module tree reads what the
 * decorators recorded), one UI package (its contexts — theme, strings, Escape layers — are the
 * app's). The web app puts its own instances on `globalThis[SHARED_GLOBAL]` before it loads any
 * plugin module (packages/web/src/plugins/shared.ts — the two lists must agree, which its test
 * checks), and the plugin build resolves each specifier to a stub that hands out the host's
 * object.
 *
 * The UI package is shared as an explicit surface (packages/web/src/plugins/ui-surface.ts): its
 * stub is an ES module with one named export per name listed there, so a plugin importing a name
 * the app does not share fails its build ("No matching export"). The other stubs are CommonJS —
 * esbuild reads named imports off them by property — because React's and the kernel runtime's
 * exports are theirs whole.
 *
 * The kernel shared is its arktype-free runtime entry, the one the page boots through (one
 * decorator state; a plugin module never pulls arktype onto the page). `@prismshadow/penguin-core/plugin`
 * is the decorators' public path for plugins; on the web side it is served by that entry, which
 * exports the same decorators. The full kernel (`@prismshadow/penguin-core/kernel`) is not
 * shared: what a web module may need of the kernel at run time is in the runtime entry, and
 * checking belongs to the page's verification, not to a plugin.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const SHARED_GLOBAL = "__penguinShared";

/** The file listing the UI package's plugin surface (one `export { … } from` statement). */
export const UI_SURFACE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../packages/web/src/plugins/ui-surface.ts",
);
const UI_SPECIFIER = "@prismshadow/penguin-ui";

/** The value names a surface file re-exports from the UI package, sorted. */
export function uiSurfaceNames(file = UI_SURFACE) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest);
  const names = [];
  for (const st of sf.statements) {
    if (
      !ts.isExportDeclaration(st) ||
      st.isTypeOnly ||
      st.moduleSpecifier?.text !== UI_SPECIFIER ||
      st.exportClause === undefined ||
      !ts.isNamedExports(st.exportClause)
    )
      continue;
    for (const el of st.exportClause.elements) if (!el.isTypeOnly) names.push(el.name.text);
  }
  if (names.length === 0) throw new Error(`${file}: no names re-exported from ${UI_SPECIFIER}`);
  return names.sort();
}

/** Specifier a plugin writes → the key the host registers the instance under. */
export const SHARED = {
  react: "react",
  "react/jsx-runtime": "react/jsx-runtime",
  "@prismshadow/penguin-core/kernel/runtime": "@prismshadow/penguin-core/kernel/runtime",
  "@prismshadow/penguin-core/plugin": "@prismshadow/penguin-core/kernel/runtime",
  "@prismshadow/penguin-ui": "@prismshadow/penguin-ui",
};

/** Packages of which no copy may enter a web module: anything of theirs not in SHARED is refused. */
const SHARED_PACKAGES = /^(react|react-dom|scheduler|@prismshadow\/penguin-[a-z-]+)(\/|$)/;

/** The stub's preamble: the host's instance under `key`, or a throw naming it. */
const hostInstance = (key) =>
  `var m = (globalThis[${JSON.stringify(SHARED_GLOBAL)}] || {})[${JSON.stringify(key)}];
if (m === undefined) throw new Error(${JSON.stringify(`${key} is not shared by this page: a plugin web module runs inside the PenguinHarness web app`)});
`;

/** The esbuild plugin that resolves the shared specifiers to the host's instances. */
export function sharedPlugin({ uiNames = uiSurfaceNames() } = {}) {
  return {
    name: "penguin-shared",
    setup(build) {
      build.onResolve({ filter: SHARED_PACKAGES }, (args) => {
        const key = SHARED[args.path];
        if (key === undefined) {
          return {
            errors: [
              {
                text: `'${args.path}' is not shared with plugin web modules (shared: ${Object.keys(SHARED).join(", ")}) — bundling a copy of it is refused`,
              },
            ],
          };
        }
        return { path: key, namespace: "penguin-shared" };
      });
      build.onLoad({ filter: /.*/, namespace: "penguin-shared" }, (args) => ({
        contents:
          args.path === UI_SPECIFIER
            ? `${hostInstance(args.path)}export const { ${uiNames.join(", ")} } = m;\n`
            : `${hostInstance(args.path)}module.exports = m;\n`,
        loader: "js",
      }));
    },
  };
}

/**
 * Inputs of a web build that are a copy of a shared package — empty when the stubs above did
 * their job. A belt to their braces: a path that reached a shared package some other way (a
 * relative import into node_modules) is still caught.
 */
export function foreignCopies(inputs) {
  return inputs
    .filter((p) =>
      /(^|\/)node_modules\/(react|react-dom|scheduler|@prismshadow\/penguin-[a-z-]+)\//.test(
        p.split("\\").join("/"),
      ),
    )
    .map((p) => `a second copy of a shared package entered the web build: ${p}`);
}
