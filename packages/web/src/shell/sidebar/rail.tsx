/**
 * The navigation column folded to its rail: the sidebar's compact form, beside the page while the
 * pinned sidebar is collapsed (app-layout.tsx swaps one for the other). It reads the same slots
 * the column does (iface.ts): the contributed modes' toggles and nav rows, the current mode's
 * sections' rail forms, and the nav badges' dots.
 */
import { useMemo, useRef, useState } from "react";
import { useLocation, useMatch, useNavigate } from "react-router";
import {
  ICONS,
  Rail,
  RailAccountButton,
  RailItem,
  Tooltip,
  UpdateDot,
  UserAvatar,
} from "@prismshadow/penguin-ui";
import { meAvatarUrl } from "../../api/endpoints";
import { Deferred } from "../../components/ui/deferred";
import { S } from "../../lib/strings";
import { useShortcutTitle } from "../../lib/shortcuts/use-keymap";
import { latestConversation, withoutOrgSessions } from "../../lib/session-grouping";
import { NEW_CHAT_ICON, glyphOf } from "../../lib/nav-icons";
import { navChildKeysFor, navKeysFor } from "./nav-state";
import { navPagesOf, pageTitle, useShellPages } from "../index";
import { useAuth } from "../../state/auth";
import { useLocale } from "../../state/locale";
import { useProject } from "../../state/project";
import { useSessions } from "../../state/sessions";
import { UserMenu } from "./user-menu";
import { isCurrentPath, renderRouterLink } from "./router-link";
import type { SidebarRailProps } from "./iface";
import { sidebarDeps } from "./deps";
import { currentModeIndex, currentModeKey, sectionsIn } from "./modes";

/**
 * The folded navigation column: the unfold button on top; below it, in product-specified order,
 * last conversation / new chat / Agents / Models / Plugins / Machines (admins) / Cost Center /
 * Evaluation Center; the user avatar at the bottom, opening the same account menu the pinned
 * sidebar's avatar does. No logo.
 *
 * In company mode the top slot is the organization's all-hands channel, the slot after it stays
 * empty, the organization's pages replace the development ones, and its other channels, desks
 * and Temporary entries follow. The rail carries no work-mode toggle in either mode: the mode is
 * switched from the pinned sidebar's Development | Company switch, so a folded sidebar keeps
 * only entries that lead somewhere.
 *
 * Every entry is an icon with no visible label, so each carries a localized name and the same
 * words in a styled tooltip (the package's `RailItem`). The entries' names come from the same
 * strings as the pinned nav's, so the rail follows the UI language with it.
 */
