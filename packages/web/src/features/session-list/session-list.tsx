/**
 * The development-mode session list, under the sidebar's page nav: its header (search, grouping
 * and sort, the mode-dependent create button), the parked drafts, then the conversations in one
 * of three groupings — by Workspace (the default; temporary workspaces merged into one trailing
 * group, a header "+" starting a draft in that Workspace), by Agent (every Agent, empty groups
 * included), or by time (last day / last month / earlier on last activity, with the Subagents /
 * Scheduled / Archived folders and the paging row below them as one Project-wide set). The
 * grouping and each Project's group collapse and pin state persist in localStorage. Groups can
 * be pinned from the header's hover pin toggle: pinned groups sort before unpinned within their
 * mode, keeping each partition's own order — the time buckets excepted, whose order IS the
 * timeline and which therefore carry no pin. Conversations can be pinned too (row context menu;
 * persisted per Project): pinned rows bubble to the top of their group's active list. Each
 * row's trailing slot shows the compact last-active time at rest and swaps to archive + delete
 * on hover/focus; the full set (pin, rename, archive, delete) opens as a context menu on
 * right-click, Shift+F10, or a press-and-hold on touch.
 * The list is the user's OWN conversations only: an organization's desk, ticket and
 * sub-sessions are left out of its fetches and totals by the server, and out of every group,
 * bucket and folder here should one still arrive.
 */
import { useNavigate } from "react-router";
import {
  Dropdown,
  GlyphIcon,
  GroupHeader,
  ICONS,
  ICON_SIZE,
  Menu,
  MenuLabel,
  MenuRadioItem,
  MenuSeparator,
  SearchInput,
  SidebarControl,
  SidebarListHeader,
} from "@prismshadow/penguin-ui";
import { S } from "../../lib/strings";
import { useShortcutTitle } from "../../lib/shortcuts/use-keymap";
import { NEW_CHAT_ICON, glyphOf } from "../../lib/nav-icons";
import { GROUP_MODE_ICONS, SORT_MODE_ICONS } from "../../components/ui/group-list";
import { useShellPages } from "../../shell";
import { WorkspaceSelect } from "../chat";
import { DraftRow } from "./draft-row";
import { AgentGroups } from "./group-by-agent";
import { WorkspaceGroups } from "./group-by-workspace";
import { TimeGroups } from "./group-by-time";
import type { SessionListController } from "./use-session-list";

/**
 * Mode-dependent create glyph: the entity's own icon (folder / robot) shrunk toward
 * the top-left, with a plus badge in the freed bottom-right corner — no knockout disc
 * needed (a background-colored punch would mismatch the hover pill), so it stays
 * legible at icon size in both themes. Stroke style matches the shared Icon set.
 */
function AddBadgeIcon({ base, size = 15 }: { base: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g transform="translate(-1 -1) scale(0.82)">
        <path d={base} />
      </g>
      <path d="M18.5 15.5v6M15.5 18.5h6" strokeWidth="2" />
    </svg>
  );
}

/** Collapse-state key of the parked-drafts group ("\0" keeps it clear of Agent ids and Workspace paths). */
const DRAFTS_GROUP_KEY = "\0drafts";

