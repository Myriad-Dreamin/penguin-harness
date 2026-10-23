/**
 * THE MODULE-TREE COMPILE — the assembly's own compile phase, between "the tree is
 * assembled" (platform.ts platformDef) and "the kernel boots it" (bootModules):
 *
 *   registrations = the tree's own manifests: every `CompileModule.passes` entry, data
 *                   (PassDecl — an id, the ids it runs after). WHAT runs, and in what
 *                   order, is declared with the assembly and checked as data; the pass's
 *                   code the host resolves by id (a contribution's code half cannot
 *                   travel with it: bind hands it over inside create, which is after).
 *   order         = the registrations' `after` deps, topologically, registration order
 *                   breaking ties; a cycle is a loud error naming the path.
 *   for each pass:
 *     if (!satisfyDeps(pass, m))       skip the pass, reason kept (debug);
 *     m = rewrite(ctx, pass, m_prev);  the pipeline hands a fresh copy; the pass
 *                                      returns a NEW tree and never mutates its input;
 *     if (fatal)                       m = m_prev, error kept — one pass cannot
 *                                      take the boot down;
 *   verify(m_final)                    the kernel's own checkTree, before any create:
 *                                      the problems as a list, its first line the first;
 *   debug()                           the trace — collected only when the compile runs
 *                                      with `debug`, so the quiet path times nothing.
 *
 * What this buys over a runtime hook (trial-1's wrapApi): instrumentation is DATA
 * applied in a declared order, with declared dependencies checked against the current
 * tree, per-pass failure isolation, one trace to read, and a whole-tree type check
 * before anything runs — the kernel itself stays untouched, with no seam to keep honest.
 */
import type { IfaceClass, ModuleDef, Problem, TableLike } from "@prismshadow/penguin-core/kernel";
import { checkTree, describeProblem, ModuleBootError } from "@prismshadow/penguin-core/kernel";
import { contributionsOf, copyTree, declNameOf, manifestTreeOf, providedIfaceNames } from "./tree.js";
import { PASSES_SLOT, type PassDecl } from "./module.js";

/** What a pass may read besides the tree: the interface table (the tree's type layer)
 * and one bag the passes of a compile share, keyed by name. */
export interface RewriteCtx {
  ifaces: TableLike;
  shared: Map<string, unknown>;
}

/**
 * One plugin's compile-time half: an id (what the registration names), declared
 * dependencies, a pure rewrite. Dependencies are the interface CLASSES the pass
 * instruments — the same handles a manifest's fields are typed by — not their names:
 * the class is the type-checked reference, and the pipeline maps it to its declared
 * name when it asks the tree (compile/tree.ts declNameOf, where that edge is honest
 * about what it stands on).
 */
export interface ModulePass {
  id: string;
  /** Interfaces the CURRENT tree must provide somewhere, or the pass is skipped. */
  requires?: readonly IfaceClass[];
  /** m[n] = rewrite(ctx, this, m[n-1]): returns a new tree; mutating the input is a bug. */
  rewrite(tree: ModuleDef, ctx: RewriteCtx): ModuleDef | Promise<ModuleDef>;
}

export type PassState = "applied" | "skipped" | "failed";

/** One pass's outcome. Collected only in a debug compile; a quiet compile has none. */
export interface PassTrace {
  id: string;
  state: PassState;
  ms: number;
  why?: string;
}

export interface CompileResult {
  tree: ModuleDef;
  /** debug(): one line per pass, in order — what a boot actually compiled. */
  trace: PassTrace[];
}

export interface CompileOpts {
  ifaces: TableLike;
  /**
   * The host's answer to a registration's id: the pass's code. A registered id with no
   * resolution is a wiring gap (warned) — the registration stands, the pass does not
   * run; a plugin host answers this from what plugin bundles export.
   */
  resolve?: (id: string) => ModulePass | undefined;
  /** Collect the trace (timings, skip and failure reasons). Without it: silent, untimed. */
  debug?: boolean;
}

/**
 * Runs the registered passes over the assembled tree and the final verify. Nothing here
 * executes module code; a pass that throws, or returns no tree, is set aside with the
 * reason kept. The final check is the same checkTree the kernel's boot runs — a tree the
 * compile accepts is a tree the boot accepts; the problems stand as the list, its first
 * line the first problem.
 */
