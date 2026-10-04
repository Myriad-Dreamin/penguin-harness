/**
 * Single-column sidebar, top to bottom:
 * Project switcher -> nav: New chat (a draft on the Project's new-chat defaults), always pinned
 * in its fixed slot above the scroll area, then Agents → Evaluation Center. Each page entry is
 * pinned (always shown) or collapsible (folded away by a nav-row-wide chevron button under the
 * collapsible area: arrow up = click to collapse, arrow down while collapsed = the way back);
 * Agents, Models and Plugins are pinned by default, a row's hover pin button or a drag across
 * the areas moves an entry, and both the fold and the pin choices persist in localStorage
 * (nav-state.ts) -> the session list (features/session-list) -> bottom user row, which opens
 * the shared account menu (user-menu.tsx).
 * In company mode the shape holds but the objects change: the organization switcher stands
 * where the Project switcher stands, "New channel" where "New chat" is, the organization's
 * six pages in the nav group, and the channel list where the conversation list is, followed
 * by the organization's own 工位 group — one row per employee
 * (features/company/channel-sidebar.tsx, features/company/org-session-groups.tsx).
 * Desktop keeps it pinned as the left column; mobile puts the whole thing in a drawer.
 * New chats always enter draft state (/chat/new; a group header's "+" names its group's Agent or
 * Workspace in route state): Model / Workspace / approval mode are all chosen on the draft input
 * card, so there's no longer a separate "quick / advanced" pair of new-chat dialogs.
 * The column's look — its frame, page rows, list header, controls and conversation rows — is the
 * UI package's (SidebarFrame, NavRow, SessionRow); this file binds them to the app's state. On the
 * column's muted surface a hover and a selection are washes of the ink (NAV_FILL), and a running
 * status is a small mark, never a block of colour.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  NavRow,
  Segmented,
  SidebarAccountButton,
  SidebarFrame,
  SidebarNavArea,
  UpdateDot,
  UserAvatar,
} from "@prismshadow/penguin-ui";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { useShortcutTitle } from "../../lib/shortcuts/use-keymap";
import { useAuth } from "../../state/auth";
import { NEW_CHAT_ICON } from "../../lib/nav-icons";
import { ProjectSwitcher } from "../../features/projects";
import { SessionDialogs, SessionList, useSessionList } from "../../features/session-list";
import { PageNav, usePageNav } from "./page-nav";
import type { CompanyNavItem } from "./page-nav";
import { UserMenu } from "./user-menu";
import { PinnedBalanceBadge } from "../../features/models/group-balance";
import { navNoteFor, useUpdateBadges } from "../../features/todos";
import { useCompany } from "../../features/company";
import { NoOrganizationsSidebar, OrgSwitcher } from "../../features/company/org-switcher";
import { CompanyBetaBadge } from "../../features/company/company-beta";
import { ChannelSidebar } from "../../features/company/channel-sidebar";
import { RoadmapsSidebar } from "../../features/company/roadmaps-sidebar";
import { OrgSessionGroups } from "../../features/company/org-session-groups";
import { COMPANY_NAV_ICONS, ORG_PAGE_ICONS } from "../../features/company/company-nav-icons";
import {
  COMPANY_NAV_KEYS,
  ORG_PAGE_RENDERERS,
  isOrgRoute,
  orgPagePath,
  orgPageRows,
  parseOrgKey,
} from "../../features/company/company-nav";
import { useOrgPages } from "../../features/company/use-org-pages";
import type { WorkMode } from "../../features/company/company-nav";

/** Manual drag-reordering needs a pointer that can drag (HTML5 DnD never fires from touch) — the outline rail's query. */
const DRAG_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

