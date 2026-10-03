/**
 * What the dock module binds into its components (lib/module-deps.tsx): the panel table, read once
 * at boot from the `panels` contributions (iface.ts). Every surface that names a panel — the tab
 * strips, the docks' "+" menus and pickers, the floating launcher, the draft's Files toggle —
 * reads its label and mark here, so a panel never has two names or two marks.
 */
import type { Contributed } from "@prismshadow/penguin-core/kernel";
import { createDeps } from "../../lib/module-deps";
import { glyphOf } from "../../lib/nav-icons";
import type { Locale } from "../../state/locale";
import { useLocale } from "../../state/locale";
import type { DockPanel, DockPanelData } from "./iface";

/** One contributed panel, with its body and its mark resolved. */
export interface PanelEntry extends DockPanelData {
  Body: DockPanel;
  /** The mark's path in the icon registry; "" for a name the registry lacks. */
  glyph: string;
}

export interface DockDeps {
  /** By `order`: the docks' menus list them in this order. */
  panels: readonly PanelEntry[];
  byKind: ReadonlyMap<string, PanelEntry>;
}

export const dockDeps = createDeps<DockDeps>();

/** The `panels` contributions as the docks read them. */
export function panelsOf(contributions: readonly Contributed[]): DockDeps {
  const panels = contributions
    .map((c) => {
      const data = c.data as unknown as DockPanelData;
      return { ...data, Body: c.code as DockPanel, glyph: glyphOf(data.icon) };
    })
    .sort((a, b) => a.order - b.order);
  return { panels, byKind: new Map(panels.map((panel) => [panel.kind, panel])) };
}

/** A panel's short display name in the given language. */
export function panelLabel(panel: DockPanelData, locale: Locale): string {
  return locale === "zh" ? panel.titleZh : panel.title;
}

/** A React hook: the named panel's display name; the kind itself for one nobody contributes. */
export function usePanelLabel(kind: string): string {
  const { byKind } = dockDeps.useDeps();
  const { locale } = useLocale();
  const panel = byKind.get(kind);
  return panel === undefined ? kind : panelLabel(panel, locale);
}
