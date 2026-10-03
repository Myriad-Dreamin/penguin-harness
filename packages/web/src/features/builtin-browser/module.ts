/**
 * The built-in browser: the dock's browser panel (browser-panel.tsx), its layer of pages laid over
 * that tab (desktop app only), and the handler that hands this server's browser events to it. The
 * panel is one set of pages shared by every conversation, not a conversation's view, so it reads
 * no conversation and works on the draft page too.
 */
import { Bind, Module } from "@prismshadow/penguin-core/kernel";
import { BuiltinBrowserLayer } from "./browser-layer";
import { builtinBrowserUserEvents } from "./browser-events";
import { BuiltinBrowserPanel } from "./browser-panel";

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
  @Bind("builtin-browser.panel") panel = BuiltinBrowserPanel;
}
