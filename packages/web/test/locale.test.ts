/**
 * locale-store.ts unit tests: device language resolution (language follows
 * navigator.language when no stored preference exists; language/theme
 * initialization does not depend on login state and also applies on the
 * login page), and the store the `Language` interface is: a committed value
 * and one notification per change.
 */
import { describe, expect, it } from "vitest";
import { createLocaleStore, resolveSystemLocale } from "../src/state/locale-store";
import type { LocaleEnv } from "../src/state/locale-store";

describe("resolveSystemLocale (navigator.language → UI language)", () => {
  it("zh prefix (any case or region variant) → zh", () => {
    expect(resolveSystemLocale("zh-CN")).toBe("zh");
    expect(resolveSystemLocale("ZH-TW")).toBe("zh");
  });

  it("non-Chinese or unavailable → English fallback", () => {
    expect(resolveSystemLocale("en-US")).toBe("en");
    expect(resolveSystemLocale(undefined)).toBe("en");
  });
});

/** A stand-in for the browser: a stored preference, a device language, and its change event. */
function fakeEnv(stored: string | null, device: string) {
  const env = {
    stored,
    device,
    systemListeners: new Set<() => void>(),
    readPref: () => env.stored,
    writePref: (pref: string) => {
      env.stored = pref;
    },
    systemLanguage: () => env.device,
    onSystemChange: (onChange: () => void) => {
      env.systemListeners.add(onChange);
      return () => env.systemListeners.delete(onChange);
    },
  } satisfies LocaleEnv & Record<string, unknown>;
  return env;
}

describe("createLocaleStore (the Language interface's store)", () => {
  it("a switch notifies each subscriber once, with the value get() then returns", () => {
    const env = fakeEnv("zh", "en-US");
    const store = createLocaleStore(env);
    const seen: string[] = [];
    store.subscribe((value) => seen.push(`${value}:${store.get()}`));
    store.setPref("en");
    expect(seen).toEqual(["en:en"]);
    expect(store.get()).toBe("en");
    expect(env.stored).toBe("en");
  });

  it("a preference that resolves to the same language changes no subscriber's value", () => {
    const store = createLocaleStore(fakeEnv("zh", "zh-CN"));
    const seen: string[] = [];
    let watched = 0;
    store.subscribe((value) => seen.push(value));
    store.watch(() => watched++);
    store.setPref("system");
    expect(seen).toEqual([]);
    // The preference did change: Settings, which shows it, is told.
    expect(watched).toBe(1);
    expect(store.pref()).toBe("system");
  });

  it("in system mode follows the device language; unsubscribing stops the notices", () => {
    const env = fakeEnv(null, "zh-CN");
    const store = createLocaleStore(env);
    expect(store.get()).toBe("zh");
    const seen: string[] = [];
    const stop = store.subscribe((value) => seen.push(value));
    env.device = "en-GB";
    for (const fn of env.systemListeners) fn();
    expect(seen).toEqual(["en"]);
    stop();
    expect(env.systemListeners.size).toBe(0);
    store.setPref("zh");
    expect(seen).toEqual(["en"]);
  });

  it("touches no storage until it is first read", () => {
    let reads = 0;
    const env = fakeEnv("en", "zh-CN");
    createLocaleStore({ ...env, readPref: () => (reads++, env.stored) });
    expect(reads).toBe(0);
  });
});
