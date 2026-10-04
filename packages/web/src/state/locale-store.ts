/**
 * The interface language as an external store: the person's preference (zh / en / system) and
 * the language it resolves to. It changes only in `setPref` (called from an event handler) and on
 * the browser's `languagechange` while the preference is "system" — never while React renders, so
 * a render React throws away cannot publish a value nobody committed. React reads it with
 * `useSyncExternalStore` (state/locale.tsx); the settings module hands its `get` / `subscribe`
 * to plugins as the `Language` interface (plugin-types.ts).
 *
 * Every member is a closure, not a method, so `useSyncExternalStore(store.subscribe, store.get)`
 * can take them unbound.
 */
export type LangPref = "zh" | "en" | "system";
export type Locale = "zh" | "en";

/** Where the store keeps the preference and learns the device language; the browser's by default. */
export interface LocaleEnv {
  readPref(): string | null;
  writePref(pref: LangPref): void;
  systemLanguage(): string | undefined;
  /** Calls `onChange` when the device language changes; returns the unsubscribe. */
  onSystemChange(onChange: () => void): () => void;
}

export interface LocaleStore {
  /** The resolved language: a snapshot, the same value until a listener has been told otherwise. */
  get(): Locale;
  /** The preference as the person picked it (Settings shows "system", not what it resolved to). */
  pref(): LangPref;
  setPref(next: LangPref): void;
  /** Called with each new resolved language, once per change; returns the unsubscribe. */
  subscribe(onChange: (value: Locale) => void): () => void;
  /** Called after any change, the preference included; returns the unsubscribe. */
  watch(onChange: () => void): () => void;
}

/**
 * Device language → UI language (default when no stored preference exists; also applies on the
 * login page): a language tag starting with zh (zh-CN/zh-TW…) → zh; anything else or
 * unavailable → falls back to en.
 */
export function resolveSystemLocale(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

const STORAGE_KEY = "penguin.lang";

/**
 * The browser's. Storage that throws (blocked site data, some private windows) reads as no
 * preference and drops the write: the picked language still applies until the page reloads.
 */
export const browserLocaleEnv: LocaleEnv = {
  readPref: () => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  writePref: (pref) => {
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      // Not kept across a reload; see above.
    }
  },
  systemLanguage: () => globalThis.navigator?.language,
  onSystemChange: (onChange) => {
    window.addEventListener("languagechange", onChange);
    return () => window.removeEventListener("languagechange", onChange);
  },
};

export function createLocaleStore(env: LocaleEnv = browserLocaleEnv): LocaleStore {
  const watchers = new Set<() => void>();
  // Read on first use, not at import: a module that merely imports the store touches no storage.
  let state: { pref: LangPref; locale: Locale } | null = null;
  let stopSystem: (() => void) | null = null;

  const resolve = (pref: LangPref): Locale =>
    pref === "system" ? resolveSystemLocale(env.systemLanguage()) : pref;
  const current = () => {
    if (state === null) {
      const stored = env.readPref();
      const pref: LangPref =
        stored === "zh" || stored === "en" || stored === "system" ? stored : "system";
      state = { pref, locale: resolve(pref) };
    }
    return state;
  };
  const update = (pref: LangPref) => {
    const prev = current();
    const next = { pref, locale: resolve(pref) };
    if (next.pref === prev.pref && next.locale === prev.locale) return;
    state = next;
    for (const fn of [...watchers]) fn();
  };

  const watch = (onChange: () => void) => {
    watchers.add(onChange);
    stopSystem ??= env.onSystemChange(() => {
      if (current().pref === "system") update("system");
    });
    return () => {
      watchers.delete(onChange);
      if (watchers.size === 0 && stopSystem !== null) {
        stopSystem();
        stopSystem = null;
      }
    };
  };

  return {
    get: () => current().locale,
    pref: () => current().pref,
    setPref: (next) => {
      env.writePref(next);
      update(next);
    },
    subscribe: (onChange) => {
      let last = current().locale;
      return watch(() => {
        const now = current().locale;
        if (now === last) return;
        last = now;
        onChange(now);
      });
    },
    watch,
  };
}

/** The page's one store, read by LocaleProvider and provided to plugins by the settings module. */
export const localeStore = createLocaleStore();