export function SessionList({
  list,
  onNavigate,
}: {
  list: SessionListController;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  /** The Agents page's own glyph, under the create button's plus in agent grouping. */
  const agentsGlyph = glyphOf(useShellPages().find((p) => p.key === "agents")?.icon);
  const searchTitle = useShortcutTitle(S.chat.searchSessions, "sessions.search");
  const {
    groupMode,
    setGroupMode,
    searchOpen,
    setSearchOpen,
    searchInputRef,
    searchQuery,
    setSearchQuery,
    closeSearch,
    searching,
    hasSearchMatches,
    listSettingsOpen,
    setListSettingsOpen,
    canDrag,
    sortMode,
    setSortMode,
    newEntity,
    newEntityLabel,
    newChat,
    currentProjectId,
    addWorkspace,
    shownDrafts,
    collapsedGroups,
    toggleGroup,
    activeSessionId,
    go,
    setDeletingDraft,
  } = list;
  return (
    <>
      {/* The list's header: its label and the controls (icon + tooltip family) — search, list
              settings (grouping + sort radios), and the mode-dependent create button (the created
              object follows the grouping mode). The search opens in place, over the label's
              column, so it costs no extra row; the magnifier becomes the field's leading glyph.
              No ruled separator at this boundary — the nav toggle above is the seam. The label
              names the grouping: workspaces, agents, or the recent ones by time. */}
      <SidebarListHeader label={S.chat.sessionListByMode[groupMode]} searching={searchOpen}>
        {searchOpen ? (
          /* Expanded field: the magnifier, the input and the clear ×, one bordered
             box filling the row (its width rides the column tween). Esc and × both
             collapse it and drop the filter, which is why the × stays while it is empty. */
          <SearchInput
            ref={searchInputRef}
            icon
            alwaysClearable
            autoFocus
            className="min-w-0 flex-1"
            value={searchQuery}
            onChange={setSearchQuery}
            onClear={closeSearch}
            placeholder={S.chat.searchSessionsPlaceholder}
            aria-label={S.chat.searchSessions}
            clearLabel={S.chat.searchClear}
          />
        ) : (
          <SidebarControl
            label={S.chat.searchSessions}
            tooltip={searchTitle}
            glyph={ICONS.search}
            onClick={() => setSearchOpen(true)}
          />
        )}
        <Dropdown
          open={listSettingsOpen}
          setOpen={setListSettingsOpen}
          portal={{ direction: "down", align: "right" }}
          menuClass="w-40"
          button={
            <SidebarControl
              label={S.chat.listSettings}
              glyph={ICONS.slidersHorizontal}
              active={listSettingsOpen}
              aria-haspopup="menu"
              aria-expanded={listSettingsOpen}
              onClick={() => setListSettingsOpen(!listSettingsOpen)}
            />
          }
        >
          <Menu density="sm">
            <MenuLabel>{S.chat.groupModeSection}</MenuLabel>
            <MenuRadioItem
              glyph={GROUP_MODE_ICONS.workspace}
              label={S.chat.groupByWorkspace}
              checked={groupMode === "workspace"}
              onSelect={() => {
                setGroupMode("workspace");
                setListSettingsOpen(false);
              }}
            />
            <MenuRadioItem
              glyph={GROUP_MODE_ICONS.agent}
              label={S.chat.groupByAgent}
              checked={groupMode === "agent"}
              onSelect={() => {
                setGroupMode("agent");
                setListSettingsOpen(false);
              }}
            />
            <MenuRadioItem
              glyph={GROUP_MODE_ICONS.time}
              label={S.chat.groupByTime}
              checked={groupMode === "time"}
              onSelect={() => {
                setGroupMode("time");
                setListSettingsOpen(false);
              }}
            />
            <MenuSeparator />
            <MenuLabel>{S.chat.sortModeSection}</MenuLabel>
            {/* Manual order is offered only where a drag can actually happen (see canDrag). */}
            {canDrag && (
              <MenuRadioItem
                glyph={SORT_MODE_ICONS.manual}
                label={S.chat.sortManual}
                checked={sortMode === "manual"}
                onSelect={() => {
                  setSortMode("manual");
                  setListSettingsOpen(false);
                }}
              />
            )}
            <MenuRadioItem
              glyph={SORT_MODE_ICONS.recent}
              label={S.chat.sortRecent}
              checked={sortMode === "recent"}
              onSelect={() => {
                setSortMode("recent");
                setListSettingsOpen(false);
              }}
            />
          </Menu>
        </Dropdown>
        {/* Mode-dependent create — 具体新建的对象按分组方式决定, the icon following
            suit (folder+ / robot+, a bottom-right plus badge on the entity's glyph):
            agent grouping opens the Agents page's existing create dialog (route
            state); workspace grouping opens the SAME directory-browse menu the
            draft's workspace picker uses — the picked directory registers as a
            workspace group immediately, Sessions or not. Time buckets are not
            something to create into, so that mode starts a plain new conversation
            and wears the compose glyph without a plus badge. */}
        {newEntity === "agent" ? (
          <SidebarControl
            label={newEntityLabel}
            glyph={<AddBadgeIcon base={agentsGlyph} />}
            onClick={() => {
              navigate("/agents", { state: { create: true } });
              onNavigate?.();
            }}
          />
        ) : newEntity === "chat" ? (
          <SidebarControl
            label={newEntityLabel}
            glyph={<GlyphIcon d={NEW_CHAT_ICON} size={ICON_SIZE.iconButton} />}
            onClick={() => newChat()}
          />
        ) : (
          <WorkspaceSelect
            // Remount per Project: the picker browses lazily and caches the listing
            // for its lifetime, so a long-lived instance would show the PREVIOUS
            // Project's directories after a switch — and register that path into the
            // new Project's registry.
            key={currentProjectId ?? "no-project"}
            projectId={currentProjectId ?? ""}
            workspace=""
            onChange={addWorkspace}
            // The sidebar's + is where a workspace is CREATED, so it is where the
            // machine is chosen; the draft and settings pickers edit a workspace that
            // already has one.
            chooseMachine
            clearable={false}
            trigger={(open, toggle) => (
              <SidebarControl
                label={newEntityLabel}
                glyph={<AddBadgeIcon base={ICONS.folder} />}
                active={open}
                aria-expanded={open}
                onClick={toggle}
              />
            )}
          />
        )}
      </SidebarListHeader>

      {/* Parked draft conversations (unsent new chats, newest first): pinned above both
          grouping modes — they belong to no Agent or Workspace until sent. Hidden
          entirely while there are none; the search filter applies to their titles too. */}
      {shownDrafts.length > 0 && (
        <div className="pt-2.5">
          <GroupHeader
            open={searching || !collapsedGroups.has(DRAFTS_GROUP_KEY)}
            onToggle={() => toggleGroup(DRAFTS_GROUP_KEY)}
            glyph={NEW_CHAT_ICON}
            label={S.chat.draftGroup}
            uppercase
            count={shownDrafts.length}
          />
          {(searching || !collapsedGroups.has(DRAFTS_GROUP_KEY)) && (
            <ul className="space-y-px">
              {shownDrafts.map((entry) => (
                <DraftRow
                  key={entry.id}
                  entry={entry}
                  active={entry.id === activeSessionId}
                  onOpen={() => go(`/chat/${entry.id}`)}
                  onDelete={() => setDeletingDraft(entry)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {groupMode === "agent" ? <AgentGroups list={list} /> : null}
      {groupMode === "workspace" ? <WorkspaceGroups list={list} /> : null}
      {groupMode === "time" ? <TimeGroups list={list} /> : null}

      {/* Quiet no-match line: the search is live and nothing — drafts included — hit. */}
      {searching && !hasSearchMatches && (
        <p className="px-2.5 pt-3 text-xs text-gray-400 dark:text-gray-600">
          {S.chat.searchNoMatches}
        </p>
      )}
    </>
  );
}
