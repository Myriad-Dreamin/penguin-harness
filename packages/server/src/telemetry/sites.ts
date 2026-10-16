/**
 * This build's probe sites (PRFC-0008): which line records each probe, so the performance panel
 * can link a probe's name to it. The table is inlined by the bundler (scripts/probe-sites.mjs,
 * from tsup and from the hot push's own esbuild); an unbundled run — tsx, vitest — has none and
 * reads null, and the panel then shows names without links.
 */
import type { ProbeSites } from "../api/types.js";

declare const __PENGUIN_PROBE_SITES__: string | undefined;

let cached: ProbeSites | null | undefined;

/** The inlined table, parsed once; null when the bundle carries none or it does not parse. */
export function probeSites(): ProbeSites | null {
  if (cached !== undefined) return cached;
  try {
    cached =
      typeof __PENGUIN_PROBE_SITES__ === "string"
        ? (JSON.parse(__PENGUIN_PROBE_SITES__) as ProbeSites)
        : null;
  } catch {
    cached = null;
  }
  return cached;
}
