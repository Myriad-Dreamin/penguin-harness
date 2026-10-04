/**
 * Plugin web modules joining the app's module tree. GET /api/contributions forwards, per enabled
 * plugin, the modules its build placed on the web side (`webModules`: manifests, the plugin's own
 * interface entries, the URLs of the built files and stylesheets); this file turns them into
 * module definitions the composition root boots beside its own (web-root.ts), through the
 * kernel's arktype-free runtime entry:
 *
 * 1. VERIFIED: each package's table (its interfaces and its web modules' manifests) goes through
 *    lib/verify-plugins.ts — the kernel's full check against the app's table, run once per table
 *    content and remembered, so a page whose plugins were all verified before never loads the
 *    full kernel (and arktype with it). This is where a manifest's shape, a contribution's data
 *    and a copied host interface are checked; the forwarded manifests are otherwise taken as the
 *    generated data they are.
 * 2. ADMITTED one at a time: the runtime's own identity check (`checkExact`) over the app's tree
 *    with the packages admitted so far and this one mounted under the root — what the boot will
 *    run, so a package that verifies but would not wire by identity, or that clashes with an
 *    earlier one, is left out here with its problem rather than failing the boot.
 * 3. LOADED: the admitted packages' stylesheets are attached and their module files imported (an
 *    ES module whose default export is the module class, decorated through the app's own kernel
 *    — shared.ts); each class is paired with the manifest it was forwarded with.
 *
 * The root boots the admitted ones; should that boot still fail, the app boots without any. A
 * package left out is recorded with why (`pluginModuleFailures`, read by the Plugins page) and
 * logged. Safe mode never gets here — the entry asks for nothing.
 *
 * Code halves may be lazy (a `React.lazy` component bound in `@Bind`): the module file is small
 * and loads at boot, the component's chunk when a slot first draws it, inside the slot owner's
 * boundary.
 */
import {
  checkExact,
  describeProblem,
  manifestTrees,
  mergeTables,
  moduleDefOf,
} from "@prismshadow/penguin-core/kernel/runtime";
import type {
  IfaceTable,
  Manifest,
  ManifestNode,
  ManifestTable,
  ModuleClass,
  ModuleDef,
  ModuleTable,
} from "@prismshadow/penguin-core/kernel/runtime";
import type { WebModulePackage } from "@prismshadow/penguin-server/api";
import { verifyPlugins } from "../lib/verify-plugins";
import type { HashedTable, PluginTable } from "../lib/verify-plugins";

/** One package's modules, paired with their code, and the interface entries its table carries. */
export interface PluginModules {
  package: string;
  defs: ModuleDef[];
  ifaces: IfaceTable;
}

export type ImportModule = (url: string) => Promise<unknown>;

const importModule: ImportModule = (url) => import(/* @vite-ignore */ url);

/** What the boot hands over besides the packages: the app's table, and test seams. */
export interface AssembleOptions {
  /** The app's generated table (its `hash` names the host the verdicts are cached under). */
  host: HashedTable;
  /** The name of the app's root module, under which plugin modules are mounted. */
  root: string;
  load?: ImportModule;
  verify?: typeof verifyPlugins;
}

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

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

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

/** A forwarded package with the table verification checks: its interfaces and its manifests by name. */
interface Candidate {
  pkg: WebModulePackage;
  table: ModuleTable;
  manifests: Map<string, Manifest>;
}

/**
 * The package's table, or why it cannot be one. Each manifest is used as forwarded — generated
 * data, shape-checked by verification — once its name is a string no other module of the
 * package uses.
 */
function candidateOf(pkg: WebModulePackage): Candidate | string {
  const manifests = new Map<string, Manifest>();
  for (const { manifest } of pkg.modules) {
    const name = (manifest as { name?: unknown }).name;
    if (typeof name !== "string" || name === "") return "a forwarded manifest has no name";
    if (manifests.has(name)) return `module '${name}' is forwarded twice`;
    manifests.set(name, manifest as unknown as Manifest);
  }
  const table: ModuleTable = {
    ifaces: (pkg.ifaces.ifaces ?? {}) as IfaceTable["ifaces"],
    types: (pkg.ifaces.types ?? {}) as IfaceTable["types"],
    modules: Object.fromEntries(manifests),
  };
  return { pkg, table, manifests };
}