export function CollapsedRail({ onExpand }: SidebarRailProps) {
  const { user } = useAuth();
  const { locale } = useLocale();
  const navPages = navPagesOf(useShellPages());
  const childKeys = navChildKeysFor(navPages, user?.isAdmin === true);
  const navigate = useNavigate();
  const { currentProject, setCurrentAgentId } = useProject();
  const { sessions, loading } = useSessions();
  const { sections, modes, useModes, useNotes, drafts } = sidebarDeps.useDeps();
  /**
   * The badges, by anchor. The avatar mirrors the pinned sidebar's account dot (the user menu
   * behind it holds the App info row); every other badge here rides on a page entry, which is
   * where its trail continues.
   */
  const notes = useNotes();
  const accountNote = notes.get("account") ?? null;
  const location = useLocation();
  /**
   * A contributed mode's pages replace the development ones, its own top entry (if it has one)
   * takes the last conversation's slot, and its sections' rail rows follow the pages.
   */
  const modeStates = useModes();
  const current = currentModeIndex(modeStates);
  const currentKey = currentModeKey(modes, modeStates);
  const RailTop = current >= 0 ? modes[current]!.mode.RailTop : undefined;
  const activeSessionId = useMatch("/chat/:sessionId")?.params.sessionId ?? null;
  /** On some conversation (any non-draft /chat/:id): the "you are here" state of the last-conversation entry. */
  const onConversation = activeSessionId !== null && activeSessionId !== drafts.newChatId;

  /** Newest loaded conversation across the current Project (active/schedule only — archived and subagent rows are never auto-opened; the flat list is only ordered per Agent). An organization's desk and ticket Sessions are never conversations of this list. */
  const lastSession = useMemo(() => latestConversation(withoutOrgSessions(sessions)), [sessions]);

  /** Mirrors Sidebar.openSession: the current Agent follows the opened Session's Agent. */
  const openLastSession = () => {
    if (!lastSession) return;
    setCurrentAgentId(lastSession.agentId);
    navigate(`/chat/${lastSession.sessionId}`);
  };

  /** Mirrors the pinned sidebar's "New chat": parks any typed-but-unsent draft text first, then opens a draft that names nothing, so it starts on the Project's new-chat defaults. */
  const newChat = drafts.useNewChat();

  /** Page entries (after the top slot and new chat): the pinned nav's manifest, routes
      and labels, in its order, and all of them whether pinned or collapsible there — the
      rail has no fold. Traces is not among them: reading a Trace happens in the chat
      toolbar's panel switcher, which is the only place it happens. */
  const pages: ReadonlyArray<{
    key: string;
    /** Where the entry leads — null for an entry with nowhere to lead, which renders disabled. */
    to: string | null;
    label: string;
    /** A name in the UI package's icon registry. */
    icon: string;
    note: string | null;
    /** The routes of the pages the entry carries (nav-state.ts): the rail draws none of them, and lights the entry while one is open. */
    childPaths?: readonly string[];
  }> =
    current >= 0
      ? modeStates[current]!.navItems.map((item) => ({
          ...item,
          note: notes.get(item.key) ?? null,
        }))
      : navKeysFor(navPages, user?.isAdmin === true).flatMap((key) => {
          const page = navPages.find((p) => p.key === key);
          return page === undefined
            ? []
            : [
                {
                  key,
                  to: page.path,
                  label: pageTitle(page, locale),
                  icon: page.icon ?? "",
                  note: notes.get(key) ?? null,
                  childPaths: (childKeys.get(key) ?? []).flatMap(
                    (k) => navPages.find((p) => p.key === k)?.path ?? [],
                  ),
                },
              ];
        });

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
   * on, which from this rail is the only route left to the App info row.
   */
  const accountName = user?.displayName ?? user?.userId;
  const avatarName =
    accountNote !== null ? `${accountName ?? ""} · ${accountNote}` : (accountName ?? S.auth.admin);
  const avatarTooltip =
    accountNote !== null ? `${S.nav.userSettings} · ${accountNote}` : S.nav.userSettings;
  const expandTitle = useShortcutTitle(S.nav.expandSidebar, "sidebar.toggle");

  return (
    <Rail
      head={
        <RailItem
          label={S.nav.expandSidebar}
          tooltip={expandTitle}
          glyph={ICONS.chevronRightPipe}
          onClick={onExpand}
          className="shrink-0"
        />
      }
      foot={
        /* The account menu opens here, on the rail, instead of the avatar expanding the sidebar
           first: appearance and Settings, the App info row and signing out all stay one click
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
                  {...(user?.avatarRev !== undefined
                    ? { avatar: meAvatarUrl(user.avatarRev) }
                    : {})}
                >
                  {/* Update reminder, mirroring the pinned sidebar's avatar: the App info row sits
                      in the menu this opens, and the label above names what is waiting. */}
                  {accountNote !== null && <UpdateDot />}
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
          loading the entry keeps its normal look (no flash) and a click is a graceful no-op.
          A contributed mode can give the slot to an entry of its own instead — company mode
          to the organization's all-hands channel: an organization's conversations are its
          channels, and the one everyone is in is where a person goes back to. */}
      {RailTop !== undefined ? (
        <Deferred fallback={null}>
          <RailTop />
        </Deferred>
      ) : (
        <RailItem
          label={S.nav.lastConversation}
          glyph={ICONS.history}
          active={onConversation}
          disabled={!lastSession && !loading}
          onClick={openLastSession}
        />
      )}
      {/* 2. New chat: lit while on the draft page (pinned-sidebar convention). A contributed
          mode leaves this slot empty — its create actions are its own sections', and the rail
          carries no create control of its own. */}
      {current < 0 && (
        <RailItem
          label={S.chat.newSessionMenu}
          glyph={NEW_CHAT_ICON}
          active={activeSessionId === drafts.newChatId}
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
            glyph={glyphOf(item.icon)}
            href={item.to ?? ""}
            disabled={item.to === null}
            active={
              item.to !== null &&
              [item.to, ...(item.childPaths ?? [])].some((to) =>
                isCurrentPath(to, location.pathname),
              )
            }
            renderLink={renderRouterLink}
            {...(item.note !== null ? { badge: <UpdateDot /> } : {})}
          />
        );
      })}
      {/* The current mode's sections in their rail form, under the pages the way they sit
          under the nav in the pinned sidebar. */}
      {sectionsIn(sections, currentKey, "body").map(({ id, section: { Rail: SectionRail } }) =>
        SectionRail === undefined ? null : (
          <Deferred key={id} fallback={null}>
            <SectionRail />
          </Deferred>
        ),
      )}
    </Rail>
  );
}
