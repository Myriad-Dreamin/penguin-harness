/**
 * Single-column sidebar, top to bottom:
 * the work-mode switch (when a contributed mode is offered) -> the switcher row (the current
 * mode's `header` sections: the Project switcher in development mode) -> New chat (a draft on
 * the Project's new-chat defaults), always pinned in its fixed slot above the scroll area, in
 * development mode -> the page nav (page-nav.tsx) -> the current mode's `body` sections (the
 * session list in development mode) -> bottom user row, which opens the shared account menu
 * (user-menu.tsx).
 * A contributed mode keeps the shape but changes the objects: its own switcher, its own nav rows
 * in place of the page table's, its own sections in place of the session list. The frame names
 * none of them: they arrive through the sidebar module's slots (iface.ts), and a section's scope
 * stays mounted across a mode switch, so coming back finds every section as it was left.
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
import type { ReactNode } from "react";
import { useMatch, useNavigate } from "react-router";
import {
  NavRow,
  Segmented,
  SidebarAccountButton,
  SidebarFrame,
  SidebarNavArea,
  UpdateDot,
  UserAvatar,
} from "@prismshadow/penguin-ui";
import { S } from "../../lib/strings";
import { useShortcutTitle } from "../../lib/shortcuts/use-keymap";
import { useAuth } from "../../state/auth";
import { useLocale } from "../../state/locale";
import { NEW_CHAT_ICON } from "../../lib/nav-icons";
import { DEFAULT_MODE } from "./iface";
import type { SidebarColumnProps } from "./iface";
import { sidebarDeps } from "./deps";
import { currentModeIndex, marksFor, sectionsIn } from "./modes";
import { PageNav, usePageNav } from "./page-nav";
import { UserMenu } from "./user-menu";

/** Manual drag-reordering needs a pointer that can drag (HTML5 DnD never fires from touch) — the outline rail's query. */
const DRAG_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

