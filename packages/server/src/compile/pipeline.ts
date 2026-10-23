/**
 * THE MODULE-TREE COMPILE — the assembly's own compile phase, between "the tree is
 * assembled" (platform.ts platformDef) and "the kernel boots it" (bootModules):
 *
 *   m0 = the assembled tree; for each plugin pass:
 *     if (!satisfyDeps(pass, m))       skip the pass, reason recorded;
 *     m = rewrite(ctx, pass, m_prev);  the pipeline hands a fresh copy; the pass
 *                                      returns a NEW tree and never mutates its input;
 *     if (fatal)                       m = m_prev, error recorded — one pass cannot
 *                                      take the boot down;
 *   verify(m_final)                    the kernel's own checkTree, before any create:
 *                                      the first problem leads the report, all are listed;
 *   debug()                           the trace this returns — every pass applied,
 *                                      skipped or failed, with its reason.
 *
 * What this buys over a runtime hook (trial-1's wrapApi): a plugin's instrument is DATA
 * applied in a declared order, with declared dependencies checked against the current
 * tree, per-plugin failure isolation, one trace to read, and a whole-tree type check
 * before anything runs — the kernel itself stays untouched, with no seam to keep honest.
 */
import type { ModuleDef, Problem, TableLike } from "@prismshadow/penguin-core/kernel";
import { checkTree, describeProblem, ModuleBootError } from "@prismshadow/penguin-core/kernel";
import { copyTree, manifestTreeOf, providedIfaceNames } from "./tree.js";

/** What a pass may read besides the tree: the interface table (the tree's type layer)
 * and one bag the passes of a compile share, keyed by name. */
export interface RewriteCtx {
  ifaces: TableLike;
  shared: Map<string, unknown>;
}

/** One plugin's compile-time half: a name, declared dependencies, a pure rewrite. */
export interface TreePass {
  name: string;
  /** Interface names the CURRENT tree must provide somewhere, or the pass is skipped. */
  requires?: readonly string[];
  /** m[n] = rewrite(ctx, this, m[n-1]): returns a new tree; mutating the input is a bug. */
  rewrite(tree: ModuleDef, ctx: RewriteCtx): ModuleDef | Promise<ModuleDef>;
}

export type PassState = "applied" | "skipped" | "failed";

export interface PassTrace {
  name: string;
  state: PassState;
  ms: number;
  why?: string;
}

export interface CompileResult {
  tree: ModuleDef;
  /** debug(): one line per pass, in order — what a boot actually compiled. */
  trace: PassTrace[];
}

/**
 * Runs the passes over the assembled tree and the final verify. Nothing here executes
 * module code; a pass that throws, or returns no tree, is skipped with the reason kept.
 * The final check is the same checkTree the kernel's boot runs — a tree the compile
 * accepts is a tree the boot accepts; the report leads with the first problem.
 */
export async function compileModuleTree(
  root: ModuleDef,
  passes: readonly TreePass[],
  opts: { ifaces: TableLike },
): Promise<CompileResult> {
  const ctx: RewriteCtx = { ifaces: opts.ifaces, shared: new Map() };
  let m = root;
  const trace: PassTrace[] = [];
  for (const pass of passes) {
    const start = performance.now();
    const have = providedIfaceNames(m, opts.ifaces);
    const missing = (pass.requires ?? []).filter((name) => !have.has(name));
    if (missing.length > 0) {
      trace.push({
        name: pass.name,
        state: "skipped",
        ms: 0,
        why: `requires [${missing.join(", ")}], not provided by this tree`,
      });
      continue;
    }
    try {
      const next = await pass.rewrite(copyTree(m), ctx);
      if (next === null || typeof next !== "object" || typeof next.manifest !== "object") {
        throw new Error(`pass '${pass.name}' returned no tree`);
      }
      m = next;
      trace.push({ name: pass.name, state: "applied", ms: performance.now() - start });
    } catch (err) {
      trace.push({
        name: pass.name,
        state: "failed",
        ms: performance.now() - start,
        why: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const { problems } = checkTree(manifestTreeOf(m), opts.ifaces);
  if (problems.length > 0) {
    const report = problems.map((p: Problem) => `  - ${describeProblem(p)}`).join("\n");
    throw new ModuleBootError(
      `module tree rejected at compile (first: ${describeProblem(problems[0]!)}):\n${report}`,
      problems,
    );
  }
  return { tree: m, trace };
}

/** The compile's one-line log form: every pass with its outcome, in order. */
export function describeCompile(trace: readonly PassTrace[]): string {
  if (trace.length === 0) return "no passes";
  return trace
    .map((t) => {
      const tail =
        t.state === "applied" ? ` ${t.ms.toFixed(1)}ms` : t.why === undefined ? "" : ` (${t.why})`;
      return `${t.name}: ${t.state}${tail}`;
    })
    .join("; ");
}
