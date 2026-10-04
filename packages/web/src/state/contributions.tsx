/**
 * The server's page contributions that can mount beside the app's own (shell/page-table.ts
 * `contributedPages`), read from GET /api/contributions once per signed-in user — the router
 * mounts them, so an iframe page a pushed platform or a plugin contributes opens. The session
 * surfaces and the quick starts come from the shell's own read (shell/contributions.tsx).
 *
 * Until the fetch answers — and if it never does — the App is exactly what it is today:
 * its own pages only. A contributed page is never load-bearing for signing in.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ContributionsResponse } from "@prismshadow/penguin-server/api";
import * as api from "../api/endpoints";
import { contributedPages, type PageEntry } from "../shell/page-table";
import { useShellPages } from "../shell";
import { useAuth } from "./auth";

interface ContributionsValue {
  /** The contributed pages to mount beside the app's own (none until the server answers). */
  pages: readonly PageEntry[];
  /** Whether the server has answered (false = the app's own pages only, so far). */
  loaded: boolean;
}

const LOCAL: ContributionsValue = { pages: [], loaded: false };

const ContributionsContext = createContext<ContributionsValue>(LOCAL);

/**
 * The builtin renderers a contributed page may name to be mounted by the router: none — the
 * shell carries no registry, and the one builtin page there is (company mode's proposals) is
 * routed by company mode from its own read (features/company/use-org-pages.ts).
 */
const NO_BUILTIN_RENDERERS: ReadonlySet<string> = new Set();

export function ContributionsProvider({ children }: { children: ReactNode }) {
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
  const value = useMemo<ContributionsValue>(
    () =>
      remote === null
        ? LOCAL
        : { pages: contributedPages(local, remote.pages, NO_BUILTIN_RENDERERS), loaded: true },
    [remote, local],
  );
  return <ContributionsContext.Provider value={value}>{children}</ContributionsContext.Provider>;
}

export function useContributions(): ContributionsValue {
  return useContext(ContributionsContext);
}
