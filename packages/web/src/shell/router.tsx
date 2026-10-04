/**
 * Router (react-router v7 declarative style): /login is public; every other route is a page a
 * module contributed to `ShellModule.pages` (shell/module.ts) or the server contributed to
 * `WebModule.pages` (shell/contributions.tsx), read through `useShellPages()`.
 * A "shell" page goes through the RequireAuth guard (redirects to /login when not
 * authenticated) and is wrapped in ProjectProvider + SessionsProvider, the session providers
 * modules contributed, and AppLayout; a "bare" page only needs the user signed in.
 *
 * The app normally routes on the browser's address bar. A host that mounts it inside another
 * document (the component gallery frames it against a mocked API) passes `initialPath`
 * instead: the router then runs in memory from that path, so the app navigates without
 * touching the host document's URL — the only seam the app needs to be mounted elsewhere.
 */
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router";
import type { ComponentType, ReactElement, ReactNode } from "react";
import { useAuth } from "../state/auth";
import { useRuntimeLanguages } from "../lib/use-runtime-languages";
import { ProjectProvider } from "../state/project";
import { SessionsProvider } from "../state/sessions";
import { AppLayout } from "./app-layout";
import { BootPending } from "../components/ui/boot-pending";
import { Deferred } from "../components/ui/deferred";
import { LoginPage } from "../pages/login";
import { shellDeps } from "./deps";
import { ShellPagesProvider, useShellPages, useShellPagesPending } from "./contributions";

/** Route guard: shows the boot status while initializing, redirects to /login when not authenticated. */
function RequireAuth() {
  const { user } = useAuth();
  const { sessionProviders, userEvents } = shellDeps.useDeps();
  // Extension-contributed grammars, adopted once for the signed-in tree (see the hook). Called
  // before the early returns, because a hook cannot be conditional; it fetches nothing until
  // the effect runs, which is only after this component actually renders its tree.
  useRuntimeLanguages();
  if (user === undefined) return <BootPending />; // GET /api/me is still initializing
  if (user === null) return <Navigate to="/login" replace />;
  // The contributed providers nest outermost first, inside the session list they may read.
  const layout = sessionProviders.reduceRight<ReactNode>(
    (inner, { id, Component }) => <Component key={id}>{inner}</Component>,
    <AppLayout />,
  );
  return (
    <ProjectProvider>
      <SessionsProvider userEvents={userEvents}>{layout}</SessionsProvider>
    </ProjectProvider>
  );
}

/**
 * Login guard without the app shell, for "bare" pages: the terminal page is a standalone
 * full-window surface (no sidebar, no Project context), it only needs the user to be signed
 * in — the terminal WebSocket authenticates with the same session cookie. A workflow's page
 * as the whole app is the other one; the command palette it mounts is the way back.
 */
function RequireAuthBare({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user === undefined) return <BootPending />;
  if (user === null) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** When already logged in, visiting /login redirects to the shell's home (company mode's `home` page). */
function LoginRoute() {
  const { user } = useAuth();
  if (user) return <Navigate to="/" replace />;
  return <LoginPage />;
}

/**
 * The boundary a page's code loads under (lib/lazy-component.ts); a changed path forgets a
 * failure, so navigating within the page leaves the notice behind.
 */
function PageBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <Deferred resetKey={pathname}>{children}</Deferred>;
}

/**
 * A page's route element: the page under a boundary of its own, keyed by the page, so a
 * navigation to another page mounts a new boundary — which shows its fallback while the page's
 * code loads — instead of reusing one already on screen, which would keep the page being left
 * drawn (hidden or not) and its effects running. Within one page (`/chat/a` → `/chat/b`) the
 * boundary stays, and so does the page. See AppRouter for why the page being left must be gone.
 */
export function pageElement(id: string, Page: ComponentType): ReactElement {
  return (
    <PageBoundary key={id}>
      <Page />
    </PageBoundary>
  );
}

export interface AppRouterProps {
  initialPath?: string;
}

/**
 * Navigations are not transitions (`useTransitions={false}`): the route the tree is drawn for is
 * always the address. Pages decide where to go from effects — the conversation page opens the
 * draft when no Session is selected, home leads to the mode's page, a parked draft that is gone
 * falls back to the new one — and each decides for the route it is drawn for. Under a transition
 * that route lags the address for as long as the next page takes to render or to load its code
 * (lib/lazy-component.ts), and an urgent update meanwhile (the Session list arriving) re-runs the
 * old page's effects against its old route, whose redirect then replaces the navigation in
 * flight: the mode switch's `/org` became `/chat/new`, which then claimed development mode. With
 * the page boundary keyed per page (pageElement), nothing of the page being left outlives the
 * navigation.
 */
export function AppRouter({ initialPath }: AppRouterProps = {}) {
  const tree = (
    <ShellPagesProvider>
      <RouteTree />
    </ShellPagesProvider>
  );
  return initialPath === undefined ? (
    <BrowserRouter useTransitions={false}>{tree}</BrowserRouter>
  ) : (
    <MemoryRouter initialEntries={[initialPath]} useTransitions={false}>
      {tree}
    </MemoryRouter>
  );
}

/**
 * The routes: every page in the shell's table (the modules' and the server's,
 * shell/contributions.tsx), under the guard of its frame. A company-mode page (`nav: "org"`)
 * also mounts under the organization layout, which is company mode's own
 * (features/company/org-routes.tsx).
 */
function RouteTree() {
  const pages = useShellPages();
  const pending = useShellPagesPending();
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      {pages
        .filter((page) => page.frame === "bare")
        .map(({ id, path, Component }) => (
          <Route
            key={id}
            path={path}
            element={<RequireAuthBare>{pageElement(id, Component)}</RequireAuthBare>}
          />
        ))}
      <Route element={<RequireAuth />}>
        {/* Admin-only pages are refused server-side (403); the sidebar hides their row, so a
            member only ever reaches one by typing the URL. Company mode is one page, /org/*,
            whose nested routes are its own (features/company/org-routes.tsx). `/` and every
            path nothing else matches lead home, which depends on the mode: company mode
            contributes that page too (path `*`). Settings and user management live in the
            settings dialog now (see SettingsDialog); their old routes fall through to it. */}
        {pages
          .filter((page) => page.frame === "shell")
          .map(({ id, path, Component }) => (
            <Route
              key={id}
              path={path}
              // The catch-all waits while a server-contributed page may still claim the path.
              element={path === "*" && pending ? null : pageElement(id, Component)}
            />
          ))}
      </Route>
    </Routes>
  );
}
