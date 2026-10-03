/**
 * The navigation column folded to its rail: the sidebar's compact form, beside the page while the
 * pinned sidebar is collapsed (app-layout.tsx swaps one for the other).
 */
import { useMemo, useRef, useState } from "react";
import { useLocation, useMatch, useNavigate } from "react-router";
import {
  ICONS,
  Rail,
  RailAccountButton,
  RailDivider,
  RailItem,
  Tooltip,
  UpdateDot,
  UserAvatar,
} from "@prismshadow/penguin-ui";
import { S } from "../../lib/strings";
import { useShortcutTitle } from "../../lib/shortcuts/use-keymap";
import { latestConversation, withoutOrgSessions } from "../../lib/session-grouping";
import { NAV_ICONS, NEW_CHAT_ICON } from "../../lib/nav-icons";
import { navKeysFor } from "./nav-state";
import { navPagesOf, useShellPages } from "../index";
import { navNoteFor, useUpdateBadges } from "../../features/todos";
import { useAuth } from "../../state/auth";
import { useProject } from "../../state/project";
import { useSessions } from "../../state/sessions";
import { useCompany } from "../../features/company";
import { COMPANY_NAV_ICONS } from "../../features/company/company-nav-icons";
import { ChannelRailRows } from "../../features/company/channel-sidebar";
import { DeskRailRows, TempSessionRailRows } from "../../features/company/org-session-groups";
import {
  COMPANY_NAV_KEYS,
  isOrgRoute,
  orgPagePath,
  parseOrgKey,
} from "../../features/company/company-nav";
import { UserMenu } from "./user-menu";
import { isCurrentPath, renderRouterLink } from "./router-link";
import { DRAFT_SESSION_ID } from "../../features/chat/chat-page";
import { useNewChat } from "../../features/chat/use-new-chat";

/**
 * The folded navigation column: the unfold button on top; below it, in product-specified order,
 * last conversation / new chat / Agents / Models / Plugins / Machines (admins) / Cost Center /
 * Evaluation Center; the user avatar at the bottom, opening the same account menu the pinned
 * sidebar's avatar does. No logo.
 *
 * Every entry is an icon with no visible label, so each carries a localized name and the same
 * words in a styled tooltip (the package's `RailItem`). The entries' names come from the same
 * strings as the pinned nav's, so the rail follows the UI language with it.
 */
