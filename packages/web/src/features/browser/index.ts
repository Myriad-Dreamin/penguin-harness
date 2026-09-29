/**
 * The browser module's public entry: everything outside this directory reaches it through here
 * (test/module-boundaries.test.ts fails on an import that goes around it).
 */
export { detachBrowser } from "./browser-detach";
export { addressOnSite, BrowserTab } from "./browser-tab";
export { forgetBrowserTab, newBrowserTab } from "./browser-tabs";
export { browserThemeMessage } from "./browser-theme";
