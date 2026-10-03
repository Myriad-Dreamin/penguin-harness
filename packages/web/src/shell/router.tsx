/**
 * Router (react-router v7 declarative style): /login is public; every other route is a page a
 * module contributed to `ShellModule.pages` (shell/module.ts), read from the shell's bindings.
 * A "shell" page goes through the RequireAuth guard (redirects to /login when not
 * authenticated) and is wrapped in ProjectProvider + SessionsProvider, the session providers
 * modules contributed, and AppLayout; a "bare" page only needs the user signed in.
 *
 * The app normally routes on the browser's address bar. A host that mounts it inside another
 * document (the component gallery frames it against a mocked API) passes `initialPath`
 * instead: the router then runs in memory from that path, so the app navigates without
 * touching the host document's URL — the only seam the app needs to be mounted elsewhere.
 */
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from "react-router";
import { useAuth } from "../state/auth";
import { useRuntimeLanguages } from "../lib/use-runtime-languages";
import { ProjectProvider } from "../state/project";
import { SessionsProvider } from "../state/sessions";
import { useCompany } from "../features/company";
import { AppLayout } from "../components/layout/app-layout";
import { BootPending } from "../components/ui/boot-pending";
import { LoginPage } from "../pages/login";
import { ContributionsProvider, useContributions } from "../state/contributions";
import { shellDeps } from "./deps";
import { ContributedPage } from "./contributed-page";

/** Route guard: shows the boot status while initializing, redirects to /login when not authenticated. */
function RequireAuth() {
  const { user } = useAuth();
  const { sessionProviders, userEvents } = shellDeps.useDeps();
  // Plugin-contributed grammars, adopted once for the signed-in tree (see the hook). Called
  // before the early returns, because a hook cannot be conditional; it fetches only once a user
  // is signed in.
  useRuntimeLanguages(user != null);
  if (user === undefined) return <BootPending />; // GET /api/me is still initializing
  if (user === null) return <Navigate to="/login" replace />;
  // The contributed providers nest outermost first, inside the session list they may read.
  const layout = sessionProviders.reduceRight<React.ReactNode>(
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
function RequireAuthBare({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user === undefined) return <BootPending />;
  if (user === null) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** When already logged in, visiting /login redirects to the shell's home (see HomeRedirect). */
function LoginRoute() {
  const { user } = useAuth();
  if (user) return <Navigate to="/" replace />;
  return <LoginPage />;
}

/**
 * `/` and every path nothing matches: the home of the mode the shell stands in (`homePath`) —
 * the organizations in company mode, the conversations in development mode. A sign-in and
 * the desktop shell's start both arrive at `/`.
 */
function HomeRedirect() {
  return <Navigate to={useCompany().homePath} replace />;
}

export interface AppRouterProps {
  initialPath?: string;
}

export function AppRouter({ initialPath }: AppRouterProps = {}) {
  const tree = (
    <ContributionsProvider>
      <RouteTree />
    </ContributionsProvider>
  );
  return initialPath === undefined ? (
    <BrowserRouter>{tree}</BrowserRouter>
  ) : (
    <MemoryRouter initialEntries={[initialPath]}>{tree}</MemoryRouter>
  );
}

/**
 * The routes: the pages the modules contributed (the shell's bindings), plus what the server
 * contributes (state/contributions.tsx) — so a page a plugin adds mounts once the
 * contributions have loaded, and the app's own pages are there from the first render. A
 * company-mode page (`nav: "org"`) mounts under the organization layout, which is company
 * mode's own (features/company/org-routes.tsx).
 */
function RouteTree() {
  const { pages } = shellDeps.useDeps();
  const { pages: contributed } = useContributions();
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      {pages
        .filter((page) => page.frame === "bare")
        .map(({ id, path, Component }) => (
          <Route
            key={id}
            path={path}
            element={
              <RequireAuthBare>
                <Component />
              </RequireAuthBare>
            }
          />
        ))}
      <Route element={<RequireAuth />}>
        <Route index element={<HomeRedirect />} />
        {/* Admin-only pages are refused server-side (403); the sidebar hides their row, so a
            member only ever reaches one by typing the URL. Company mode is one page, /org/*,
            whose nested routes are its own (features/company/org-routes.tsx). */}
        {pages
          .filter((page) => page.frame === "shell")
          .map(({ id, path, Component }) => (
            <Route key={id} path={path} element={<Component />} />
          ))}
        {contributed.map((page) => (
          <Route key={page.id} path={page.path} element={<ContributedPage page={page} />} />
        ))}
        {/* Settings and user management live in the settings dialog now (see
            SettingsDialog); their old routes fall through to the catch-all. */}
        <Route path="*" element={<HomeRedirect />} />
      </Route>
    </Routes>
  );
}
