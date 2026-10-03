/**
 * The built-in browser: the dock's browser panel (browser-panel.tsx), its layer of pages laid over
 * that tab (desktop app only), and the handler that hands each server's browser events to it. The
 * panel is one set of pages per server, shared by every conversation there, not a conversation's
 * view: it reads only which server the conversation lives on, and works on the draft page too.
 */
import { createElement } from "react";
import { Bind, Module } from "@prismshadow/penguin-core/kernel";
import { useChatSession } from "../../lib/chat-session";
import { machineForSession } from "../../lib/session-machines";
import type { DockPanel, PanelOffering } from "../dock/iface";
import { BuiltinBrowserLayer } from "./browser-layer";
import { builtinBrowserUserEvents } from "./browser-events";
import { BuiltinBrowserPanel } from "./browser-panel";
import { isBrowserOffered, subscribeBrowser } from "./browser-store";

/**
 * The browser of the server the conversation's Workspace lives on, found the way the Files
 * panel finds its machine: a Session's from where it lives, a draft's from the folder picked in
 * the composer. This server's wherever neither names a machine.
 */
function BrowserDockPanel(props: { active: boolean }) {
  const { selected, draftWorkspace } = useChatSession();
  const server =
    selected !== null ? machineForSession(selected.sessionId) : (draftWorkspace?.machineId ?? null);
  return createElement(BuiltinBrowserPanel, { ...props, server });
}

/**
 * The dock's browser panel, offered wherever a server this window knows offers a browser it can
 * show — a live
 * question the store answers a moment after startup, so it brings its own change feed.
 */
const browserPanel: DockPanel & PanelOffering = Object.assign(BrowserDockPanel, {
  offered: isBrowserOffered,
  subscribeOffered: subscribeBrowser,
});

@Module({
  contributes: {
    "ShellModule.layers": [{ id: "builtin-browser.layer", order: 30 }],
    "SessionsModule.userEvents": [{ id: "builtin-browser.events", order: 20 }],
    "DockModule.panels": [
      {
        id: "builtin-browser.panel",
        kind: "builtin-browser",
        title: "Browser",
        titleZh: "浏览器",
        icon: "globe",
        order: 70,
      },
    ],
  },
})
export class BuiltinBrowserModule {
  @Bind("builtin-browser.layer") layer = BuiltinBrowserLayer;
  @Bind("builtin-browser.events") events = builtinBrowserUserEvents;
  @Bind("builtin-browser.panel") panel = browserPanel;
}
