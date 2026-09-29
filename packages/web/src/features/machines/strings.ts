/**
 * The machines module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `machines` section. A new string is added here, to both fragments, and
 * nowhere else — `MachinesStrings` makes a key missing from `machinesEn` a type error.
 */
export const machinesZh = {
  pageTitle: "机器",
  /** Tooltip on the version in the header: what this server would install. */
  imageVersion: (version: string) => `本服务端版本：${version}`,
  noImage:
    "本服务端没有可推送的安装镜像。打包安装或 tarball 安装自带镜像；源码检出则在第一次热推后获得。",
  empty: "~/.ssh/config 中没有可添加的主机。",
  /** The picker: an ssh config can declare hundreds of hosts, so the panel is a fuzzy search over aliases. */
  search: "搜索主机…",
  noMatch: "没有匹配的主机。",
  /** The tag on this server's own row. */
  localTitle: "本服务端",
  noneInUse: "还没有在用的机器。",
  sshHint:
    "能加的机器，是本服务端账户用密钥就能 ssh 上去的主机（在这里的终端里 `ssh <别名>` 能直接进）。请配置 ssh 的人把它写进 ~/.ssh/config。",
  now: "刚刚",
  /** The chevron row at the foot of the picker's list: the matches it has not shown yet. */
  allHosts: (count: number) => `ssh 配置中另有 ${count} 台`,
  expand: "展开",
  fewer: "收起",
  /** The form that appends a host block to this server's ~/.ssh/config. */
  host: {
    addTitle: "新建 ssh 主机",
    /** The one-word verbs on the buttons; the titles above say what they do in full. */
    newVerb: "新建",
    configureVerb: "配置",
    add: "写入 ssh 配置",
    alias: "别名（Host）",
    aliasHint: "一个词，之后 `ssh <别名>` 和这里都用它称呼这台机器。",
    hostName: "地址（HostName）",
    hostNameHint: "IP 或域名。",
    user: "用户（User）",
    userHint: "留空则用本服务端账户的用户名。",
    port: "端口（Port）",
    portHint: "留空为 22。",
    identityFile: "密钥文件（IdentityFile）",
    identityFileHint: "留空则用 ssh 的默认密钥。",
    oneWord: "必须是一个词：不能有空格或 #。",
    portRange: "1 到 65535 之间的整数。",
    exists: "ssh 配置里已有这个别名。",
    added: (alias: string) => `已写入 ${alias}。现在可以从「添加机器…」里启用它。`,
    /** Configuring a host this app wrote: the same form, the alias fixed. */
    configure: "配置 ssh 主机",
    editTitle: "配置 ssh 主机",
    saved: (alias: string) => `已更新 ${alias} 的 ssh 配置。`,
    foreign:
      "这一段不是由 PenguinHarness 写入的，可能带有这里不认识的选项；请直接编辑 ~/.ssh/config。",
  },
  /** The verbs. */
  add: "添加机器…",
  addSelected: (count: number) => `启用这 ${count} 台`,
  use: "启用",
  stopUsing: "停用",
  /** One tap brings every machine behind this build forward (and reconnects it). */
  updateAll: (count: number) => `全部更新（${count}）`,
  /** The floating bar over a selection. */
  selectedCount: (count: number) => `已选 ${count} 台`,
  pickAll: "全选",
  pickNone: "清空",
  /** The one word in a row's State column, keyed by the row's reading; `serving` is this server's. */
  state: {
    serving: "服务中",
    queued: "排队中",
    working: "处理中",
    ready: "已连接",
    failed: "失败",
    installedOnly: "已安装",
    behind: "待更新",
    notConnected: "未连接",
    unreachable: "连不上",
    stopped: "未运行",
    linkedStopped: "已连接，未在提供服务",
    unknown: "未检查",
  },
  /** The stepper's steps, in pipeline order, as the caption under a working row. */
  phase: {
    check: "检查对端…",
    install: "安装程序…",
    handover: "交接构建…",
    restart: "重启服务…",
    connect: "建立连接…",
    sync: "下发模型配置…",
  },
  stepOf: (step: number, total: number) => `第 ${step}/${total} 步`,
  queued: "排队中，等前面的机器处理完。",
  working: "处理中…",
  failedAt: (step: string) => `失败于「${step}」。`,
  /** The forced install a failed job may offer. */
  replaceProgram: "强制安装",
  replaceProgramWhy:
    "无论那台机器上现在是什么，都把这个构建的程序装上去并重启它的服务——正在用它的人会被打断。",
  /** Refusals answered by machine id when a batch is queued. */
  refusedSelf: (alias: string) => `${alias} 就是本服务端所在的机器，无需添加。`,
  refusedUnknown: (alias: string) => `${alias} 不在本服务端的 ssh 配置里。`,
  /** The detail pane. */
  details: "详情",
  detailInstalled: "已安装",
  detailSince: "安装于",
  /** This server's own card says what build it runs and since when, not what was installed. */
  detailVersion: "版本",
  detailStarted: "启动于",
  detailServer: "对端服务",
  detailChecked: "上次检查",
  detailMachineId: "机器 ID",
  detailRoot: "服务端根目录",
  serverUpOn: (port: number) => `运行中，端口 ${port}`,
  /** The progress log's own heading, so the block is not an unlabelled wall of text. */
  output: "输出",
  agentsUnreachable: "那台机器尚未连接——请在「机器」页面使用它",
  adminOnly: "只有管理员可以管理机器。",
};

