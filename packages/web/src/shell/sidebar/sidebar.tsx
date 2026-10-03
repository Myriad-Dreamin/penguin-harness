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
import type { DragEvent as ReactDragEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  NavRow,
  Segmented,
  SidebarAccountButton,
  SidebarFrame,
  SidebarNavArea,
  SidebarNavEntry,
  SidebarNavGroup,
  UpdateDot,
  UserAvatar,
} from "@prismshadow/penguin-ui";
import type { SidebarDropTarget } from "@prismshadow/penguin-ui";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { useShortcutTitle } from "../../lib/shortcuts/use-keymap";
import { useAuth } from "../../state/auth";
import {
  initialNavGroupCollapsed,
  initialNavPinOverrides,
  isNavPinned,
  navEntryKeysFor,
  splitNavEntries,
  storeNavGroupCollapsed,
  storeNavPinOverrides,
  withNavPinned,
} from "./nav-state";
import type { NavEntryKey, NavGroupKey } from "./nav-state";
import { navPagesOf, useShellPages } from "../index";
import { NAV_ICONS, NEW_CHAT_ICON } from "../../lib/nav-icons";
import { ProjectSwitcher } from "../../features/projects";
import { SessionDialogs, SessionList, useSessionList } from "../../features/session-list";
import { UserMenu } from "./user-menu";
import { PinnedBalanceBadge } from "../../features/models/group-balance";
import { isCurrentPath, renderRouterLink } from "./router-link";
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
import type { WorkMode } from "../../features/company/company-nav";
import { useOrgPages } from "../../features/company/use-org-pages";

/** Private drag payload type of a nav entry moved between the pinned and collapsible areas (never text/plain: use-session-drag.ts says why). */
const NAV_DRAG_MIME = "application/x-penguin-nav-entry";

/** Is the drag in flight a nav entry of ours? Authorizes a nav drop the way the session list's isGroupDrag authorizes a group drop. */
const isNavDrag = (e: ReactDragEvent): boolean => e.dataTransfer.types.includes(NAV_DRAG_MIME);

/** The two nav areas a dragged entry can be dropped into. */
type NavArea = "pinned" | "collapsible";