/** The app's tree as its table describes it, from `root` down. */
function hostTree(host: ModuleTable, root: string): ManifestNode {
  const manifests = new Map(Object.entries(host.modules as Record<string, Manifest>));
  const tree = manifestTrees(manifests, "host table").find((t) => t.manifest.name === root);
  if (tree === undefined) throw new Error(`host table: no root module '${root}'`);
  return tree;
}

/**
 * The verified candidates that pass the runtime's identity check, admitted in order: each is
 * checked in the tree of the app's modules and the ones admitted before it, so a clash between
 * two plugins leaves out the later one.
 */
function admit(host: ModuleTable, root: string, candidates: readonly Candidate[]): Candidate[] {
  const base = hostTree(host, root);
  const admitted: Candidate[] = [];
  const mounted: ManifestNode[] = [];
  for (const c of candidates) {
    let problems: string[];
    let trees: ManifestNode[] = [];
    try {
      trees = manifestTrees(c.manifests, c.pkg.package);
      const tree = { manifest: base.manifest, children: [...base.children, ...mounted, ...trees] };
      const tables = [...admitted, c].map((a) => a.table);
      problems = checkExact(tree, mergeTables(host, tables)).problems.map(describeProblem);
    } catch (err) {
      problems = [message(err)];
    }
    if (problems.length === 0) {
      admitted.push(c);
      mounted.push(...trees);
    } else {
      leaveOut(c.pkg.package, `it does not wire by interface key: ${problems.join("; ")}`);
    }
  }
  return admitted;
}

/** Imports a package's module files and pairs each class with its forwarded manifest. */
async function loadPackage(c: Candidate, load: ImportModule): Promise<PluginModules> {
  const manifests = Object.fromEntries(c.manifests) as ManifestTable;
  const [defs] = await Promise.all([
    Promise.all(
      c.pkg.modules.map(async ({ manifest, url }) => {
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
    attachStyles(c.pkg.package, c.pkg.styles),
  ]);
  return { package: c.pkg.package, defs, ifaces: c.table };
}

/** The forwarded packages verified, admitted and loaded; what fails any step is left out. */
export async function assemblePlugins(
  packages: readonly WebModulePackage[],
  opts: AssembleOptions,
): Promise<PluginModules[]> {
  if (packages.length === 0) return [];
  const candidates: Candidate[] = [];
  for (const pkg of packages) {
    const c = candidateOf(pkg);
    if (typeof c === "string") leaveOut(pkg.package, c);
    else candidates.push(c);
  }
  const plugins: PluginTable[] = candidates.map((c) => ({ name: c.pkg.package, table: c.table }));
  const { accepted, rejected } = await (opts.verify ?? verifyPlugins)(opts.host, plugins);
  for (const r of rejected) leaveOut(r.plugin.name, r.problems.join("; "));
  const verified = new Set(accepted.map((p) => p.name));
  const admitted = admit(
    opts.host,
    opts.root,
    candidates.filter((c) => verified.has(c.pkg.package)),
  );
  if (admitted.length === 0) return [];
  const { shareHostModules } = await import("./shared");
  shareHostModules();
  const load = opts.load ?? importModule;
  const loaded = await Promise.all(
    admitted.map((c) =>
      loadPackage(c, load).catch((err: unknown) => {
        leaveOut(c.pkg.package, message(err));
        return null;
      }),
    ),
  );
  return loaded.filter((p): p is PluginModules => p !== null);
}

/** Records every admitted package as left out after the tree with them failed to boot. */
export function leaveOutAll(plugins: readonly PluginModules[], err: unknown): void {
  const reason = `the app's module tree did not boot with it: ${message(err)}`;
  for (const p of plugins) leaveOut(p.package, reason);
}
