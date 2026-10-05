/**
 * The sidebar's contributions as the frame reads them (iface.ts): the sections by mode and place,
 * the contributed modes and which one is current, and the nav badges by anchor. The selections
 * are pure and unit tested; the `compose*` functions turn a slot's hooks into one hook. A block
 * bound as a loader (a section's `Full` or `Rail`, a mode's `RailTop`) is deferred here, once, so
 * the frame draws components only (under `<Deferred>`).
 *
 * A composed hook calls every contribution's hook in a loop. That is sound because the list is
 * fixed when the tree boots: every render calls the same hooks in the same order, which is all
 * React asks of hook calls.
 */
import type { ComponentType } from "react";
import type { Contributed } from "@prismshadow/penguin-core/kernel";
import { componentOf } from "../../lib/lazy-component";
import type {
  ModeState,
  NavBadge,
  SidebarMode,
  SidebarSection,
} from "../../lib/sidebar-contributions";
import { DEFAULT_MODE } from "./iface";
import type { NavBadgeData, SidebarModeData, SidebarSectionData } from "./iface";

/** A section as the frame draws it: its blocks components, a loader deferred. */
export interface DrawnSection extends Omit<SidebarSection, "Full" | "Rail"> {
  Full: ComponentType<{ onNavigate?: () => void }>;
  Rail?: ComponentType;
}

/** A mode as the frame draws it: its rail top a component, a loader deferred. */
export interface DrawnMode extends Omit<SidebarMode, "RailTop"> {
  RailTop?: ComponentType;
}

export interface SectionEntry extends SidebarSectionData {
  id: string;
  section: DrawnSection;
}

export interface ModeEntry extends SidebarModeData {
  id: string;
  mode: DrawnMode;
}

export interface BadgeEntry extends NavBadgeData {
  id: string;
  badge: NavBadge;
}

/** A slot's contributions with their code, by `order`. */
function byOrder<D extends { order: number }, C, E>(
  contributions: readonly Contributed[],
  entry: (data: D, id: string, code: C) => E,
): E[] {
  return contributions
    .map((c) => ({ data: c.data as unknown as D, id: c.id, code: c.code as C }))
    .sort((a, b) => a.data.order - b.data.order)
    .map((c) => entry(c.data, c.id, c.code));
}

export const sectionsOf = (contributions: readonly Contributed[]): readonly SectionEntry[] =>
  byOrder<SidebarSectionData, SidebarSection, SectionEntry>(
    contributions,
    (d, id, { Full, Rail, ...section }) => ({
      ...d,
      id,
      section: {
        ...section,
        Full: componentOf(Full, `${id}.Full`),
        ...(Rail !== undefined ? { Rail: componentOf(Rail, `${id}.Rail`) } : {}),
      },
    }),
  );

export const modesOf = (contributions: readonly Contributed[]): readonly ModeEntry[] =>
  byOrder<SidebarModeData, SidebarMode, ModeEntry>(
    contributions,
    (d, id, { RailTop, ...mode }) => ({
      ...d,
      id,
      mode: {
        ...mode,
        ...(RailTop !== undefined ? { RailTop: componentOf(RailTop, `${id}.RailTop`) } : {}),
      },
    }),
  );

export const badgesOf = (contributions: readonly Contributed[]): readonly BadgeEntry[] =>
  byOrder<NavBadgeData, NavBadge, BadgeEntry>(contributions, (d, id, badge) => ({
    ...d,
    id,
    badge,
  }));

/** The sections of one mode at one place, in order. */
export function sectionsIn(
  sections: readonly SectionEntry[],
  mode: string,
  place: SidebarSectionData["place"],
): readonly SectionEntry[] {
  return sections.filter((s) => s.mode === mode && s.place === place);
}

/** The index of the current contributed mode — the first available one that says it is current — or -1 for the default. */
export function currentModeIndex(states: readonly ModeState[]): number {
  return states.findIndex((s) => s.available && s.current);
}

/** The key of the mode the frame stands in. */
export function currentModeKey(modes: readonly ModeEntry[], states: readonly ModeState[]): string {
  const at = currentModeIndex(states);
  return at < 0 ? DEFAULT_MODE : modes[at]!.key;
}

/** The marks contributed to one anchor, in order. */
export function marksFor(
  badges: readonly BadgeEntry[],
  anchor: string,
): ReadonlyArray<{ id: string; Mark: ComponentType }> {
  return badges.flatMap((b) =>
    b.anchor === anchor && b.badge.Mark !== undefined ? [{ id: b.id, Mark: b.badge.Mark }] : [],
  );
}

/** One hook over every mode's `useMode` (see the header for why the loop is sound). */
export function composeModes(modes: readonly ModeEntry[]): () => readonly ModeState[] {
  return () => modes.map((m) => m.mode.useMode());
}

/** One hook over every badge's `useNote`: the note on each anchor (the first contribution's, in order). */
export function composeNotes(badges: readonly BadgeEntry[]): () => ReadonlyMap<string, string> {
  const noting = badges.filter((b) => b.badge.useNote !== undefined);
  return () => {
    const notes = new Map<string, string>();
    for (const b of noting) {
      const note = b.badge.useNote!();
      if (note !== null && !notes.has(b.anchor)) notes.set(b.anchor, note);
    }
    return notes;
  };
}
