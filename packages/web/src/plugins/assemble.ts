/**
 * Plugin web modules joining the app's module tree. GET /api/contributions forwards, per enabled
 * plugin, the modules its build placed on the web side (`webModules`: manifests, the plugin's own
 * interface entries, the URLs of the built files and stylesheets); this file turns them into
 * module definitions the composition root boots beside its own (web-root.ts), through the
 * kernel's arktype-free runtime entry. Packages are taken in package-name order, so which of two
 * clashing plugins is left out never depends on the server's load order.
 *
 * 1. VERIFIED: each package's table (its interfaces and its web modules' manifests) goes through
 *    lib/verify-plugins.ts — the kernel's full check against the app's table, run once per table
 *    content and remembered, so a page whose plugins were all verified before never loads the
 *    full kernel (and arktype with it). This is where a manifest's shape, a contribution's data
 *    and a copied host interface are checked; the forwarded manifests are otherwise taken as the
 *    generated data they are.
 * 2. LOADED, each package within PLUGIN_LOAD_DEADLINE_MS: its stylesheets are attached and its
 *    module files imported (an ES module whose default export is the module class, decorated
 *    through the app's own kernel — shared.ts); each class is paired with the manifest it was
 *    forwarded with. A package that misses the deadline is left out and the boot goes on.
 *
 * The root then boots the loaded ones in ONE identity check (`bootVerified`, web-root.ts). Only
 * when that boot fails does it find the package to blame, by booting them in order and leaving
 * out each one the tree does not take. A package left out is recorded with why
 * (`pluginModuleFailures`, read by the Plugins page) and logged. Safe mode never gets here — the
 * entry asks for nothing.
 *
 * Code halves may be lazy (a `React.lazy` component bound in `@Bind`): the module file is small
 * and loads at boot, the component's chunk when a slot first draws it, inside the slot owner's
 * `<Deferred>` boundary.
 */
import { describeProblem, moduleDefOf } from "@prismshadow/penguin-core/kernel/runtime";
import type {
  IfaceTable,
  Manifest,
  ManifestTable,
  ModuleClass,
  ModuleDef,
  ModuleTable,
  Problem,
} from "@prismshadow/penguin-core/kernel/runtime";
import type { WebModulePackage } from "@prismshadow/penguin-server/api";
import { verifyPlugins } from "../lib/verify-plugins";
import { shareHostModules } from "./shared";
import type { HashedTable, PluginTable } from "../lib/verify-plugins";

/**
 * How long one package's files and stylesheets may take before the boot leaves it out. A warm
 * load takes milliseconds (the files are cached for good) and a cold one a few round trips; past
 * this the request is stalled (a proxy, a server busy rebuilding), and a page that waited on it
 * would stay blank. The packages load side by side, so this bounds the whole stage.
 */
export const PLUGIN_LOAD_DEADLINE_MS = 4000;

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
  load?: ImportModule;
  verify?: typeof verifyPlugins;
  /** Overrides PLUGIN_LOAD_DEADLINE_MS. */
  deadlineMs?: number;
}

/** Packages left out of this page's tree, by package name → why. */
const failures = new Map<string, string>();

/** Why a plugin's web modules were left out of this page's tree, by package name. */
export function pluginModuleFailures(): ReadonlyMap<string, string> {
  return failures;
}

/** Records a package as left out of this page's tree, with why; its stylesheets go with it. */
export function leaveOut(pkg: string, reason: string): void {
  failures.set(pkg, reason);
  console.warn(`[plugins] web modules of ${pkg} left out: ${reason}`);
  if (typeof document === "undefined") return;
  for (const link of document.querySelectorAll<HTMLLinkElement>("link[data-plugin]")) {
    if (link.dataset.plugin === pkg) link.remove();
  }
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Why a boot with a package failed: the check's problems when it has them, else the error. */
export function bootFailureReason(err: unknown): string {
  const problems = (err as { problems?: Problem[] } | null)?.problems;
  return problems !== undefined && problems.length > 0
    ? `it does not wire by interface key: ${problems.map(describeProblem).join("; ")}`
    : `the app's module tree did not boot with it: ${message(err)}`;
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

/**
 * Settles with `work`, or rejects once `ms` have passed. `work` itself cannot be aborted (a
 * dynamic `import()` cannot be), so a late settlement is swallowed here: its value is dropped
 * and its rejection handled, never surfacing as an unhandled one.
 */
function withDeadline<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not load within ${ms} ms`)), ms);
  });
  work.catch(() => undefined);
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
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

/** Imports a package's module files and pairs each class with its forwarded manifest. */
async function loadModules(c: Candidate, load: ImportModule): Promise<ModuleDef[]> {
  const manifests = Object.fromEntries(c.manifests) as ManifestTable;
  return Promise.all(
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
  );
}

/**
 * The package's modules and stylesheets within the deadline.
 */
async function loadPackage(
  c: Candidate,
  load: ImportModule,
  deadlineMs: number,
): Promise<PluginModules | null> {
  const styled = attachStyles(c.pkg.package, c.pkg.styles);
  const work = Promise.all([loadModules(c, load), styled]);
  try {
    const [defs] = await withDeadline(work, deadlineMs, "its files");
    return { package: c.pkg.package, defs, ifaces: c.table };
  } catch (err) {
    leaveOut(c.pkg.package, message(err));
    return null;
  }
}

/**
 * The forwarded packages verified and loaded, in package-name order; what fails a step is left
 * out. The boot (web-root.ts) checks the rest once.
 */
export async function assemblePlugins(
  packages: readonly WebModulePackage[],
  opts: AssembleOptions,
): Promise<PluginModules[]> {
  if (packages.length === 0) return [];
  const candidates: Candidate[] = [];
  const sorted = [...packages].sort((a, b) =>
    a.package < b.package ? -1 : a.package > b.package ? 1 : 0,
  );
  for (const pkg of sorted) {
    const c = candidateOf(pkg);
    if (typeof c === "string") leaveOut(pkg.package, c);
    else candidates.push(c);
  }
  const plugins: PluginTable[] = candidates.map((c) => ({ name: c.pkg.package, table: c.table }));
  const { accepted, rejected } = await (opts.verify ?? verifyPlugins)(opts.host, plugins);
  for (const r of rejected) leaveOut(r.plugin.name, r.problems.join("; "));
  const verified = new Set(accepted.map((p) => p.name));
  const admitted = candidates.filter((c) => verified.has(c.pkg.package));
  if (admitted.length === 0) return [];
  shareHostModules();
  const load = opts.load ?? importModule;
  const deadlineMs = opts.deadlineMs ?? PLUGIN_LOAD_DEADLINE_MS;
  const loaded = await Promise.all(admitted.map((c) => loadPackage(c, load, deadlineMs)));
  return loaded.filter((p): p is PluginModules => p !== null);
}