export function CollapsedRail({ onExpand }: { onExpand: () => void }) {
  const { user } = useAuth();
  const navPages = navPagesOf(useShellPages());
  const navigate = useNavigate();
  const { currentProject, setCurrentAgentId } = useProject();
  const { sessions, loading } = useSessions();
  /**
   * Passive: the layout above owns the one fetch per session, so the rail only reads the
   * shared caches — and gets pushed a result that lands while it is mounted. The avatar
   * mirrors the pinned sidebar's software dot (the user menu behind it holds the update row);
   * every other badge here rides on a page entry, which is where its trail continues.
   */
  const badges = useUpdateBadges();
  const company = useCompany();
  const location = useLocation();
  /** Company mode: the organization's pages replace the development ones, and its channels follow them as rows. */
  const inCompany = company.workMode === "company";
  const navOrg = parseOrgKey(company.currentOrgKey ?? company.lastOrgKey);
  /** Same two moves as the pinned sidebar's switch: company mode enters at /org; development mode only leaves an organization page. */
  const toggleMode = () => {
    const next = inCompany ? "dev" : "company";
    company.setWorkMode(next);
    if (next === "company") navigate("/org");
    else if (isOrgRoute(location.pathname)) navigate("/chat");
  };
  // The move INTO company mode says the mode is a beta: the rail has no room for the pill the
  // expanded sidebar carries, and the suffix belongs on the label that offers the mode, not on
  // the one that leaves it.
  const companyToggleLabel = inCompany
    ? S.company.switchToDev
    : `${S.company.switchToCompany} · ${S.company.beta}`;
  const activeSessionId = useMatch("/chat/:sessionId")?.params.sessionId ?? null;
  /** On some conversation (any non-draft /chat/:id): the "you are here" state of the last-conversation entry. */
  const onConversation = activeSessionId !== null && activeSessionId !== DRAFT_SESSION_ID;

  /** Newest loaded conversation across the current Project (active/schedule only — archived and subagent rows are never auto-opened; the flat list is only ordered per Agent). An organization's desk and ticket Sessions are never conversations of this list. */
  const lastSession = useMemo(() => latestConversation(withoutOrgSessions(sessions)), [sessions]);

  /** Mirrors Sidebar.openSession: the current Agent follows the opened Session's Agent. */
  const openLastSession = () => {
    if (!lastSession) return;
    setCurrentAgentId(lastSession.agentId);
    navigate(`/chat/${lastSession.sessionId}`);
  };

  /** Mirrors the pinned sidebar's "New chat" (use-new-chat.ts): parks any typed-but-unsent draft text first, then opens a draft that names nothing, so it starts on the Project's new-chat defaults. */
  const newChat = useNewChat();

  /** Page entries (after last conversation and new chat): the pinned nav's manifest, routes
      and labels, in its order, and all of them whether pinned or collapsible there — the
      rail has no fold. Traces is not among them: reading a Trace happens in the chat
      toolbar's panel switcher, which is the only place it happens. */
  const pages: ReadonlyArray<{
    key: string;
    /** Where the entry leads — null while company mode has no organization, which renders it disabled. */
    to: string | null;
    label: string;
    icon: string;
    note: string | null;
  }> = inCompany
    ? COMPANY_NAV_KEYS.map((key) => ({
        key,
        // The six entries keep their places with no organization, disabled: a rail that
        // empties itself reads as a broken shell rather than as an empty one.
        to: navOrg === null ? null : orgPagePath(navOrg.projectId, navOrg.orgId, key),
        label: S.nav.org[key],
        icon: COMPANY_NAV_ICONS[key],
        note: null,
      }))
    : navKeysFor(navPages, user?.isAdmin === true).map((key) => ({
        key,
        to: `/${key}`,
        label: S.nav[key],
        icon: NAV_ICONS[key],
        note: navNoteFor(badges, `/${key}`),
      }));

  /**
   * The rail's avatar hangs its menu off the rail's OUTER edge rather than over the rail:
   * measured at click time as a zero-size point at the avatar's bottom and the aside's right,
   * so a 48px column cannot hold (or clip) a 224px panel. A virtual anchor is a position, not
   * an element, so `anchorOwner` is what tells the panel which scrolls moved it.
   */
  const avatarRef = useRef<HTMLButtonElement>(null);
  const [menuAnchor, setMenuAnchor] = useState<{
    top: number;
    bottom: number;
    left: number;
    right: number;
  } | null>(null);
  const measureMenuAnchor = () => {
    const button = avatarRef.current;
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    const left = (button.closest("aside")?.getBoundingClientRect().right ?? rect.right) + 4;
    return { top: rect.bottom, bottom: rect.bottom, left, right: left };
  };

  /**
   * The avatar's accessible name names the signed-in account — its nickname once there is one,
   * since that is the name the account chose to be called. The trigger itself is nothing but an
   * avatar, so without this the collapsed rail offers a control with no name at all; the visible
   * tooltip says what the control does instead, because neither an initial in a circle nor a
   * photograph is a name a reader needs read back. Both carry what the update trail is waiting
   * on, which from this rail is the only route left to the update row.
   */
  const accountName = user?.displayName ?? user?.userId;
  const avatarName =
    badges.softwareNote !== null
      ? `${accountName ?? ""} · ${badges.softwareNote}`
      : (accountName ?? S.auth.admin);
  const avatarTooltip =
    badges.softwareNote !== null
      ? `${S.nav.userSettings} · ${badges.softwareNote}`
      : S.nav.userSettings;
  const expandTitle = useShortcutTitle(S.nav.expandSidebar, "sidebar.toggle");

  return (
    <Rail
      head={
        <>
          <RailItem
            label={S.nav.expandSidebar}
            tooltip={expandTitle}
            glyph={ICONS.chevronRightPipe}
            onClick={onExpand}
            className="shrink-0"
          />
          {/* The work-mode toggle, the rail's compact form of the sidebar's 开发 | 公司 switch:
              one building glyph, pressed while in company mode, the tooltip naming the move a
              click makes. Same availability rule as the switch. */}
          {company.available && (
            <RailItem
              label={companyToggleLabel}
              glyph={ICONS.building}
              pressed={inCompany}
              onClick={toggleMode}
              className="shrink-0"
            />
          )}
        </>
      }
      foot={
        /* The account menu opens here, on the rail, instead of the avatar expanding the sidebar
           first: appearance and Settings, the update row and signing out all stay one click
           away while collapsed. Same component as the pinned sidebar's (user-menu.tsx). */
        <UserMenu
          className="mt-auto shrink-0"
          menuClass="w-56 origin-bottom-left"
          portal={{ direction: "up", align: "left" }}
          anchorRect={menuAnchor}
          anchorOwner={() => avatarRef.current}
          trigger={({ open, toggle }) => (
            /* The tooltip names the same avatar the open menu hangs off, so it stands down
               while the menu is up rather than covering it. */
            <Tooltip label={avatarTooltip} suppressed={open}>
              <RailAccountButton
                buttonRef={avatarRef}
                label={avatarName}
                expanded={open}
                onClick={() => {
                  setMenuAnchor(measureMenuAnchor());
                  toggle();
                }}
              >
                <UserAvatar
                  userId={user?.userId ?? "?"}
                  {...(user?.displayName !== undefined ? { displayName: user.displayName } : {})}
                  {...(user?.avatar !== undefined ? { avatar: user.avatar } : {})}
                >
                  {/* Update reminder, mirroring the pinned sidebar's avatar: the update row sits
                      in the menu this opens, and the label above names what is waiting. */}
                  {badges.software !== null && <UpdateDot />}
                </UserAvatar>
              </RailAccountButton>
            </Tooltip>
          )}
        />
      }
    >
      {/* 1. Last conversation: a history mark (a clock read backwards) — the entry goes BACK to
          where the user was. Lit on any non-draft conversation. Dimmed/disabled (tooltip kept)
          only once the list has settled with no non-archived Session — while it is still
          loading the entry keeps its normal look (no flash) and a click is a graceful no-op. */}
      <RailItem
        label={S.nav.lastConversation}
        glyph={ICONS.history}
        active={onConversation}
        disabled={!lastSession && !loading}
        onClick={openLastSession}
      />
      {/* 2. New chat: lit while on the draft page (pinned-sidebar convention). Company mode
          leaves this slot empty — a channel is made rarely, from the channel list's own header,
          and the rail carries no create control of its own. */}
      {!inCompany && (
        <RailItem
          label={S.chat.newSessionMenu}
          glyph={NEW_CHAT_ICON}
          active={activeSessionId === DRAFT_SESSION_ID}
          onClick={newChat}
        />
      )}
      {/* 3 onward. Page entries. Four sit on a badge trail — Agents (an outdated kernel),
          Plugins, Models and the Cost Center. The dot is decorative: this rail's icons have no
          visible label, so the name and the hint carry both the entry and what is waiting. An
          entry with nowhere to go keeps its place, muted, with nothing to click or tab to. */}
      {pages.map((item) => {
        const label = item.note !== null ? `${item.label} · ${item.note}` : item.label;
        return (
          <RailItem
            key={item.key}
            label={label}
            glyph={item.icon}
            href={item.to ?? ""}
            disabled={item.to === null}
            active={item.to !== null && isCurrentPath(item.to, location.pathname)}
            renderLink={renderRouterLink}
            {...(item.note !== null ? { badge: <UpdateDot /> } : {})}
          />
        );
      })}
      {/* The organization's channels, its desks and then its Temporary entries, under the pages
          the way they sit under the nav in the pinned sidebar. A hairline says where each run
          ends; a channel row carries its own unread count and a desk or an entry its running
          dot, since a rail with no labels must still say how much is waiting. */}
      {inCompany && navOrg !== null && (
        <>
          <RailDivider />
          <ChannelRailRows projectId={navOrg.projectId} orgId={navOrg.orgId} />
          <RailDivider />
          <DeskRailRows projectId={navOrg.projectId} orgId={navOrg.orgId} />
          <TempSessionRailRows projectId={navOrg.projectId} orgId={navOrg.orgId} />
        </>
      )}
    </Rail>
  );
}
