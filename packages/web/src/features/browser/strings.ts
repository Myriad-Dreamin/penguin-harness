/**
 * The browser module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `browser` section. A new string is added here, to both fragments, and
 * nowhere else — `BrowserStrings` makes a key missing from `browserEn` a type error.
 */
export const browserZh = {
  title: "浏览器",
  newTab: "新建浏览器标签",
  address: "地址",
  addressPlaceholder: "localhost:3000 或网址",
  back: "后退",
  forward: "前进",
  reload: "重新加载",
  /** The dock header's detach for a Browser tab: the page moves to a tab of the web browser's own and comes back when it closes. */
  detach: "弹出到新标签页",
  /** The blank tab says what `localhost` means here — it is not the viewer's own machine. */
  startLocal: "输入地址后回车。localhost:<端口> 指本服务端上的端口；也可以输入公网网址。",
  startMachine:
    "输入地址后回车。localhost:<端口> 指此 Workspace 所在机器上的端口；也可以输入公网网址。",
  /** The Ports panel's row action. */
  openInBrowser: "在浏览器标签中打开",
};

export type BrowserStrings = typeof browserZh;

export const browserEn: BrowserStrings = {
  title: "Browser",
  newTab: "New browser tab",
  address: "Address",
  addressPlaceholder: "localhost:3000 or a web address",
  back: "Back",
  forward: "Forward",
  reload: "Reload",
  detach: "Open in a new tab",
  startLocal:
    "Type an address and press Enter. localhost:<port> is a port on this server; a public web address works too.",
  startMachine:
    "Type an address and press Enter. localhost:<port> is a port on the machine this Workspace is on; a public web address works too.",
  openInBrowser: "Open in a browser tab",
};
