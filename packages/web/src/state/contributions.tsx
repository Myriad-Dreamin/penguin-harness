/**
 * What the server's modules and plugins contribute to this App: GET /api/contributions,
 * fetched once per signed-in user and held for the whole tree.
 *
 * Two things come out of it. `pages` are the server's page contributions that can mount beside
 * the app's own (shell/page-table.ts `contributedPages`) — the router mounts them, so a page a
 * pushed platform or a plugin contributes opens as long as this build carries its renderer. `surfaces` is the list of session surfaces (see the chat page's
 * session-surface-view.tsx): what "New chat" offers beyond the conversation, and what a
 * Session of that kind is drawn with. `quickStarts` are module plugins' demos, which the
 * Plugins page pre-fills into a draft; `refresh` re-reads everything after a plugin change.
 *
 * Until the fetch answers — and if it never does — the App is exactly what it is today:
 * its own pages only, no surfaces. A contributed page is never load-bearing for signing in.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ContributionsResponse, SessionSurfaceSummary } from "@prismshadow/penguin-server/api";
import * as api from "../api/endpoints";
import { contributedPages, type PageEntry } from "../shell/page-table";
import { useShellPages } from "../shell";
import { useAuth } from "./auth";
import type { Locale } from "./locale";

interface ContributionsValue {
  /** The contributed pages to mount beside the app's own (none until the server answers). */
  pages: readonly PageEntry[];
  surfaces: readonly SessionSurfaceSummary[];
  quickStarts: ContributionsResponse["quickStarts"];
  /** Whether the server has answered (false = the app's own pages only, so far). */
  loaded: boolean;
  /** Re-reads the contributions (after a plugin is installed or removed); answers the new response, or null when the read failed. */
  refresh: () => Promise<ContributionsResponse | null>;
}

const LOCAL: ContributionsValue = {
  pages: [],
  surfaces: [],
  quickStarts: [],
  loaded: false,
  refresh: async () => null,
};

const ContributionsContext = createContext<ContributionsValue>(LOCAL);

export function ContributionsProvider({
  builtinRenderers,
  children,
}: {
  /** The page renderers this build carries (the router's registry); a contributed page naming another is skipped. */
  builtinRenderers: ReadonlySet<string>;
  children: ReactNode;
}) {
  const userId = useAuth().user?.userId ?? null;
  const local = useShellPages();
  const [remote, setRemote] = useState<ContributionsResponse | null>(null);
  useEffect(() => {
    if (userId === null) {
      setRemote(null);
      return;
    }
    let alive = true;
    api.getContributions().then(
      (res) => {
        if (alive) setRemote(res);
      },
      () => {
        // Nothing to fold in: the App stays on its own pages, which make a complete App.
      },
    );
    return () => {
      alive = false;
    };
  }, [userId]);
  const refresh = useCallback(async () => {
    try {
      const res = await api.getContributions();
      setRemote(res);
      return res;
    } catch {
      return null;
    }
  }, []);
  const value = useMemo<ContributionsValue>(
    () =>
      remote === null
        ? { ...LOCAL, refresh }
        : {
            pages: contributedPages(local, remote.pages, builtinRenderers),
            surfaces: remote.sessionSurfaces ?? [],
            quickStarts: remote.quickStarts ?? [],
            loaded: true,
            refresh,
          },
    [remote, local, builtinRenderers, refresh],
  );
  return <ContributionsContext.Provider value={value}>{children}</ContributionsContext.Provider>;
}

export function useContributions(): ContributionsValue {
  return useContext(ContributionsContext);
}

/** The "New chat" entry's text for a surface, in the interface's language. */
export function surfaceLabel(surface: SessionSurfaceSummary, locale: Locale): string {
  return locale === "zh" ? (surface.labelZh ?? surface.label) : surface.label;
}
