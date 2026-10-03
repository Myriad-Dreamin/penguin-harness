/**
 * The session list as the sidebar's development-mode section (lib/sidebar-contributions.ts). The
 * controller lives in the section's scope, which the sidebar keeps mounted for as long as the
 * column is, whatever the mode: switching to another mode and back finds the search, the open
 * groups and any open dialog as they were left. The list itself mounts only in its own mode; the
 * dialogs stay mounted with the scope.
 */
import { createContext, useContext } from "react";
import type { SidebarScopeProps } from "../../lib/sidebar-contributions";
import { useSessionList } from "./use-session-list";
import type { SessionListController } from "./use-session-list";
import { SessionList } from "./session-list";
import { SessionDialogs } from "./session-dialogs";

const ListContext = createContext<SessionListController | null>(null);

function useList(): SessionListController {
  const list = useContext(ListContext);
  if (list === null) throw new Error("the session list rendered outside its section's scope");
  return list;
}

export function SessionListScope({
  children,
  current,
  onNavigate,
  canDrag,
  rootRef,
  initialSearchOpen,
}: SidebarScopeProps) {
  const list = useSessionList({ onNavigate, canDrag, current, rootRef, initialSearchOpen });
  return <ListContext.Provider value={list}>{children}</ListContext.Provider>;
}

export function SessionListOverlays() {
  return <SessionDialogs list={useList()} />;
}

export function SessionListSection({ onNavigate }: { onNavigate?: () => void }) {
  return <SessionList list={useList()} {...(onNavigate ? { onNavigate } : {})} />;
}
