/**
 * The dashboard module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `dashboard` section. A new string is added here, to both fragments, and
 * nowhere else — `DashboardStrings` makes a key missing from `dashboardEn` a type error.
 */
export const dashboardZh = {
  title: "看板",
  /** The two counts, read beside their numbers: "3 运行中", "1 待审核". */
  running: "运行中",
  pendingReview: "待审核",
  /** The merged row of auto-created temporary Workspaces, as the sidebar groups them. */
  temporaryWorkspaces: "临时工作区",
  empty: "没有正在运行的会话",
  /** The empty state while a machine did not answer: this server has nothing, the rest is unknown. */
  emptyHere: "本机没有正在运行的会话",
  emptyHint: "有会话正在运行、或自你上次打开后已完成的工作区会显示在这里。",
  loadFailed: "加载失败",
  silentMachines: (n: number) => `${n} 台机器没有应答——那里的会话没有计入。请到机器页面连接它。`,
  /** Tooltip on a row's count: it unfolds into the Sessions it counts. */
  toggleList: "展开或收起这些会话",
};

export type DashboardStrings = typeof dashboardZh;

export const dashboardEn: DashboardStrings = {
  title: "Dashboard",
  /** The two counts, read beside their numbers: "3 running", "1 to review". */
  running: "running",
  pendingReview: "to review",
  /** The merged row of auto-created temporary Workspaces, as the sidebar groups them. */
  temporaryWorkspaces: "Temporary workspaces",
  empty: "Nothing is running",
  /** The empty state while a machine did not answer: this server has nothing, the rest is unknown. */
  emptyHere: "Nothing is running on this server",
  emptyHint:
    "Workspaces with a Session running, or finished since you last opened it, appear here.",
  loadFailed: "Failed to load",
  silentMachines: (n: number) =>
    `${n} machine${n > 1 ? "s" : ""} did not answer — Sessions there are not counted. Connect to it on the Machines page.`,
  /** Tooltip on a row's count: it unfolds into the Sessions it counts. */
  toggleList: "Show or hide these Sessions",
};
