/**
 * Settings: the shortcut runtime, which reconciles the shortcut mirror with the account's prefs,
 * and the Settings dialog, opened on request (settings-layer.tsx). It also provides the
 * interface language the person picks there (`Language`, plugin-types.ts) — the one piece of the
 * app's state a plugin page needs for its own words: the store's read half only, so a plugin can
 * follow the language but not set it.
 */
import { Bind, Module, Provide } from "@prismshadow/penguin-core/kernel/runtime";
import { Language } from "../../plugin-types";
import { localeStore } from "../../state/locale-store";
import { ShortcutRuntime } from "./shortcut-runtime";
import { SettingsLayer } from "./settings-layer";

@Module({
  contributes: {
    "ShellModule.layers": [
      { id: "settings.shortcuts", order: 20 },
      { id: "settings.dialog", order: 25 },
    ],
  },
})
export class SettingsModule {
  @Provide() language: Language = {
    get: localeStore.get,
    subscribe: localeStore.subscribe,
  };
  @Bind("settings.shortcuts") shortcuts = ShortcutRuntime;
  @Bind("settings.dialog") dialog = SettingsLayer;
}