/** A page entry of the development nav: every entry but New chat, which keeps its fixed slot. */
const isNavPage = (key: NavEntryKey): key is NavGroupKey => key !== "newChat";

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
  /** Folded collapsible nav area (company mode: the whole nav group); expanded by default, the choice persists across sessions. */
  const [navCollapsed, setNavCollapsed] = useState(initialNavGroupCollapsed);
  /** The main nav's pages, as the modules contributed them (shell/page-table.ts). */
  const navPages = navPagesOf(useShellPages());
  /** The user's changes to which nav entries are pinned (the defaults live in nav-state.ts); persisted like the fold. */
  const [navPins, setNavPins] = useState(() => initialNavPinOverrides(navPages));
  /** Nav entry being dragged across the areas, and the area a drop would move it into. */
  const [navDrag, setNavDrag] = useState<NavEntryKey | null>(null);
  const [navDropArea, setNavDropArea] = useState<NavArea | null>(null);
  /**
   * The entry whose pin button takes focus once its row re-mounts in the other area. Moving
   * an entry moves its row to another container, and the button that had focus goes with the
   * old one — a keyboard user would be dropped onto <body>.
   */
  const pinFocusRef = useRef<NavEntryKey | null>(null);
  /** The chevron toggle: where focus goes when the moved row lands in the folded area. */
  const navToggleRef = useRef<HTMLButtonElement | null>(null);

  /** Collapse/expand the page-nav group (same store-then-set convention as setGroupMode). */
  const toggleNavGroup = () => {
    const next = !navCollapsed;
    storeNavGroupCollapsed(next);
    setNavCollapsed(next);
  };

  /**
   * Favourite or unfavourite one nav entry: the star and a drop across the areas both land here.
   * The entry simply takes its place in the other area; the star filling is the whole feedback,
   * with no reveal on the moved row (a de-blur there read as the row flickering).
   */
  const setNavPinned = (key: NavEntryKey, pinned: boolean) => {
    const next = withNavPinned(navPins, key, pinned);
    if (next === navPins) return;
    storeNavPinOverrides(next);
    setNavPins(next);
  };

  /**
   * Drag wiring of one development-mode nav entry: the row is its own handle. Offered only
   * where a pointer that can drag exists (HTML5 drag-and-drop never fires from touch); the
   * pin button is the way everywhere, and the only one there.
   */
  const navEntryDragProps = (key: NavEntryKey) =>
    canDrag
      ? {
          draggable: true,
          onDragStart: (e: ReactDragEvent) => {
            e.dataTransfer.setData(NAV_DRAG_MIME, key);
            e.dataTransfer.effectAllowed = "move";
            setNavDrag(key);
          },
          onDragEnd: () => {
            setNavDrag(null);
            setNavDropArea(null);
          },
        }
      : {};

  /**
   * Drop wiring of one nav area. Only a drag that would move the entry to this side is
   * accepted, so dropping a row back into its own area is not a drop at all; where inside the
   * area it lands is not asked, since both areas keep manifest order.
   */
  const navAreaDrop = (area: NavArea): SidebarDropTarget => ({
    over: navDropArea === area,
    onDragOver: (e) => {
      if (navDrag === null || !isNavDrag(e)) return;
      if (isNavPinned(navDrag, navPins) === (area === "pinned")) return;
      e.preventDefault();
      // The effect must be one effectAllowed permits, or the drop never fires (groupDragProps).
      e.dataTransfer.dropEffect = "move";
      setNavDropArea(area);
    },
    // Crossing onto one of the area's own rows fires dragleave too; still inside is no change.
    onDragLeave: (e) => {
      const to = e.relatedTarget;
      if (to instanceof Node && e.currentTarget.contains(to)) return;
      setNavDropArea((prev) => (prev === area ? null : prev));
    },
    onDrop: (e) => {
      if (navDrag === null || !isNavDrag(e)) return;
      e.preventDefault();
      setNavPinned(navDrag, area === "pinned");
      setNavDrag(null);
      setNavDropArea(null);
    },
  });

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
  const companyNavItems: Array<{
    key: string;
    /** Where the row leads — null for a row with nowhere to lead, which renders disabled. */
    to: string | null;
    label: string;
    icon: string;
    /** What the row's count means, for its tooltip; null for none. */
    note?: string | null;
    /** A count the row wears at its end (a contributed page's unread total); null for none. */
    count?: number | null;
  }> = inCompany
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
    : [];

  /**
   * Development mode's entries by area (nav-state.ts): New chat, then the main
   * nav's pages minus the entries this user's role cannot reach, each pinned or
   * collapsible, both areas in page order. New chat is always pinned and renders in its
   * fixed slot above the scroll area, so the pinned rows here are the pages after it.
   */
  const navSplit = splitNavEntries(navEntryKeysFor(navPages, user?.isAdmin === true), navPins);
  const pinnedNavPages = navSplit.pinned.filter(isNavPage);
  const collapsibleNavPages = navSplit.collapsible.filter(isNavPage);

  /**
   * One development-mode page entry: the package's pinnable nav row, bound to its route, its
   * badge trail, its pin choice and its drag. Four entries sit on a badge trail — Agents (an
   * outdated kernel, fixed on the Agent settings page two clicks down), Plugins, Models and the
   * Cost Center (each cleared on the page itself). The row's own label is visible, so the hint
   * only adds what the dot means, and the accessible name keeps the label as its prefix. The dot
   * hangs at the row's right edge, vertically centred on the row.
   */
  const renderNavEntry = (key: NavGroupKey) => {
    const to = `/${key}`;
    const label = S.nav[key];
    const note = navNoteFor(badges, to);
    const pinned = isNavPinned(key, navPins);
    return (
      <SidebarNavEntry
        key={key}
        label={label}
        glyph={NAV_ICONS[key]}
        href={to}
        active={isCurrentPath(to, location.pathname)}
        renderLink={renderRouterLink}
        onClick={() => onNavigate?.()}
        {...navEntryDragProps(key)}
        pin={{
          pinned,
          label: S.nav.pinEntry,
          tooltip: pinned ? S.nav.unpinEntry : S.nav.pinEntry,
          onToggle: (e) => {
            // A keyboard toggle follows its row into the other area (see pinFocusRef). A row
            // that lands in the folded area is not on screen: the chevron that unfolds it is the
            // nearest place to stand, read once the move has committed, since the commit may be
            // mounting the chevron itself.
            if (e.currentTarget.matches(":focus-visible")) {
              if (pinned && navCollapsed) {
                requestAnimationFrame(() => navToggleRef.current?.focus());
              } else {
                pinFocusRef.current = key;
              }
            }
            setNavPinned(key, !pinned);
          },
          buttonRef: (el) => {
            if (el === null || pinFocusRef.current !== key) return;
            pinFocusRef.current = null;
            el.focus();
            // A row that lands in an area still folding away is inert and cannot take focus:
            // the chevron again, once this commit is done.
            if (document.activeElement !== el) {
              queueMicrotask(() => navToggleRef.current?.focus());
            }
          },
        }}
        {...(note !== null
          ? {
              ariaLabel: `${label} · ${note}`,
              tooltip: note,
              badge: <UpdateDot size="inline" position="right-2.5 top-1/2 -translate-y-1/2" />,
            }
          : {})}
      />
    );
  };

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
              <SidebarNavArea drop={navAreaDrop("pinned")}>
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
      <SidebarNavGroup
        collapsed={navCollapsed}
        onToggle={toggleNavGroup}
        expandLabel={S.nav.expandGroup}
        collapseLabel={S.nav.collapseGroup}
        toggleRef={navToggleRef}
        {...(inCompany
          ? {}
          : {
              pinned:
                pinnedNavPages.length > 0 || navDrag !== null ? (
                  <SidebarNavArea
                    drop={navAreaDrop("pinned")}
                    reserve={pinnedNavPages.length === 0}
                  >
                    {pinnedNavPages.map(renderNavEntry)}
                  </SidebarNavArea>
                ) : undefined,
              foldable: collapsibleNavPages.length > 0 || navDrag !== null,
              drop: navAreaDrop("collapsible"),
            })}
      >
        {inCompany
          ? companyNavItems.map((item) => (
              /* A row with nowhere to go keeps its place and its glyph, muted, with nothing to
                 click or tab to. */
              <NavRow
                key={item.key}
                surface="muted"
                label={item.label}
                glyph={item.icon}
                href={item.to ?? ""}
                disabled={item.to === null}
                active={item.to !== null && isCurrentPath(item.to, location.pathname)}
                renderLink={renderRouterLink}
                onClick={() => onNavigate?.()}
                {...(item.count !== undefined && item.count !== null
                  ? {
                      ariaLabel: `${item.label} · ${item.note ?? ""}`,
                      ...(item.note ? { tooltip: item.note } : {}),
                      /* A count rather than a dot: the number is the information, as on a
                         channel row, and the tooltip says what it counts. */
                      badge: (
                        <span className="ml-auto shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                          {item.count}
                        </span>
                      ),
                    }
                  : {})}
              />
            ))
          : collapsibleNavPages.map(renderNavEntry)}
      </SidebarNavGroup>

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