export function Sidebar({ onNavigate, onCollapse, initialSearchOpen = false }: SidebarColumnProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { locale } = useLocale();
  const { sections, modes, badges, useModes, useNotes, drafts } = sidebarDeps.useDeps();

  /** The contributed modes' states, and the one the column stands in (-1: the default). */
  const modeStates = useModes();
  const current = currentModeIndex(modeStates);
  const currentKey = current < 0 ? DEFAULT_MODE : modes[current]!.key;
  const inDefault = current < 0;
  /** The badges on the nav rows and the account row, by anchor (navBadges). */
  const notes = useNotes();
  const accountNote = notes.get("account") ?? null;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const newChat = drafts.useNewChat();
  const onDraftPage = useMatch("/chat/:sessionId")?.params.sessionId === drafts.newChatId;
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
  const nav = usePageNav(canDrag);

  const go = (to: string) => {
    navigate(to);
    onNavigate?.();
  };

  /**
   * The mode switch: leaving the current contributed mode, then entering the chosen one; each
   * mode says where the app goes (a mode enters at its own landing, and leaving one only moves
   * off its own pages), and a move it does not ask for leaves the page alone.
   */
  const switchMode = (key: string) => {
    if (key === currentKey) return;
    let to = current < 0 ? null : modeStates[current]!.select(false);
    const target = modes.findIndex((m) => m.key === key);
    if (target >= 0) to = modeStates[target]!.select(true);
    if (to !== null) go(to);
  };
  const offered = modes.flatMap((m, i) => (modeStates[i]!.available ? [m] : []));

  /** The current mode's sections at one place, each with its full form. */
  const renderSections = (place: "header" | "body"): ReactNode =>
    sectionsIn(sections, currentKey, place).map(({ id, section: { Full } }) => (
      <Full key={id} {...(onNavigate ? { onNavigate } : {})} />
    ));

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
          // accessible name), in the update row's own wording.
          {...(accountNote !== null
            ? {
                hint: accountNote,
                label: `${user?.displayName ?? user?.userId ?? ""} · ${accountNote}`,
              }
            : {})}
          avatar={
            <UserAvatar
              userId={user?.userId ?? "?"}
              {...(user?.displayName !== undefined ? { displayName: user.displayName } : {})}
              {...(user?.avatar !== undefined ? { avatar: user.avatar } : {})}
            >
              {/* Update reminder: the menu behind this trigger holds the row that acts on it,
                  and the trigger's tooltip/label above say what it is. */}
              {accountNote !== null && <UpdateDot />}
            </UserAvatar>
          }
          name={user?.displayName ?? user?.userId}
          trailing={marksFor(badges, "account").map(({ id, Mark }) => (
            <Mark key={id} />
          ))}
          {...(user?.isAdmin ? { role: S.auth.admin } : {})}
        />
      )}
    />
  );

  // Every section's scope wraps the whole column, outermost first, whatever the mode.
  const frame = (
    <SidebarFrame
      rootRef={rootRef}
      // The work-mode switch, above the switcher row: 开发 | the contributed modes. Rendered only
      // while one is offered to this user; each mode keeps its own choice. A mode's mark (a
      // beta tag) rides on its own option — the switch is the one control that names the mode,
      // so the mark stands on the word it qualifies.
      {...(offered.length > 0
        ? {
            modeSwitch: {
              label: S.nav.workMode,
              control: (
                <Segmented
                  options={[
                    { value: DEFAULT_MODE, label: S.nav.modeDev },
                    ...offered.map(({ key, title, titleZh, mode }) => ({
                      value: key,
                      label: locale === "zh" ? titleZh : title,
                      ...(mode.badge !== undefined
                        ? { badge: { node: <mode.badge.Node />, name: mode.badge.name() } }
                        : {}),
                    })),
                  ]}
                  value={currentKey}
                  onChange={switchMode}
                  // One column per option; the package's grid stops at five.
                  cols={Math.min(Math.max(offered.length + 1, 2), 5) as 2 | 3 | 4 | 5}
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
      switcher={renderSections("header")}
      // New chat: always pinned, in the one slot between the switcher above and the scroll area
      // below; it has no pin button and cannot be dragged. A page row like the nav's (no fill at
      // rest), told apart by its place and its weight, and lit while on the draft page. Its slot
      // belongs to the pinned area, so it also takes an entry dragged out of the collapsible
      // one. A contributed mode pins nothing here: its create actions are its own sections'.
      {...(inDefault
        ? {
            pinned: (
              <SidebarNavArea drop={nav.areaDrop("pinned")}>
                <NavRow
                  surface="muted"
                  label={S.chat.newSessionMenu}
                  tooltip={newChatTitle}
                  glyph={NEW_CHAT_ICON}
                  active={onDraftPage}
                  onClick={() => {
                    newChat();
                    onNavigate?.();
                  }}
                  className="font-medium"
                />
              </SidebarNavArea>
            ),
          }
        : {})}
      account={accountRow}
      overlays={sections.map(({ id, section: { Overlays } }) =>
        Overlays === undefined ? null : <Overlays key={id} />,
      )}
    >
      {/* The page nav: in development mode the pinned pages, then the collapsible ones folded
          away under the slim toggle (with nothing collapsible there is no toggle); in a
          contributed mode its own rows, all under the toggle. The fold persists. Folded rows
          stay mounted — the fold animates their height to zero and turns them inert. The nav
          and the sections scroll together. Mid-drag, an empty pinned run keeps a row's height
          and a hidden toggle band comes back, so either side can take the drop. */}
      <PageNav
        nav={nav}
        modeItems={inDefault ? null : modeStates[current]!.navItems}
        notes={notes}
        onNavigate={onNavigate}
      />
      {renderSections("body")}
    </SidebarFrame>
  );
  const scoped = sections.reduceRight<ReactNode>(
    (inner, { id, mode, section: { Scope } }) =>
      Scope === undefined ? (
        inner
      ) : (
        <Scope
          key={id}
          current={mode === currentKey}
          {...(onNavigate ? { onNavigate } : {})}
          canDrag={canDrag}
          rootRef={rootRef}
          initialSearchOpen={initialSearchOpen}
        >
          {inner}
        </Scope>
      ),
    frame,
  );
  return <>{scoped}</>;
}
