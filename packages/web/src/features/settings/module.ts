/**
 * Settings: the shortcut runtime, which reconciles the shortcut mirror with the account's prefs,
 * and the Settings dialog, opened on request (settings-layer.tsx). It also provides the
 * interface language the person picks there (`Language`, plugin-types.ts), read-only — the one
 * piece of the app's state a plugin page needs for its own words.
 */
import { Bind, Module, Provide } from "@prismshadow/penguin-core/kernel";
import { Language } from "../../plugin-types";
import { activeLocale } from "../../state/locale";
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
  @Provide() language: Language = { current: activeLocale };
  @Bind("settings.shortcuts") shortcuts = ShortcutRuntime;
  @Bind("settings.dialog") dialog = SettingsLayer;
}
