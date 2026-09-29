/**
 * The dock module's public entry: everything outside this directory reaches it through here
 * (test/module-boundaries.test.ts fails on an import that goes around it).
 */
export { setCloseGuard } from "./close-guard";
export { DockLauncher } from "./dock-launcher";
export {
  launcherHiddenVersion,
  readLauncherHidden,
  subscribeLauncherHidden,
  writeLauncherHidden,
} from "./dock-launcher-state";
export { DockPanel } from "./dock-panel";
export {
  addBrowserTab,
  adoptDockScope,
  closedDockView,
  currentDockScope,
  dockActiveKey,
  dockTabs,
  type DockPosition,
  dockVersion,
  dockViews,
  isDockVisible,
  isTabShown,
  openPanel,
  PANEL_KINDS,
  panelDock,
  type PanelKind,
  pruneTerminalTabs,
  removeTab,
  restoreBrowserTab,
  setDockScope,
  subscribeDock,
  tabKey,
  toggleDock,
} from "./dock-state";
export { setDockCwd } from "./dock-terminal";
export { panelLabel } from "./panel-meta";
export { DOCK_TRANSITION_MS, useDockMount } from "./use-dock-mount";
export { usePointerDrag } from "./use-pointer-drag";
