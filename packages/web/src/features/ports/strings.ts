/**
 * The ports module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `ports` section. A new string is added here, to both fragments, and
 * nowhere else — `PortsStrings` makes a key missing from `portsEn` a type error.
 */
export const portsZh = {
  panelTitle: "端口",
  /** The right-hand plug of every cable: this server, where the browser is talking to. */
  here: "本地",
  /** The left-hand plug while the machine's name is not known yet. */
  machine: "机器",
  /** The form's own cable reads "<machine> :[port] ──▶ 本地 :[port]"; these name the two fields. */
  formTitle: "新的转发",
  autoPort: "自动",
  /** A Workspace on this server has nothing to forward. */
  localNote: "此 Workspace 在本服务端上，端口可直接经 localhost 访问。",
  adminOnly: "只有管理员可以转发机器的端口。",
  empty: "还没有转发的端口。",
  remotePort: "远端端口",
  localPort: "本地端口（自动）",
  forward: "转发",
  copyAddress: "复制本地地址",
  open: "在浏览器中打开",
  remove: "删除转发",
  invalidRemotePort: "远端端口须为 1–65535 的整数。",
  invalidLocalPort: "本地端口须为 1024–65535 的整数。",
  /** The status, in the words of whoever carries the forward. */
  statusOnSession: "已加到 ssh 会话上",
  statusPending: "等待 ssh 应答",
  statusNotConnected: "机器未连接——连接后自动生效",
  statusFailed: (detail: string) => `失败：${detail}`,
  /** The form's arrow, which flips the direction; the titles say which way it points now. */
  flipDirection: "切换方向",
  directionIn: "机器 → 本地：把机器上的端口带到本地",
  directionOut: "本地 → 机器：把本地端口送到机器上",
  /** An out forward's machine port, left blank: the same number as ours. */
  samePort: "同号",
  /** A machine's Ports page. */
  machineTitle: (alias: string) => `${alias} 的端口转发`,
  backToMachines: "机器",
  machineEmpty: "这台机器还没有端口转发。在位于它上面的对话里，从「端口」面板添加。",
  /** The verb on a machine's card. */
  verb: "端口",
  verbTitle: "查看这台机器的全部端口转发",
};

export type PortsStrings = typeof portsZh;

export const portsEn: PortsStrings = {
  panelTitle: "Ports",
  here: "here",
  machine: "machine",
  formTitle: "New forward",
  autoPort: "auto",
  localNote: "This Workspace is on this server: its ports are reachable on localhost as they are.",
  adminOnly: "Only an admin can forward a machine's port.",
  empty: "No forwarded ports yet.",
  remotePort: "Remote port",
  localPort: "Local port (auto)",
  forward: "Forward",
  copyAddress: "Copy local address",
  open: "Open in browser",
  remove: "Remove forward",
  invalidRemotePort: "The remote port must be a whole number from 1 to 65535.",
  invalidLocalPort: "The local port must be a whole number from 1024 to 65535.",
  statusOnSession: "On the ssh session",
  statusPending: "Waiting for ssh to answer",
  statusNotConnected: "Machine not connected — applied once it is",
  statusFailed: (detail: string) => `Failed: ${detail}`,
  flipDirection: "Flip direction",
  directionIn: "Machine → here: bring a port of the machine's here",
  directionOut: "Here → machine: send a port of ours there",
  samePort: "same",
  machineTitle: (alias: string) => `Port forwards of ${alias}`,
  backToMachines: "Machines",
  machineEmpty:
    "No port forwards on this machine yet. Add one from the Ports panel of a conversation on it.",
  verb: "Ports",
  verbTitle: "Every port forward of this machine",
};
