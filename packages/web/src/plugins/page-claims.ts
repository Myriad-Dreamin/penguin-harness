/**
 * What a plugin's page may not state. Where a page sits in the nav, whether it is refused to
 * non-admins and whether it is offered yet are the app's decisions (shell/page-table.ts
 * `PagePlacement`): the shell places a plugin's page after the app's own, offered — the plugin
 * being enabled is what offers it — and open to every role. The slot's data type carries these
 * fields for the app's own pages, so the kernel's shape check accepts them from anyone; this is the
 * check that a plugin's module states none of them, run on every forwarded package before it is
 * verified (assemble.ts), so a plugin that does is left out with this reason rather than having a
 * field it wrote silently ignored.
 */
import { PLACEMENT_FIELDS } from "../shell/page-table";

/** The slot a page is contributed to, as a manifest's `contributes` names it. */
const PAGES_SLOT = "ShellModule.pages";

/**
 * Why a package's manifests cannot be taken: the first page contribution that states a
 * placement field; null when none does.
 */
export function pageClaimOf(
  manifests: ReadonlyArray<{ name: string; contributes?: Readonly<Record<string, unknown>> }>,
): string | null {
  for (const m of manifests) {
    const pages = m.contributes?.[PAGES_SLOT];
    if (!Array.isArray(pages)) continue;
    for (const entry of pages as ReadonlyArray<Record<string, unknown>>) {
      const claimed = PLACEMENT_FIELDS.filter((f) => entry !== null && f in entry);
      if (claimed.length > 0) {
        return (
          `module '${m.name}': page '${String(entry.id)}' states ${claimed.map((f) => `'${f}'`).join(", ")}, ` +
          `which the app decides for a plugin's page (its place, its admin gate and whether it is offered)`
        );
      }
    }
  }
  return null;
}
