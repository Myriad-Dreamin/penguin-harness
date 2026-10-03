/**
 * Where a probe is recorded, as a GitHub permalink (PRFC-0008): the performance panel links a
 * probe's name to the line that records it.
 *
 * Two tables, because two builds: the server's probes come with the telemetry read
 * (`TelemetryResponse.sites`, stamped into the platform bundle), the browser's `web.*` probes
 * from this page's own bundle — after a hot push of the web alone the two are different
 * commits, and each line is only right at the commit it was read at. Both are inlined by the
 * bundlers from scripts/probe-sites.mjs; an unbundled run (vitest) has no page table.
 */
import type { ProbeSites } from "@prismshadow/penguin-server/api";

declare const __PENGUIN_PROBE_SITES__: string | undefined;

/** This page's own table, for the `web.*` probes; null when the bundle carries none. */
export function pageProbeSites(): ProbeSites | null {
  try {
    return typeof __PENGUIN_PROBE_SITES__ === "string"
      ? (JSON.parse(__PENGUIN_PROBE_SITES__) as ProbeSites)
      : null;
  } catch {
    return null;
  }
}

/** A probe's link: the permalink, the `path:line` it names, and whether the build was dirty. */
export interface ProbeLink {
  href: string;
  site: string;
  dirty: boolean;
}

/**
 * The link for `probe` in `table`, or null when it names no site for it. A name recorded per
 * segment matches its family's `prefix.*` entry (`turn.wait` → `turn.*`).
 */
export function probeLink(probe: string, table: ProbeSites | null): ProbeLink | null {
  if (table === null) return null;
  const dot = probe.lastIndexOf(".");
  const site =
    table.sites[probe] ?? (dot > 0 ? table.sites[`${probe.slice(0, dot)}.*`] : undefined);
  if (site === undefined) return null;
  const at = site.lastIndexOf(":");
  return {
    href: `${table.repo}/blob/${table.commit}/${site.slice(0, at)}#L${site.slice(at + 1)}`,
    site,
    dirty: table.dirty,
  };
}
