/**
 * Router (react-router v7 declarative style): /login is public; all other routes go through
 * the RequireAuth guard (redirects to /login when not authenticated) and are wrapped in
 * ProjectProvider + AppLayout.
 */
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { useAuth } from "./state/auth";
import { useRuntimeLanguages } from "./features/chat";
import { ProjectProvider } from "./state/project";
import { SessionsProvider } from "./state/sessions";
import { CompanyProvider } from "./state/company";
import { AppLayout } from "./components/layout/app-layout";
import { LoginPage } from "./pages/login";
import { TerminalPage } from "./features/terminal";
import {
  OrgIndexRedirect,
  OrgLayout,
  OverviewPage,
  OrgChartPage,
  CalendarPage,
  TicketsPage,
  FinancePage,
  ChannelView,
  HandbookPage,
} from "./features/company";
import { WorkflowAppPage } from "./features/workflows";
import { orgPagesOf } from "./lib/pages";
import type { PageEntry } from "./lib/pages";
import { S } from "./lib/strings";
import { PAGE_RENDERERS, SURFACE_RENDERERS } from "./renderers.gen";
import { ContributionsProvider, useContributions } from "./state/contributions";

/**
 * A page's element. A `builtin` renderer is looked up in this build's registry (src/module.json
 * `renderers.pages`, generated into renderers.gen.ts); a name it lacks — a page a newer plugin
 * or platform contributes — says so at its URL rather than sending the user to /chat.
 */
function renderPage(page: PageEntry): React.ReactNode {
  if ("iframe" in page.renderer) {
    return (
      <iframe title={page.key} src={page.renderer.iframe.src} className="h-full w-full border-0" />
    );
  }
  const name = page.renderer.builtin;
  const Component = Object.hasOwn(PAGE_RENDERERS, name)
    ? PAGE_RENDERERS[name as keyof typeof PAGE_RENDERERS]
    : undefined;
  if (Component === undefined) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">{S.common.pageNoRenderer(name)}</p>
      </div>
    );
  }
  return <Component />;
}

/** Route guard: shows blank while initializing, redirects to /login when not authenticated. */
function RequireAuth() {
  const { user } = useAuth();
  // Extension-contributed grammars, adopted once for the signed-in tree (see the hook). Called
  // before the early returns, because a hook cannot be conditional; it fetches nothing until
  // the effect runs, which is only after this component actually renders its tree.
  useRuntimeLanguages();
  if (user === undefined) return null; // GET /api/me is still initializing
  if (user === null) return <Navigate to="/login" replace />;
  return (
    <ProjectProvider>
      <SessionsProvider>
        <CompanyProvider>
          <AppLayout />
        </CompanyProvider>
      </SessionsProvider>
    </ProjectProvider>
  );
}

/**
 * Login guard without the app shell: the terminal page is a standalone full-window surface
 * (no sidebar, no Project context), it only needs the user to be signed in — the terminal
 * WebSocket authenticates with the same session cookie.
 */
function RequireAuthBare({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** When already logged in, visiting /login redirects straight to the chat page. */
function LoginRoute() {
  const { user } = useAuth();
  if (user) return <Navigate to="/chat" replace />;
  return <LoginPage />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <ContributionsProvider surfaceRenderers={SURFACE_RENDERERS}>
        <RouteTree />
      </ContributionsProvider>
    </BrowserRouter>
  );
}

/**
 * The routes, from the page table: the local manifest plus what the server contributes
 * (state/contributions.tsx) — so a page a plugin adds mounts once the contributions have
 * loaded, and the local pages are there from the first render.
 */
function RouteTree() {
  const { pages } = useContributions();
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route
          path="/terminal"
          element={
            <RequireAuthBare>
              <TerminalPage />
            </RequireAuthBare>
          }
        />
        {/* One workflow's page as the whole app: outside the shell, like the terminal; the
            command palette it mounts is the way back. */}
        {[
          "/app/:projectId/:agentId/:workflowId",
          "/app/:projectId/:agentId/:workflowId/:tabKey",
        ].map((appPath) => (
          <Route
            key={appPath}
            path={appPath}
            element={
              <RequireAuthBare>
                <WorkflowAppPage />
              </RequireAuthBare>
            }
          />
        ))}
        <Route element={<RequireAuth />}>
          <Route index element={<Navigate to="/chat" replace />} />
          {/* Every page is a module.json entry (lib/pages.ts). Admin-only ones are refused
              server-side (403); the sidebar hides their row, so a member only ever reaches
              one by typing the URL. */}
          {pages
            .filter((page) => page.nav !== "org")
            .map((page) => (
              <Route key={page.id} path={page.path} element={renderPage(page)} />
            ))}
          {/* Company mode: /org resolves to an organization (or the empty landing), and an
              organization opens on its overview — the page that says what the whole
              organization is doing; its channels are the sidebar's own list beside it. Both
              fall back to /chat while company mode is unavailable (see OrgLayout). */}
          <Route path="/org" element={<OrgIndexRedirect />} />
          <Route path="/org/:projectId/:orgId" element={<OrgLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<OverviewPage />} />
            <Route path="chart" element={<OrgChartPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="tickets" element={<TicketsPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="handbook" element={<HandbookPage />} />
            <Route path="channels/:channelId" element={<ChannelView />} />
            {/* The company-mode pages a plugin contributes, after the organization's own:
                their paths are relative to this layout, and the nav row beside them is the
                sidebar's (src/module.json renderers.orgNav). */}
            {orgPagesOf(pages).map((page) => (
              <Route key={page.id} path={page.path} element={renderPage(page)} />
            ))}
            <Route path="*" element={<Navigate to="overview" replace />} />
          </Route>
          {/* Settings and user management live in the settings dialog now (see
              SettingsDialog); their old routes fall through to the catch-all. */}
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Route>
      </Routes>
    </>
  );
}
