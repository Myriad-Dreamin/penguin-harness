/**
 * The sidebar's interface and its slots. The column (sidebar.tsx) and its folded rail (rail.tsx)
 * are a frame: what fills them comes from the modules that contribute here — the blocks of each
 * work mode (`sections`), the work modes beside the default one (`modes`), and the marks on its
 * rows (`navBadges`). The frame names none of its contributors.
 *
 * Contribution keys name the providing module (`"SidebarModule.sections"`); the slots hang on the
 * interface it provides, as `ShellSlots` does beside `Shell` (shell/module.ts). The code halves a
 * contributor implements live in a library file (lib/sidebar-contributions.ts), so a contributor
 * reaches them without importing the shell.
 */
import type { ComponentType } from "react";
import { Interface } from "@prismshadow/penguin-core/kernel";
import type { Slot } from "@prismshadow/penguin-core/kernel";
import type { NavBadge, SidebarMode, SidebarSection } from "../../lib/sidebar-contributions";

/** The work mode the frame stands in when no contributed mode is current. */
export const DEFAULT_MODE = "dev";

/** The pinned column's props (the app layout mounts it beside the page and in the phone's drawer). */
export interface SidebarColumnProps {
  /** Called after a navigation from inside the column: the drawer closes on it. */
  onNavigate?: () => void;
  /** Present on the pinned column: the fold button that swaps it for the rail. */
  onCollapse?: () => void;
  /** Mount with the session search open and focused: the search shortcut pressed on the rail. */
  initialSearchOpen?: boolean;
}

export interface SidebarRailProps {
  onExpand: () => void;
}

/** What the layout around the column reads: the phone's drawer button, and which commands apply. */
export interface SidebarColumnState {
  /** The default mode is current: its New chat and session search are on screen. */
  inDefaultMode: boolean;
  /** What the column lists, the drawer button's name: conversations, or the current mode's list. */
  listName: string;
  /** What a badge anywhere inside says, for the drawer button that covers them all; null = none. */
  menuNote: string | null;
}

@Interface()
export abstract class Sidebar {
  abstract readonly Column: ComponentType<SidebarColumnProps>;
  abstract readonly Rail: ComponentType<SidebarRailProps>;
  /** A React hook: the column's state for the layout around it. */
  abstract useColumnState(): SidebarColumnState;
}

/** The data half of a `sections` contribution. */
export interface SidebarSectionData {
  /** The work mode it belongs to: `"dev"` (the default) or a contributed mode's key. */
  mode: string;
  /** `header`: the switcher row above the nav. `body`: the scroll area, below the page nav. */
  place: "header" | "body";
  /** Its place among the sections of the same mode and place, ascending. */
  order: number;
}

/** The data half of a `modes` contribution. */
export interface SidebarModeData {
  key: string;
  /** The mode's name on the mode switch, in English and in Chinese. */
  title: string;
  titleZh: string;
  /** The rail toggle's glyph: a name in the UI package's icon registry (`ICONS`). */
  icon: string;
  /** Its place on the mode switch, after the default mode, ascending. */
  order: number;
}

/** The data half of a `navBadges` contribution. */
export interface NavBadgeData {
  /** A page's key (its nav row), `account` (the account row and the rail's avatar), or `menu` (the phone's drawer button). */
  anchor: string;
  order: number;
}

export interface SidebarSlots {
  /** A block of the column, shown while its work mode is the current one. */
  sections: Slot<SidebarSectionData, SidebarSection>;
  /** A work mode beside the default; contributing one adds it to the mode switch. */
  modes: Slot<SidebarModeData, SidebarMode>;
  /** A mark on a page's nav row, the account row or the drawer button. */
  navBadges: Slot<NavBadgeData, NavBadge>;
}
