/**
 * Language context over the interface-language store (locale-store.ts): zh / en / system, the
 * last tracking navigator.language. On a switch the provider swaps the active dictionary
 * (setActiveStrings, idempotent) before its children render, then remounts the whole tree keyed on
 * locale so every `S.x` read reflects the new language. The shared UI package's accessibility
 * fallbacks (a close cross's name, a "Copied" announcement) are handed the same language here.
 */
import { createContext, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { UiStringsProvider } from "@prismshadow/penguin-ui";
import { setActiveStrings, zh } from "../lib/strings";
import { en } from "../lib/strings-en";
import { uiStringsFor } from "../lib/ui-strings";
import { localeStore } from "./locale-store";
import type { LangPref, Locale } from "./locale-store";

export type { LangPref, Locale } from "./locale-store";

interface LocaleContextValue {
  lang: LangPref;
  locale: Locale;
  setLang: (lang: LangPref) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(localeStore.watch, localeStore.pref, localeStore.pref);
  const locale = useSyncExternalStore(localeStore.watch, localeStore.get, localeStore.get);
  // Switch the active dictionary during render (idempotent assignment): children are keyed on
  // locale and render after this component, so they always read the post-switch dictionary.
  setActiveStrings(locale === "en" ? en : zh);

  return (
    <LocaleContext.Provider value={{ lang, locale, setLang: localeStore.setPref }}>
      <UiStringsProvider strings={uiStringsFor(locale)}>{children}</UiStringsProvider>
    </LocaleContext.Provider>
  );
}

/**
 * Language scope: a remount boundary keyed on locale. Placed **inside** AuthProvider —
 * switching language only rebuilds the UI tree, not the auth state (otherwise user=undefined
 * would cause a full-screen flash).
 */
export function LocaleScope({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  return (
    <div key={locale} className="contents">
      {children}
    </div>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}
