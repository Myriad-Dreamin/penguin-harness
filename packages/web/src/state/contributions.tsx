/**
 * What the server's modules and plugins contribute to this App: GET /api/contributions,
 * fetched once per signed-in user and held for the whole tree.
 *
 * Two things come out of it. `pages` is the local manifest with the server's page
 * contributions folded in (lib/pages.ts `mergePages`) — the router mounts the result, so a
 * page a pushed platform or a plugin contributes opens, and one whose renderer this build does
 * not carry says so at its URL. `surfaces` is the list of session surfaces (see the chat page's
 * session-surface-view.tsx): what "New chat" offers beyond the conversation, and what a
 * Session of that kind is drawn with. `quickStarts` are module plugins' demos, which the
 * Plugins page pre-fills into a draft; `refresh` re-reads everything after a plugin change.
 *
 * Until the fetch answers — and if it never does — the App is exactly what it is today:
 * local pages only, no surfaces. A contributed page is never load-bearing for signing in.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import type {
  ContributionsResponse,
  SessionInfo,
  SessionSurfaceSummary,
} from "@prismshadow/penguin-server/api";
import * as api from "../api/endpoints";
import { PAGES, mergePages, type PageEntry } from "../lib/pages";
import { useAuth } from "./auth";
import type { Locale } from "./locale";

/** What a session surface renderer is drawn with: the routed Session and the surface it carries. */
export interface SurfaceRendererProps {
  session: SessionInfo;
  surface: SessionSurfaceSummary;
}

/** The surface renderers this build carries, by name (src/renderers.gen.ts). */
export type SurfaceRenderers = Readonly<Record<string, ComponentType<SurfaceRendererProps>>>;

interface ContributionsValue {
  pages: readonly PageEntry[];
  surfaces: readonly SessionSurfaceSummary[];
  /** The renderers a surface's `builtin` may name; a name missing here renders as unavailable. */
  surfaceRenderers: SurfaceRenderers;
  quickStarts: ContributionsResponse["quickStarts"];
  /** Whether the server has answered (false = local manifest only, so far). */
  loaded: boolean;
  /** Re-reads the contributions (after a plugin is installed or removed); answers the new response, or null when the read failed. */
  refresh: () => Promise<ContributionsResponse | null>;
}

const LOCAL: ContributionsValue = {
  pages: PAGES,
  surfaces: [],
  surfaceRenderers: {},
  quickStarts: [],
  loaded: false,
  refresh: async () => null,
};

const ContributionsContext = createContext<ContributionsValue>(LOCAL);

export function ContributionsProvider({
  surfaceRenderers,
  children,
}: {
  surfaceRenderers: SurfaceRenderers;
  children: ReactNode;
}) {
  const userId = useAuth().user?.userId ?? null;
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
        // Nothing to fold in: the App stays on its local manifest, which is a complete App.
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
        ? { ...LOCAL, surfaceRenderers, refresh }
        : {
            pages: mergePages(PAGES, remote.pages),
            surfaces: remote.sessionSurfaces ?? [],
            surfaceRenderers,
            quickStarts: remote.quickStarts ?? [],
            loaded: true,
            refresh,
          },
    [remote, surfaceRenderers, refresh],
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