export function Sidebar({
  onNavigate,
  onCollapse,
  initialSearchOpen = false,
}: {
  onNavigate?: () => void;
  onCollapse?: () => void;
  /** Mount with the session search open and focused: the search shortcut pressed on the collapsed rail. */
  initialSearchOpen?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  /** The badges over the update and to-do trails (use-update-badges.ts); the avatar's dot follows the update flow's offer / restart states. */
  const badges = useUpdateBadges();
  const company = useCompany();
  /** Company mode swaps the Project switcher, the page nav and the session list for their organization forms. */
  const inCompany = company.workMode === "company";
  /** The organization the company nav points at: the open one, else the one last opened (the switcher names the same). */
  const navOrg = parseOrgKey(company.currentOrgKey ?? company.lastOrgKey);
  /** The company-mode pages plugins contribute (the proposals page): rows after the organization's six. */
  const contributedOrgPages = useOrgPages();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const newChatTitle = useShortcutTitle(S.chat.newSessionMenu, "chat.new");
  const collapseTitle = useShortcutTitle(S.nav.collapseSidebar, "sidebar.toggle");
  /**
   * Whether a pointer that can drag is present (the outline rail's HOVER_QUERY idiom).
   * HTML5 drag-and-drop never fires from touch, and the sort mode is one GLOBAL
   * preference: offering 手动排序 in the mobile drawer would freeze that list in an
   * order the phone has no gesture to change — and flip the desktop too. The option is
   * hidden there; an already-stored "manual" degrades to recency on such a device.
   */
  const [canDrag, setCanDrag] = useState(() => window.matchMedia(DRAG_POINTER_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(DRAG_POINTER_QUERY);
    const onChange = (e: MediaQueryListEvent) => setCanDrag(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const list = useSessionList({ onNavigate, canDrag, inCompany, rootRef, initialSearchOpen });
  const nav = usePageNav(canDrag);

  const go = (to: string) => {
    navigate(to);
    onNavigate?.();
  };

  /**
   * The mode switch: company mode enters at `/org` (the organization last opened, else the
   * first); development mode keeps whatever conversation is open and only leaves an
   * organization page, which has no development form.
   */
  const switchMode = (mode: WorkMode) => {
    if (mode === company.workMode) return;
    company.setWorkMode(mode);
    if (mode === "company") go("/org");
    else if (isOrgRoute(location.pathname)) go("/chat");
  };

  /**
   * Company mode's nav rows: the organization's six pages (COMPANY_NAV_KEYS) — channels are not
   * among them, they are the list below — all in the fold, with no pins and no drag. Always
   * mounted — the fold animates their height to zero and turns them inert.
   */
  const companyNavItems: CompanyNavItem[] | null = inCompany
    ? [
        ...COMPANY_NAV_KEYS.map((key) => ({
          key,
          // Company mode with no organization keeps its six rows and disables them: the pages
          // exist, they just have no organization to show yet, and a nav that empties itself
          // reads as a broken shell rather than as an empty one.
          to: navOrg === null ? null : orgPagePath(navOrg.projectId, navOrg.orgId, key),
          label: S.nav.org[key],
          icon: COMPANY_NAV_ICONS[key],
        })),
        // The pages plugins contribute, after the organization's own. The proposals row wears
        // the unread total of the open organization's proposals, the way a channel row wears
        // its unread count; the tooltip says what the number is.
        ...orgPageRows(contributedOrgPages, navOrg).map((row) => {
          const count = row.renderer === "OrgProposalsPage" ? company.unreadProposals : 0;
          return {
            key: row.key,
            to: row.to,
            label: S.nav.org[ORG_PAGE_RENDERERS[row.renderer].label],
            icon: ORG_PAGE_ICONS[row.renderer],
            note: count > 0 ? S.company.proposals.unreadNote(count) : null,
            count: count > 0 ? count : null,
          };
        }),
      ]
    : null;

  /**
   * The account row at the column's foot: the trigger for the account menu both this sidebar and
   * the collapsed rail open (user-menu.tsx).
   */
  const accountRow = (
    <UserMenu
      menuClass="bottom-full left-0 right-0 mb-1 origin-bottom"
      trigger={({ open, toggle }) => (
        <SidebarAccountButton
          expanded={open}
          onClick={toggle}
          // The dot alone is mysterious: name what is waiting on the trigger (hover tooltip +
          // accessible name), in the App info row's own wording.
          {...(badges.softwareNote !== null
            ? {
                hint: badges.softwareNote,
                label: `${user?.displayName ?? user?.userId ?? ""} · ${badges.softwareNote}`,
              }
            : {})}
          avatar={
            <UserAvatar
              userId={user?.userId ?? "?"}
              {...(user?.displayName !== undefined ? { displayName: user.displayName } : {})}
              {...(user?.avatarRev !== undefined
                ? { avatar: api.meAvatarUrl(user.avatarRev) }
                : {})}
            >
              {/* Update reminder: the menu behind this trigger holds the row that acts on it,
                  and the trigger's tooltip/label above say what it is. */}
              {badges.software !== null && <UpdateDot />}
            </UserAvatar>
          }
          name={user?.displayName ?? user?.userId}
          trailing={<PinnedBalanceBadge />}
          {...(user?.isAdmin ? { role: S.auth.admin } : {})}
        />
      )}
    />
  );

  return (
    <SidebarFrame
      rootRef={rootRef}
      // The work-mode switch, above the Project switcher: 开发 | 公司. Rendered only while
      // company mode is available (the admin master switch and the user's own switch both on);
      // the choice persists per user. The 内测版 tag rides on 公司 — the switch is the one
      // control that names the mode, so the mark stands on the word it qualifies rather than
      // somewhere inside the mode it describes.
      {...(company.available
        ? {
            modeSwitch: {
              label: S.company.workMode,
              control: (
                <Segmented
                  options={[
                    { value: "dev" as const, label: S.company.modeDev },
                    {
                      value: "company" as const,
                      label: S.company.modeCompany,
                      badge: { node: <CompanyBetaBadge />, name: S.company.beta },
                    },
                  ]}
                  value={company.workMode}
                  onChange={switchMode}
                  cols={2}
                />
              ),
            },
          }
        : {})}
      {...(onCollapse
        ? {
            collapse: { label: S.nav.collapseSidebar, tooltip: collapseTitle, onClick: onCollapse },
          }
        : {})}
      switcher={
        // The Project switcher; the organization switcher in company mode.
        inCompany ? <OrgSwitcher {...(onNavigate ? { onNavigate } : {})} /> : <ProjectSwitcher />
      }
      // New chat: always pinned, in the one slot between the switcher above and the scroll area
      // below; it has no pin button and cannot be dragged. A page row like the nav's (no fill at
      // rest), told apart by its place and its weight, and lit while on the draft page. Its slot
      // belongs to the pinned area, so it also takes an entry dragged out of the collapsible
      // one. Company mode pins nothing here: a channel is made rarely, so "New channel" is the
      // channel list's own header action rather than a permanent row (channel-sidebar.tsx).
      {...(inCompany
        ? {}
        : {
            pinned: (
              <SidebarNavArea drop={nav.areaDrop("pinned")}>
                <NavRow
                  surface="muted"
                  label={S.chat.newSessionMenu}
                  tooltip={newChatTitle}
                  glyph={NEW_CHAT_ICON}
                  active={list.onDraftPage}
                  onClick={() => list.newChat()}
                  className="font-medium"
                />
              </SidebarNavArea>
            ),
          })}
      account={accountRow}
      overlays={<SessionDialogs list={list} />}
    >
      {/* The page nav: in development mode the pinned pages, then the collapsible ones folded
          away under the slim toggle (with nothing collapsible there is no toggle); in company
          mode the organization's six pages, all under the toggle. The fold persists. Folding
          rows tween their height to zero, inert, and leave once folded. The nav and the session
          list scroll together. Mid-drag, an empty pinned run keeps a row's height and a hidden
          toggle band comes back, so either side can take the drop. */}
      <PageNav
        nav={nav}
        companyItems={companyNavItems}
        noteFor={(to) => navNoteFor(badges, to)}
        onNavigate={onNavigate}
      />

      {inCompany ? (
        navOrg !== null ? (
          /* Company mode: the organization's channels, where development mode lists
             conversations; below them its ROADMAPS (while the roadmaps plugin is there) and
             its 工位 group — one row per employee's desk. */
          <>
            <ChannelSidebar
              projectId={navOrg.projectId}
              orgId={navOrg.orgId}
              {...(onNavigate ? { onNavigate } : {})}
            />
            <RoadmapsSidebar
              projectId={navOrg.projectId}
              orgId={navOrg.orgId}
              {...(onNavigate ? { onNavigate } : {})}
            />
            <OrgSessionGroups
              projectId={navOrg.projectId}
              orgId={navOrg.orgId}
              activeSessionId={list.activeSessionId}
              {...(onNavigate ? { onNavigate } : {})}
            />
          </>
        ) : (
          /* No organization to list: the create block, not an empty channel list. */
          <NoOrganizationsSidebar {...(onNavigate ? { onNavigate } : {})} />
        )
      ) : (
        <SessionList list={list} {...(onNavigate ? { onNavigate } : {})} />
      )}
    </SidebarFrame>
  );
}
