/**
 * Company mode in the sidebar (`SidebarModule.modes` and `.sections`): the work mode beside
 * development, with the organization's six pages and the company-mode pages plugins contribute
 * as its nav rows, and its four sections — the organization switcher where the Project switcher
 * stands; the channel list where the conversation list is (or, with no organization yet, the
 * block that creates one); the organization's ROADMAPS below it, while the roadmaps plugin is
 * there; and the organization's 工位 group, one row per employee's desk, with its Temporary
 * entries.
 *
 * The mode itself (its hook, its nav rows, its mark) is read on every render of the column, so it
 * is here, on the entry's side, with narrow imports. The blocks it shows are drawn only once the
 * mode is entered: their code (sidebar-sections.tsx, org-switcher.tsx) loads then.
 */
import { useLocation } from "react-router";
import { S } from "../../lib/strings";
import { lazyComponent } from "../../lib/lazy-component";
import type { ModeState, SidebarMode, SidebarSection } from "../../lib/sidebar-contributions";
import { useCompany } from "./company-state";
import { CompanyBetaBadge } from "./company-beta";
import { COMPANY_NAV_ICONS, ORG_PAGE_ICONS } from "./company-nav-icons";
import {
  COMPANY_NAV_KEYS,
  ORG_PAGE_RENDERERS,
  isOrgRoute,
  orgPagePath,
  orgPageRows,
  parseOrgKey,
} from "./company-nav";
import { useOrgPages } from "./use-org-pages";

/** The organization the sidebar points at: the open one, else the one last opened (the switcher names the same). */
export function useNavOrg(): { projectId: string; orgId: string } | null {
  const company = useCompany();
  return parseOrgKey(company.currentOrgKey ?? company.lastOrgKey);
}

function useCompanyMode(): ModeState {
  const company = useCompany();
  const location = useLocation();
  const navOrg = useNavOrg();
  const contributedPages = useOrgPages();
  return {
    available: company.available,
    current: company.workMode === "company",
    // Company mode enters at `/org` (the organization last opened, else the first);
    // development mode keeps whatever conversation is open and only leaves an organization
    // page, which has no development form.
    select: (on) => {
      company.setWorkMode(on ? "company" : "dev");
      if (on) return "/org";
      return isOrgRoute(location.pathname) ? "/chat" : null;
    },
    // The organization's six pages — channels are not among them, they are the list below —
    // all in the fold, with no pins and no drag. With no organization the six keep their
    // places, disabled: the pages exist, they just have no organization to show yet, and a nav
    // that empties itself reads as a broken shell rather than as an empty one.
    navItems: [
      ...COMPANY_NAV_KEYS.map((key) => ({
        key,
        to: navOrg === null ? null : orgPagePath(navOrg.projectId, navOrg.orgId, key),
        label: S.nav.org[key],
        icon: COMPANY_NAV_ICONS[key],
      })),
      // The pages plugins contribute (the proposals page), after the organization's own, each
      // keyed by the renderer it is drawn with, so a nav badge names it the way this build does
      // (the page key is the plugin's to choose).
      ...orgPageRows(contributedPages, navOrg).map((row) => ({
        key: row.renderer,
        to: row.to,
        label: S.nav.org[ORG_PAGE_RENDERERS[row.renderer].label],
        icon: ORG_PAGE_ICONS[row.renderer],
      })),
    ],
  };
}

const sections = () => import("./sidebar-sections");

export const companyMode: SidebarMode = {
  useMode: useCompanyMode,
  RailTop: lazyComponent(sections, "DefaultChannelRail"),
  listName: () => S.company.channels.drawerLabel,
  badge: { Node: CompanyBetaBadge, name: () => S.company.beta },
};

export const companySwitcher: SidebarSection = {
  Full: lazyComponent(() => import("./org-switcher"), "OrgSwitcher"),
};

export const companyChannels: SidebarSection = {
  Full: lazyComponent(sections, "Channels"),
  Rail: lazyComponent(sections, "ChannelsRail"),
};

export const companyRoadmaps: SidebarSection = { Full: lazyComponent(sections, "Roadmaps") };

export const companyDesks: SidebarSection = {
  Full: lazyComponent(sections, "Desks"),
  Rail: lazyComponent(sections, "DesksRail"),
};
