/**
 * A probe's description (PRFC-0008): the performance panel links a probe's name to its section
 * of the probe reference (`packages/server/src/telemetry/probes.<lang>.md`) on GitHub, at the
 * commit the probe's code was built from, and shows the section's one-sentence summary behind
 * a "?". The reference links on to the line that records the probe, relative to itself, so that
 * link opens the same commit and its line number holds.
 *
 * Two location tables, because two builds: the server's probes come with the telemetry read
 * (`TelemetryResponse.sites`, stamped into the platform bundle), the browser's `web.*` probes
 * from this page's own bundle — after a hot push of the web alone the two are different
 * commits. The summaries ride in this page's bundle. Both are inlined by the bundlers
 * (scripts/probe-sites.mjs, scripts/gen-probe-docs.mjs); an unbundled run (vitest) has neither.
 */
import type { ProbeSites } from "@prismshadow/penguin-server/api";

declare const __PENGUIN_PROBE_SITES__: string | undefined;
declare const __PENGUIN_PROBE_SUMMARIES__: string | undefined;

/** Where the probe reference lives in the repository, one file per language. */
const PROBE_DOCS_DIR = "packages/server/src/telemetry";

export type ProbeDocLang = "en" | "zh";

function inlined<T>(raw: string | undefined): T | null {
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** This page's own table, for the `web.*` probes; null when the bundle carries none. */
export function pageProbeSites(): ProbeSites | null {
  return typeof __PENGUIN_PROBE_SITES__ === "string"
    ? inlined<ProbeSites>(__PENGUIN_PROBE_SITES__)
    : null;
}

/** The summaries this page carries, per language; null when the bundle carries none. */
export function pageProbeSummaries(): Record<ProbeDocLang, Record<string, string>> | null {
  return typeof __PENGUIN_PROBE_SUMMARIES__ === "string"
    ? inlined<Record<ProbeDocLang, Record<string, string>>>(__PENGUIN_PROBE_SUMMARIES__)
    : null;
}

/**
 * The entry `probe` is documented and located under: its own name, or its family's `prefix.*`
 * for a name recorded per segment (`turn.wait` → `turn.*`); null when `names` has neither.
 */
export function probeEntry(probe: string, names: Record<string, unknown>): string | null {
  if (Object.hasOwn(names, probe)) return probe;
  const dot = probe.lastIndexOf(".");
  const family = dot > 0 ? `${probe.slice(0, dot)}.*` : null;
  return family !== null && Object.hasOwn(names, family) ? family : null;
}

/** The anchor GitHub gives a heading: lower case, punctuation dropped, spaces to hyphens. */
export function githubAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** A probe's link: its section of the reference, and the `path:line` that records it. */
export interface ProbeLink {
  href: string;
  site: string;
  dirty: boolean;
}

/**
 * The link for `probe`: its section of the `lang` reference at `table`'s commit, or null when
 * the table does not locate it (no reference section can be promised at that commit then).
 */
export function probeLink(
  probe: string,
  table: ProbeSites | null,
  lang: ProbeDocLang,
): ProbeLink | null {
  if (table === null) return null;
  const entry = probeEntry(probe, table.sites);
  if (entry === null) return null;
  return {
    href: `${table.repo}/blob/${table.commit}/${PROBE_DOCS_DIR}/probes.${lang}.md#${githubAnchor(entry)}`,
    site: table.sites[entry]!,
    dirty: table.dirty,
  };
}

/** `probe`'s one-sentence summary in `lang`, or null when the page carries none for it. */
export function probeSummary(
  probe: string,
  summaries: Record<ProbeDocLang, Record<string, string>> | null,
  lang: ProbeDocLang,
): string | null {
  const own = summaries?.[lang];
  if (own === undefined) return null;
  const entry = probeEntry(probe, own);
  return entry === null ? null : own[entry]!;
}
