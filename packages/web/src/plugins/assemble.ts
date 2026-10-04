/**
 * Plugin web modules joining the app's module tree. GET /api/contributions forwards, per enabled
 * plugin, the modules its build placed on the web side (`webModules`: manifests, the plugin's own
 * interface entries, the URLs of the built files and stylesheets); this file turns them into
 * module definitions the composition root boots beside its own (web-root.ts):
 *
 * 1. each package's stylesheets are attached and its module files imported (an ES module whose
 *    default export is the module class, decorated through the app's own kernel — shared.ts);
 *    each class is paired with the manifest it was forwarded with, as the server pairs a plugin's
 *    classes with its table;
 * 2. the packages are admitted one at a time: the tree of the app's modules, the plugins admitted
 *    so far and this one is checked (the kernel's full check: wiring, slots, every contribution's
 *    data against its slot's type), and a package with a problem is left out with it;
 * 3. the root boots the admitted ones; should that boot still fail, the app boots without any.
 *
 * A package left out is recorded with why (`pluginModuleFailures`, read by the Plugins page) and
 * logged; the app boots without it. Safe mode never gets here — the entry asks for nothing.
 *
 * Code halves may be lazy (a `React.lazy` component bound in `@Bind`): the module file is small
 * and loads at boot, the component's chunk when a slot first draws it, inside the slot owner's
 * Suspense boundary.
 */
import {
  checkTree,
  describeProblem,
  moduleDefOf,
  parseManifest,
} from "@prismshadow/penguin-core/kernel";
import type {
  IfaceTable,
  ManifestNode,
  ManifestTable,
  ModuleClass,
  ModuleDef,
} from "@prismshadow/penguin-core/kernel";
import type { WebModulePackage } from "@prismshadow/penguin-server/api";
import { shareHostModules } from "./shared";

/** One package's modules, paired with their code, and the interface entries its table carries. */
export interface PluginModules {
  package: string;
  defs: ModuleDef[];
  ifaces: IfaceTable;
}

export type ImportModule = (url: string) => Promise<unknown>;

const importModule: ImportModule = (url) => import(/* @vite-ignore */ url);

/** Packages left out of this page's tree, by name → why. */
const failures = new Map<string, string>();

/** Why a plugin's web modules were left out of this page's tree, by package name. */
export function pluginModuleFailures(): ReadonlyMap<string, string> {
  return failures;
}

function leaveOut(pkg: string, reason: string): void {
  failures.set(pkg, reason);
  console.warn(`[plugins] web modules of ${pkg} left out: ${reason}`);
}

/** Attaches the stylesheets; resolves once each has loaded or failed (unstyled is not fatal). */
function attachStyles(pkg: string, urls: readonly string[]): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  return Promise.all(
    urls.map(
      (href) =>
        new Promise<void>((resolve) => {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = href;
          link.dataset.plugin = pkg;
          link.onload = link.onerror = () => resolve();
          document.head.appendChild(link);
        }),
    ),
  ).then(() => undefined);
}

/** Imports a package's module files and pairs each class with its forwarded manifest. */
export async function loadPackage(
  pkg: WebModulePackage,
  load: ImportModule = importModule,
): Promise<PluginModules> {
  const manifests: Record<string, ManifestTable[string]> = {};
  for (const { manifest } of pkg.modules) {
    const parsed = parseManifest(manifest, `${pkg.package}#modules`);
    manifests[parsed.name] = parsed;
  }
  const [defs] = await Promise.all([
    Promise.all(
      pkg.modules.map(async ({ manifest, url }) => {
        const name = (manifest as { name: string }).name;
        const cls = ((await load(url)) as { default?: unknown }).default;
        if (typeof cls !== "function") {
          throw new Error(`${name}: ${url} has no module class as its default export`);
        }
        const def = moduleDefOf(cls as ModuleClass, { manifests });
        if (def.manifest.name !== name) {
          throw new Error(`${url} exports the module '${def.manifest.name}', not '${name}'`);
        }
        return def;
      }),
    ),
    attachStyles(pkg.package, pkg.styles),
  ]);
  return {
    package: pkg.package,
    defs,
    ifaces: pkg.ifaces as unknown as IfaceTable,
  };
}

/** The table a tree with these plugins is checked over: the app's, plus each plugin's own entries (the app's win). */
export function mergedTable(host: IfaceTable, plugins: readonly PluginModules[]): IfaceTable {
  const ifaces = { ...host.ifaces };
  const types = { ...host.types };
  for (const p of plugins) {
    for (const [k, v] of Object.entries(p.ifaces.ifaces ?? {})) ifaces[k] ??= v;
    for (const [k, v] of Object.entries(p.ifaces.types ?? {})) types[k] ??= v;
  }
  return { ifaces, types };
}

const treeOf = (def: ModuleDef): ManifestNode => ({
  manifest: def.manifest,
  children: (def.children ?? []).map(treeOf),
});

/**
 * The packages that fit, admitted in order: each is checked in the tree of the app's modules
 * and the ones admitted before it, so a clash between two plugins leaves out the later one.
 */
export function admit(
  rootWith: (extra: ModuleDef[]) => ModuleDef,
  host: IfaceTable,
  candidates: readonly PluginModules[],
): PluginModules[] {
  const admitted: PluginModules[] = [];
  for (const p of candidates) {
    const trial = [...admitted, p];
    const { problems } = checkTree(
      treeOf(rootWith(trial.flatMap((t) => t.defs))),
      mergedTable(host, trial),
    );
    if (problems.length === 0) admitted.push(p);
    else leaveOut(p.package, problems.map(describeProblem).join("; "));
  }
  return admitted;
}

/** The forwarded packages loaded and admitted; what failed to load or to fit is left out. */
export async function assemblePlugins(
  packages: readonly WebModulePackage[],
  rootWith: (extra: ModuleDef[]) => ModuleDef,
  host: IfaceTable,
  load: ImportModule = importModule,
): Promise<PluginModules[]> {
  if (packages.length === 0) return [];
  shareHostModules();
  const loaded = await Promise.all(
    packages.map((pkg) =>
      loadPackage(pkg, load).catch((err: unknown) => {
        leaveOut(pkg.package, err instanceof Error ? err.message : String(err));
        return null;
      }),
    ),
  );
  return admit(
    rootWith,
    host,
    loaded.filter((p): p is PluginModules => p !== null),
  );
}

/** Records every admitted package as left out after the tree with them failed to boot. */
export function leaveOutAll(plugins: readonly PluginModules[], err: unknown): void {
  const reason = `the app's module tree did not boot with it: ${err instanceof Error ? err.message : String(err)}`;
  for (const p of plugins) leaveOut(p.package, reason);
}
