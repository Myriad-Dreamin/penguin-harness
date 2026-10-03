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
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from "react-router";
import { useAuth } from "../state/auth";
import { ProjectProvider } from "../state/project";
import { SessionsProvider } from "../state/sessions";
import { AppLayout } from "./app-layout";
import { LoginPage } from "../pages/login";
import { shellDeps } from "./deps";
import { ShellPagesProvider, useShellPages, useShellPagesPending } from "./contributions";
import { HOME_PATH } from "./page-table";

/** Route guard: shows blank while initializing, redirects to /login when not authenticated. */
function RequireAuth() {
  const { user } = useAuth();
  const { sessionProviders, userEvents } = shellDeps.useDeps();
  if (user === undefined) return null; // GET /api/me is still initializing
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
  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** When already logged in, visiting /login redirects straight to the home page (the chat page). */
function LoginRoute() {
  const { user } = useAuth();
  if (user) return <Navigate to={HOME_PATH} replace />;
  return <LoginPage />;
}

export interface AppRouterProps {
  initialPath?: string;
}

/** The routes of every page in the table, under the guard of its frame. */
function PageRoutes() {
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
            element={
              <RequireAuthBare>
                <Component />
              </RequireAuthBare>
            }
          />
        ))}
      <Route element={<RequireAuth />}>
        <Route index element={<Navigate to={HOME_PATH} replace />} />
        {/* Admin-only pages are refused server-side (403); the sidebar hides their row, so a
            member only ever reaches one by typing the URL. Company mode is one page, /org/*,
            whose nested routes are its own (features/company/org-routes.tsx). */}
        {pages
          .filter((page) => page.frame === "shell")
          .map(({ id, path, Component }) => (
            <Route key={id} path={path} element={<Component />} />
          ))}
        {/* Settings and user management live in the settings dialog now (see
            SettingsDialog); their old routes fall through to the catch-all, which waits
            while a server-contributed page may still claim the path. */}
        <Route path="*" element={pending ? null : <Navigate to={HOME_PATH} replace />} />
      </Route>
    </Routes>
  );
}

export function AppRouter({ initialPath }: AppRouterProps = {}) {
  const routes = (
    <ShellPagesProvider>
      <PageRoutes />
    </ShellPagesProvider>
  );
  return initialPath === undefined ? (
    <BrowserRouter>{routes}</BrowserRouter>
  ) : (
    <MemoryRouter initialEntries={[initialPath]}>{routes}</MemoryRouter>
  );
}