export async function compileModuleTree(
  root: ModuleDef,
  opts: CompileOpts,
): Promise<CompileResult> {
  const debug = opts.debug === true;
  const trace: PassTrace[] = [];
  /** The trace exists only in a debug compile — this is the whole gate. */
  const note = (entry: PassTrace): void => {
    if (debug) trace.push(entry);
  };
  // The registry: the tree's own registrations, first-of-an-id kept (the checker owns
  // reporting duplicates loudly; the pipeline never runs one pass twice either).
  const seen = new Set<string>();
  const runs: PassDecl[] = [];
  for (const reg of contributionsOf<PassDecl>(root, PASSES_SLOT)) {
    if (seen.has(reg.id)) {
      note({ id: reg.id, state: "skipped", ms: 0, why: "registered more than once; the first runs" });
      continue;
    }
    seen.add(reg.id);
    runs.push(reg);
  }
  const ctx: RewriteCtx = { ifaces: opts.ifaces, shared: new Map() };
  let m = root;
  // The tree's provisions, read through a memo: computed for the first pass that asks,
  // and again only after a pass actually rewrote the tree (a skipped or failed pass
  // changes nothing, so the answer stands). This is the cheap half of "N passes, how
  // many walks": the expensive half — one shared walk for many passes — is a
  // pass-shape question, taken up in the trial report.
  let provided: Set<string> | null = null;
  const provides = (): Set<string> => (provided ??= providedIfaceNames(m, opts.ifaces));
  for (const reg of orderPasses(runs)) {
    const pass = opts.resolve?.(reg.id);
    if (pass === undefined) {
      console.warn(`[compile] pass '${reg.id}' is registered but nothing resolves it`);
      note({ id: reg.id, state: "skipped", ms: 0, why: "registered, no resolver for this id" });
      continue;
    }
    const missing = (pass.requires ?? []).map(declNameOf).filter((name) => !provides().has(name));
    if (missing.length > 0) {
      note({
        id: reg.id,
        state: "skipped",
        ms: 0,
        why: `requires [${missing.join(", ")}], not provided by this tree`,
      });
      continue;
    }
    const start = debug ? performance.now() : 0;
    try {
      const next = await pass.rewrite(copyTree(m), ctx);
      if (next === null || typeof next !== "object" || typeof next.manifest !== "object") {
        throw new Error(`pass '${reg.id}' returned no tree`);
      }
      m = next;
      provided = null;
      note({ id: reg.id, state: "applied", ms: debug ? performance.now() - start : 0 });
    } catch (err) {
      // A failed pass never takes the boot down: the tree it was handed is the tree the
      // boot gets. The warn is not debug-gated — a pass that throws is a bug in a
      // plugin, worth a line even where nobody asked for the trace.
      const why = err instanceof Error ? err.message : String(err);
      console.warn(`[compile] pass '${reg.id}' failed and was set aside: ${why}`);
      note({ id: reg.id, state: "failed", ms: debug ? performance.now() - start : 0, why });
    }
  }
  const { problems } = checkTree(manifestTreeOf(m), opts.ifaces);
  if (problems.length > 0) {
    const report = problems.map((p: Problem) => `  - ${describeProblem(p)}`).join("\n");
    throw new ModuleBootError(`module tree rejected at compile:\n${report}`, problems);
  }
  return { tree: m, trace };
}

/** The registrations' `after` deps, topologically — registration order breaking ties, a cycle a loud error naming the path. */
function orderPasses(registered: readonly PassDecl[]): PassDecl[] {
  const byId = new Map(registered.map((reg) => [reg.id, reg] as const));
  const out: PassDecl[] = [];
  const done = new Set<string>();
  const visiting: string[] = [];
  const visit = (reg: PassDecl): void => {
    if (done.has(reg.id)) return;
    const at = visiting.indexOf(reg.id);
    if (at >= 0) {
      throw new ModuleBootError(
        `pass dependencies form a cycle: ${[...visiting.slice(at), reg.id].join(" -> ")}`,
      );
    }
    visiting.push(reg.id);
    // An `after` naming an id nobody registered is vacuous — "behind it, if present".
    for (const dep of reg.after ?? []) {
      const next = byId.get(dep);
      if (next !== undefined) visit(next);
    }
    visiting.pop();
    done.add(reg.id);
    out.push(reg);
  };
  for (const reg of registered) visit(reg);
  return out;
}

/** The compile's one-line log form: every pass with its outcome, in order. */
export function describeCompile(trace: readonly PassTrace[]): string {
  if (trace.length === 0) return "no passes";
  return trace
    .map((t) => {
      const tail =
        t.state === "applied" ? ` ${t.ms.toFixed(1)}ms` : t.why === undefined ? "" : ` (${t.why})`;
      return `${t.id}: ${t.state}${tail}`;
    })
    .join("; ");
}