export type MachinesStrings = typeof machinesZh;

export const machinesEn: MachinesStrings = {
  pageTitle: "Machines",
  imageVersion: (version: string) => `This server: ${version}`,
  noImage:
    "This server has no install image to push. A packaged or tarball install carries one; a source checkout gets one from its first hot push.",
  empty: "No host in ~/.ssh/config left to add.",
  search: "Search hosts…",
  noMatch: "No host matches.",
  localTitle: "this server",
  noneInUse: "No machine in use yet.",
  sshHint:
    "A machine can be added when this server's account can ssh into it by key (`ssh <alias>` works in a terminal here). Whoever set up ssh can put it in ~/.ssh/config.",
  now: "now",
  allHosts: (count: number) => `${count} more in ~/.ssh/config`,
  expand: "Expand",
  fewer: "Collapse",
  host: {
    addTitle: "New ssh host",
    newVerb: "New",
    configureVerb: "Configure",
    add: "Write to ssh config",
    alias: "Alias (Host)",
    aliasHint: "One word; `ssh <alias>` and this page will call the machine by it.",
    hostName: "Address (HostName)",
    hostNameHint: "An IP or a domain name.",
    user: "User",
    userHint: "Empty means this server account's own user name.",
    port: "Port",
    portHint: "Empty means 22.",
    identityFile: "Key file (IdentityFile)",
    identityFileHint: "Empty means ssh's default key.",
    oneWord: "Must be one word: no space, no #.",
    portRange: "A whole number from 1 to 65535.",
    exists: "The ssh config already has this alias.",
    added: (alias: string) => `Wrote ${alias}. Enable it from Add machines….`,
    configure: "Configure ssh host",
    editTitle: "Configure ssh host",
    saved: (alias: string) => `Updated ${alias} in the ssh config.`,
    foreign:
      "This block was not written by PenguinHarness and may carry options this form does not know; edit it in ~/.ssh/config.",
  },
  add: "Add machines…",
  addSelected: (count: number) => `Enable these ${count}`,
  use: "Enable",
  stopUsing: "Disable",
  updateAll: (count: number) => `Update all (${count})`,
  selectedCount: (count: number) => `${count} selected`,
  pickAll: "all",
  pickNone: "none",
  state: {
    serving: "Serving",
    queued: "Queued",
    working: "Working",
    ready: "Connected",
    failed: "Failed",
    installedOnly: "Installed",
    behind: "Behind",
    notConnected: "Offline",
    unreachable: "Unreachable",
    stopped: "Stopped",
    linkedStopped: "Connected, not serving",
    unknown: "Unchecked",
  },
  phase: {
    check: "Checking the machine…",
    install: "Installing the program…",
    handover: "Handing over the build…",
    restart: "Restarting its server…",
    connect: "Connecting…",
    sync: "Handing over the Model config…",
  },
  stepOf: (step: number, total: number) => `step ${step} of ${total}`,
  queued: "Waiting its turn behind the machines before it.",
  working: "Working…",
  failedAt: (step: string) => `Failed at "${step}".`,
  replaceProgram: "Force install",
  replaceProgramWhy:
    "Whatever is on that machine now, put this build's program there and restart its server — anyone using it will be interrupted.",
  refusedSelf: (alias: string) => `${alias} is the machine this server runs on; nothing to add.`,
  refusedUnknown: (alias: string) => `${alias} is not in this server's ssh config.`,
  details: "Details",
  detailInstalled: "Installed",
  detailSince: "Since",
  detailVersion: "Version",
  detailStarted: "Started",
  detailServer: "Server",
  detailChecked: "Checked",
  detailMachineId: "Machine id",
  detailRoot: "Server root",
  serverUpOn: (port: number) => `up on port ${port}`,
  output: "Output",
  agentsUnreachable: "That machine is not connected — use it from the Machines page",
  adminOnly: "Only an admin can manage machines.",
};
