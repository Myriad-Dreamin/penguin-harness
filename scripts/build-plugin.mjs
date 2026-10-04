#!/usr/bin/env node
/**
 * build-plugin: one plugin package's build after gen-ifaces, one file per side — run from the
 * package directory (`node ../../scripts/build-plugin.mjs`).
 *
 * The author writes one entry (`src/index.ts`, `export default { modules: [...] }`); gen-ifaces
 * has written each module's `side`, `source` and (web) `file` into `ifaces.json`
 * (lib/plugin-sides.mjs). From that:
 *
 * - `dist/index.js`, the package's main entry, for Node: a generated entry whose default export
 *   lists the PLATFORM modules (and the replacements) only, so the server never imports browser
 *   code. A package with no platform module still has one, listing none.
 * - `dist/web/<Module>.js` per web module, for the browser: an ES module whose default export is
 *   the module class, with code split into `chunk-*.js` beside it (a lazy component in a `@Bind`
 *   is fetched when first drawn). The shared dependencies are the HOST's instances
 *   (lib/web-shared.mjs); a second copy of any of them in the output fails the build, as does a
 *   Node builtin.
 * - `dist/web/styles.css`, when the package has `src/styles.css`: compiled by Tailwind over the
 *   package's sources (utilities only — see the example's styles.css); the server lists it
 *   beside the modules and the web app attaches it before the modules load.
 *
 * Either side importing a module of the other side fails the build.
 */
import { execFileSync } from "node:child_process";
import { builtinModules } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { WEB_DIR } from "./lib/plugin-sides.mjs";
import { sharedPlugin, foreignCopies } from "./lib/web-shared.mjs";

/**
 * Builds the package in `dir` (default: the working directory). Throws with every problem found;
 * the CLI below prints it.
 */
export async function buildPlugin(dir = process.cwd(), { minify = true } = {}) {
  const table = JSON.parse(fs.readFileSync(path.join(dir, "ifaces.json"), "utf8"));
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const modules = Object.values(table.modules ?? {});
  const decl = table.plugin ?? { modules: [], replaces: [] };
  const web = modules.filter((m) => m.side === "web");
  const server = modules.filter((m) => m.side !== "web");
  const abs = (m) => path.resolve(dir, m.source);
  const webSources = new Set(web.map(abs));
  const serverSources = new Set(server.map(abs));

  fs.rmSync(path.join(dir, "dist"), { recursive: true, force: true });
  const problems = [];

  // ── the platform side: a generated main entry naming the platform modules only ──
  const listed = (names) => names.filter((n) => table.modules[n]?.side !== "web");
  const imports = [...new Set([...listed(decl.modules), ...listed(decl.replaces)])].map(
    (n) => `import { ${n} } from ${JSON.stringify(abs(table.modules[n]))};`,
  );
  const serverEntry = `${imports.join("\n")}
export default { modules: [${listed(decl.modules).join(", ")}], replaces: [${listed(decl.replaces).join(", ")}] };
`;
  const serverOut = await esbuild.build({
    stdin: { contents: serverEntry, resolveDir: dir, loader: "js", sourcefile: "index.js" },
    outfile: path.join(dir, "dist", "index.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    // What tsup leaves external: the package's own runtime dependencies.
    external: [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})],
    metafile: true,
    logLevel: "silent",
  });
  for (const input of Object.keys(serverOut.metafile.inputs)) {
    if (webSources.has(path.resolve(dir, input)))
      problems.push(`the platform side imports the web module file ${input}`);
  }

  // ── the web side: one ES module per web module, the shared dependencies the host's ──
  if (web.length > 0) {
    const entry = (name) => `penguin-module:${name}`;
    const webOut = await esbuild.build({
      entryPoints: Object.fromEntries(web.map((m) => [m.name, entry(m.name)])),
      outdir: path.join(dir, WEB_DIR),
      bundle: true,
      splitting: true,
      platform: "browser",
      format: "esm",
      target: "es2022",
      jsx: "automatic",
      chunkNames: "chunk-[hash]",
      minify,
      metafile: true,
      logLevel: "silent",
      plugins: [
        {
          name: "penguin-module-entry",
          setup(build) {
            build.onResolve({ filter: /^penguin-module:/ }, (args) => ({
              path: args.path.slice("penguin-module:".length),
              namespace: "penguin-module",
            }));
            build.onLoad({ filter: /.*/, namespace: "penguin-module" }, (args) => ({
              contents: `export { ${args.path} as default } from ${JSON.stringify(abs(table.modules[args.path]))};`,
              resolveDir: dir,
              loader: "js",
            }));
          },
        },
        {
          name: "penguin-no-node-builtins",
          setup(build) {
            const builtins = new Set(builtinModules);
            build.onResolve({ filter: /^[^./]/ }, (args) => {
              const bare = args.path.replace(/^node:/, "").split("/")[0];
              if (args.path.startsWith("node:") || builtins.has(bare))
                return {
                  errors: [{ text: `a web module cannot import the Node builtin '${args.path}'` }],
                };
              return undefined;
            });
          },
        },
        sharedPlugin(),
      ],
    });
    for (const input of Object.keys(webOut.metafile.inputs)) {
      if (serverSources.has(path.resolve(dir, input)))
        problems.push(`a web module imports the platform module file ${input}`);
    }
    problems.push(...foreignCopies(Object.keys(webOut.metafile.inputs)));
  }

  // ── the web side's stylesheet ──
  const css = path.join(dir, "src", "styles.css");
  if (web.length > 0 && fs.existsSync(css)) {
    execFileSync(
      path.join(dir, "node_modules", ".bin", "tailwindcss"),
      ["-i", css, "-o", path.join(dir, WEB_DIR, "styles.css"), ...(minify ? ["--minify"] : [])],
      { cwd: dir, stdio: ["ignore", "ignore", "inherit"] },
    );
  }
  if (problems.length > 0) throw new Error(problems.join("\n"));
  return { web: web.map((m) => m.name), server: listed(decl.modules) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildPlugin().then(
    ({ web, server }) =>
      console.log(`build-plugin: platform [${server.join(", ")}], web [${web.join(", ")}] → dist/`),
    (err) => {
      // esbuild's own failures carry their messages in `errors`.
      const lines = err?.errors?.map((e) => e.text) ?? [err?.message ?? String(err)];
      for (const line of lines) console.error(`build-plugin: error: ${line}`);
      process.exit(1);
    },
  );
}
