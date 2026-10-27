/**
 * API cross-section corpus (DESIGN.md §5.1): endpoint specs distilled from the route files'
 * own validators (src/http/validate.ts + each route's readJson/requireString/… calls) and the
 * inventory's endpoint table. Every spec names the real handler it drives. 🔴-danger
 * behaviors (HMR push, terminals pty spawn, OAuth/balance network calls, plugin install,
 * update-check network, org writes that open real desk sessions) are absent from the corpus
 * by the §5.3 danger gate — the demo never generates them.
 */
import type { Rng } from "./rng.js";

export type Variant = "ok" | "bad";

export interface Pools {
  projects: string[];
  agents: string[];
  sessions: string[];
  schedules: string[];
  users: string[];
}

export interface ApiGenCtx {
  rng: Rng;
  pools: Pools;
  step: number;
  /** The admin password as the driver currently believes it — the corpus's own password-change
   * spec mutates it, and the driver tracks the new value (a stateful sequence feeding itself). */
  password: string;
}

export interface ApiCallSpec {
  id: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  weight: number;
  /** Which pool ids may fill the `:param` slots; a bogus id is injected instead sometimes. */
  pool?: keyof Omit<Pools, "users">;
  body?: (v: Variant, ctx: ApiGenCtx) => unknown;
  capture?: (json: unknown, pools: Pools) => void;
  /** Real code this spec drives — file and handler, for the coverage report. */
  note: string;
}

// The harness's semantic-id pattern (services/ids.ts: /^[a-z][a-z0-9_]{1,63}$/) admits no
// hyphens — every generated id follows it, so ok-variant creates actually succeed.
const id = (rng: Rng): string => `fz_${rng.int(1000, 9999)}_${rng.int(100, 999)}`;
const badId = (): string => "no/such id!";

const poolOr = (ctx: ApiGenCtx, pool: keyof Pools | undefined, fallback: string): string =>
  pool && ctx.pools[pool].length > 0
    ? ctx.rng.chance(0.2)
      ? badId()
      : (ctx.rng.pick(ctx.pools[pool]) as string)
    : ctx.rng.chance(0.5)
      ? badId()
      : fallback;

const taskBody = (v: Variant, text: string): unknown =>
  v === "bad" ? { input: "not-an-array" } : { input: [{ type: "text", text }], queueIfBusy: true };

export function apiCorpus(projectId: string, agentId: string): ApiCallSpec[] {
  return [
    {
      id: "install.get",
      method: "GET",
      path: "/api/install",
      weight: 2,
      note: "http/routes/install.ts GET handler",
    },
    {
      id: "auth.login",
      method: "POST",
      path: "/api/auth/login",
      weight: 3,
      body: (v, ctx) =>
        v === "bad"
          ? { userId: 123, password: null }
          : {
              userId: ctx.rng.chance(0.3) ? "no-such-user" : "admin",
              password: ctx.password,
            },
      note: "http/routes/auth.ts POST /login (auth/service login, scrypt verify)",
    },
    {
      id: "auth.logout",
      method: "POST",
      path: "/api/auth/logout",
      weight: 1,
      note: "http/routes/auth.ts POST /logout",
    },
    {
      id: "auth.claim",
      method: "GET",
      path: "/api/auth/claim",
      weight: 1,
      note: "http/routes/auth.ts GET /claim",
    },
    {
      id: "version.get",
      method: "GET",
      path: "/api/version",
      weight: 2,
      note: "http/routes/version.ts GET (hmr.currentImplId)",
    },
    {
      id: "version.history",
      method: "GET",
      path: "/api/version/history",
      weight: 1,
      note: "harness-history.ts + http/routes/version.ts",
    },
    {
      id: "version.diff",
      method: "GET",
      path: "/api/version/history/diff",
      weight: 1,
      note: "harness-history.ts diff",
    },
    {
      id: "me.get",
      method: "GET",
      path: "/api/me",
      weight: 2,
      note: "http/routes/me.ts GET (auth middleware)",
    },
    {
      id: "me.password.put",
      method: "PUT",
      path: "/api/me/password",
      weight: 2,
      body: (v, ctx) =>
        v === "bad"
          ? { newPassword: 42 }
          : { oldPassword: ctx.password, newPassword: "penguin-0001" },
      note: "http/routes/me.ts PUT /password (auth/service changePassword)",
    },
    {
      id: "me.profile.put",
      method: "PUT",
      path: "/api/me/profile",
      weight: 2,
      body: (v, ctx) =>
        v === "bad" ? {} : { displayName: ctx.rng.chance(0.3) ? 99 : "fuzz-display" },
      note: "http/routes/me.ts PUT /profile (parseDisplayName)",
    },
    {
      id: "me.prefs.get",
      method: "GET",
      path: "/api/me/prefs",
      weight: 1,
      note: "http/routes/me.ts GET /prefs (UiPrefsRepo)",
    },
    {
      id: "me.prefs.put",
      method: "PUT",
      path: "/api/me/prefs",
      weight: 2,
      body: (v) => (v === "bad" ? { draftShortcuts: 5 } : { lastProjectId: "default_project" }),
      note: "http/routes/me.ts PUT /prefs (shallow merge)",
    },
    {
      id: "projects.list",
      method: "GET",
      path: "/api/projects",
      weight: 3,
      note: "http/routes/projects.ts GET (projectService.listProjects)",
    },
    {
      id: "projects.create",
      method: "POST",
      path: "/api/projects",
      weight: 4,
      body: (v, ctx) =>
        v === "bad"
          ? ctx.rng.pick([{ name: "x" }, { projectId: "" }, { projectId: 12 }, {}])
          : { projectId: id(ctx.rng), name: "fuzz project" },
      capture: (json, pools) => {
        const p = (json as { project?: { projectId?: string } }).project?.projectId;
        if (p) pools.projects.push(p);
      },
      note: "http/routes/projects.ts POST (requireString projectId; projectService.createProject)",
    },
    {
      id: "projects.rename",
      method: "PATCH",
      path: "/api/projects/:x",
      weight: 3,
      pool: "projects",
      body: (v, ctx) => (v === "bad" ? { name: "" } : { name: `renamed-${ctx.step}` }),
      note: "http/routes/projects.ts PATCH (trim + minLen, renameProject)",
    },
    {
      id: "projects.delete",
      method: "DELETE",
      path: "/api/projects/:x",
      weight: 2,
      pool: "projects",
      note: "http/routes/projects.ts DELETE (requireValidId, deleteProject)",
    },
    {
      id: "members.list",
      method: "GET",
      path: "/api/projects/:x/members",
      weight: 2,
      pool: "projects",
      note: "http/routes/members.ts GET",
    },
    {
      id: "members.add",
      method: "POST",
      path: "/api/projects/:x/members",
      weight: 2,
      pool: "projects",
      body: (v, ctx) =>
        v === "bad"
          ? { userId: 7 }
          : {
              // A pool user once admin.users.create has landed one, else a well-shaped
              // unknown id — both are real paths (grant vs. user_not_found).
              userId:
                ctx.rng.chance(0.3) || ctx.pools.users.length === 0
                  ? "ghost_user"
                  : ctx.rng.pick(ctx.pools.users),
              role: "member",
            },
      note: "http/routes/members.ts POST (project_members repo)",
    },
    {
      id: "members.remove",
      method: "DELETE",
      path: "/api/projects/:x/members/:u",
      weight: 1,
      pool: "projects",
      body: undefined,
      note: "http/routes/members.ts DELETE",
    },
    {
      id: "suggest-id",
      method: "POST",
      path: "/api/projects/:x/suggest-id",
      weight: 1,
      pool: "projects",
      note: "http/routes/suggest-id.ts POST",
    },
    {
      id: "dirs.list",
      method: "GET",
      path: "/api/projects/:x/dirs",
      weight: 1,
      pool: "projects",
      note: "http/routes/dirs.ts GET",
    },
    {
      id: "agents.list",
      method: "GET",
      path: "/api/projects/:x/agents",
      weight: 3,
      pool: "projects",
      note: "http/routes/agents.ts GET (agentService list)",
    },
    {
      id: "agents.create",
      method: "POST",
      path: "/api/projects/:x/agents",
      weight: 4,
      pool: "projects",
      body: (v, ctx) =>
        v === "bad"
          ? ctx.rng.pick([{ agentId: "" }, { agentId: 5 }, {}])
          : { agentId: `fuzz_agent_${ctx.step}`, name: "fuzz agent" },
      capture: (json, pools) => {
        const a = (json as { agent?: { agentId?: string } }).agent?.agentId;
        if (a) pools.agents.push(a);
      },
      note: "http/routes/agents.ts POST (requireString agentId; agentService.createAgent)",
    },
    {
      id: "agent.config.get",
      method: "GET",
      path: "/api/projects/:x/agents/:a/config",
      weight: 2,
      pool: "agents",
      note: "http/routes/agent-config.ts GET (agentConfigService)",
    },
    {
      id: "agent.config.put",
      method: "PUT",
      path: "/api/projects/:x/agents/:a/config",
      weight: 2,
      pool: "agents",
      body: (v) => (v === "bad" ? { systemPrompt: 99 } : {}),
      note: "http/routes/agent-config.ts PUT (config patch validators)",
    },
    {
      id: "agent.delete",
      method: "DELETE",
      path: "/api/projects/:x/agents/:a",
      weight: 1,
      pool: "agents",
      note: "http/routes/agents.ts DELETE (agentService.deleteAgent)",
    },
    {
      id: "agent.memory",
      method: "GET",
      path: "/api/projects/:x/agents/:a/memory",
      weight: 1,
      pool: "agents",
      note: "http/routes/memory.ts GET (memoryService)",
    },
    {
      id: "agent.skills",
      method: "GET",
      path: "/api/projects/:x/agents/:a/skills",
      weight: 1,
      pool: "agents",
      note: "http/routes/skills.ts GET (skill listing)",
    },
    {
      id: "agent.hooks",
      method: "GET",
      path: "/api/projects/:x/agents/:a/hooks",
      weight: 1,
      pool: "agents",
      note: "http/routes/hooks.ts GET",
    },
    {
      id: "agent.api",
      method: "GET",
      path: "/api/projects/:x/agents/:a/api",
      weight: 1,
      pool: "agents",
      note: "http/routes/agent-api.ts GET",
    },
    {
      id: "sessions.agent-list",
      method: "GET",
      path: "/api/projects/:x/agents/:a/sessions",
      weight: 2,
      pool: "agents",
      note: "http/routes/sessions.ts agentSessionsRoutes GET",
    },
    {
      id: "sessions.batch",
      method: "POST",
      path: "/api/projects/:x/sessions/batch",
      weight: 2,
      pool: "projects",
      body: (v, ctx) =>
        v === "bad"
          ? { requests: [{ agentId: badId() }] }
          : { requests: [{ agentId: poolOr(ctx, "agents", agentId), limit: 10 }] },
      note: "http/routes/sessions.ts sessionsBatchRoutes POST (batchPage validator)",
    },
    {
      id: "sessions.create",
      method: "POST",
      path: "/api/projects/:x/agents/:a/sessions",
      weight: 4,
      pool: "agents",
      body: (v, ctx) =>
        v === "bad"
          ? ctx.rng.pick([
              { modelId: "half-pair" },
              { provider: "half-pair" },
              { approvalMode: "no-such" },
            ])
          : { client: "cli" },
      capture: (json, pools) => {
        const s = (json as { session?: { sessionId?: string } }).session?.sessionId;
        if (s) pools.sessions.push(s);
      },
      note: "http/routes/sessions.ts agentSessionsRoutes POST (model pair validation; sessionService.createSession)",
    },
    {
      id: "sessions.list",
      method: "GET",
      path: "/api/sessions",
      weight: 1,
      note: "legacy sessions list route",
    },
    {
      id: "session.get",
      method: "GET",
      path: "/api/sessions/:s",
      weight: 3,
      pool: "sessions",
      note: "http/routes/sessions.ts GET /:sessionId (resolveSession)",
    },
    {
      id: "session.rename",
      method: "PATCH",
      path: "/api/sessions/:s",
      weight: 3,
      pool: "sessions",
      body: (v, ctx) =>
        v === "bad" ? { title: "x".repeat(200) } : { title: `fuzz title ${ctx.step}` },
      note: "http/routes/sessions.ts PATCH (checkSessionTitle ≤120)",
    },
    {
      id: "session.fork",
      method: "POST",
      path: "/api/sessions/:s/fork",
      weight: 2,
      pool: "sessions",
      note: "http/routes/sessions.ts POST /fork (fork_count column)",
    },
    {
      id: "session.messages",
      method: "GET",
      path: "/api/sessions/:s/messages",
      weight: 3,
      pool: "sessions",
      note: "http/routes/sessions.ts GET /messages (windowed history)",
    },
    {
      id: "session.task",
      method: "POST",
      path: "/api/sessions/:s/tasks",
      weight: 5,
      pool: "sessions",
      body: (v, ctx) => taskBody(v, `fuzz task input ${ctx.step}`),
      note: "http/routes/sessions.ts POST /tasks (parseTaskInput; manager.startTask → FuzzerSessionLoader)",
    },
    {
      id: "session.steer",
      method: "POST",
      path: "/api/sessions/:s/steer",
      weight: 2,
      pool: "sessions",
      body: (v, ctx) => taskBody(v, `fuzz steer ${ctx.step}`),
      note: "http/routes/sessions.ts POST /steer (steer-or-task semantics)",
    },
    {
      id: "session.abort",
      method: "POST",
      path: "/api/sessions/:s/abort",
      weight: 2,
      pool: "sessions",
      note: "http/routes/sessions.ts POST /abort (manager abort path)",
    },
    {
      id: "session.approval",
      method: "POST",
      path: "/api/sessions/:s/approvals/no-such-toolcall",
      weight: 2,
      pool: "sessions",
      body: (v) => (v === "bad" ? { decision: "maybe" } : { decision: "deny" }),
      note: "http/routes/sessions.ts POST /approvals/:toolCallId (approval validator, 404 on none pending)",
    },
    {
      id: "session.compact",
      method: "POST",
      path: "/api/sessions/:s/compact",
      weight: 1,
      pool: "sessions",
      note: "http/routes/sessions.ts POST /compact (compactability check)",
    },
    {
      id: "session.switch-model",
      method: "POST",
      path: "/api/sessions/:s/switch-model",
      weight: 2,
      pool: "sessions",
      body: (v, ctx) =>
        v === "bad" ? { modelId: "half" } : { modelId: "fuzz-model", provider: "fuzz-group" },
      note: "http/routes/sessions.ts POST /switch-model (pair validation)",
    },
    {
      id: "session.traces",
      method: "GET",
      path: "/api/sessions/:s/traces",
      weight: 1,
      pool: "sessions",
      note: "http/routes/sessions.ts GET /traces (trace index)",
    },
    {
      id: "session.messaging",
      method: "GET",
      path: "/api/sessions/:s/messaging",
      weight: 1,
      pool: "sessions",
      note: "runtime/messaging bridge GET (bindings list)",
    },
    {
      id: "schedules.list",
      method: "GET",
      path: `/api/projects/${projectId}/agents/:a/schedules`,
      weight: 2,
      pool: "agents",
      note: "http/routes/schedules.ts GET (agent-level)",
    },
    {
      id: "schedules.create",
      method: "POST",
      path: `/api/projects/${projectId}/agents/:a/schedules`,
      weight: 3,
      pool: "agents",
      body: (v, ctx) =>
        v === "bad"
          ? { name: "bad/name!", prompt: "" }
          : {
              name: `fuzz_schedule_${ctx.step}`,
              prompt: "fuzz prompt",
              // 2028 stays ahead of the FuzzerClock's 31-day jumps; the API spells the
              // flag `enabled` (the CLI's --disabled maps to enabled: false).
              startAt: "2028-01-01T00:00:00Z",
              enabled: false,
            },
      capture: (json, pools) => {
        // The POST answers with a bare ScheduleItem (readItem), not a wrapped one.
        const n = (json as { name?: string }).name;
        if (n) pools.schedules.push(n);
      },
      note: "http/routes/schedules.ts POST (requireScheduleName; parseUpsertBody enabled:false seed)",
    },
    {
      id: "schedules.delete",
      method: "DELETE",
      path: `/api/projects/${projectId}/agents/:a/schedules/:n`,
      weight: 2,
      pool: "schedules",
      note: "http/routes/schedules.ts DELETE /:name",
    },
    {
      id: "usage.get",
      method: "GET",
      path: "/api/projects/:x/usage",
      weight: 2,
      pool: "projects",
      note: "http/routes/usage.ts GET (usageService aggregate)",
    },
    {
      id: "usage.errors",
      method: "GET",
      path: "/api/projects/:x/usage/errors",
      weight: 1,
      pool: "projects",
      note: "http/routes/usage.ts GET /errors (ErrorsRepo)",
    },
    {
      id: "workspace-files.create",
      method: "POST",
      path: "/api/projects/:x/workspace-files/create",
      weight: 2,
      pool: "projects",
      body: (v, ctx) =>
        v === "bad" ? { path: "../escape.txt" } : { path: `fuzz-${ctx.step}.txt` },
      note: "http/routes/workspace-files.ts POST /create (path traversal guard)",
    },
    {
      id: "workspace-files.content.put",
      method: "PUT",
      path: "/api/projects/:x/workspace-files/content?path=default_project%2ffuzz-ws.txt",
      weight: 1,
      pool: "projects",
      body: (v, ctx) => (v === "bad" ? { content: 42 } : { content: `fuzz content ${ctx.step}` }),
      note: "http/routes/workspace-files.ts PUT /content",
    },
    {
      id: "workspace-files.list",
      method: "GET",
      path: "/api/projects/:x/workspace-files",
      weight: 1,
      pool: "projects",
      note: "http/routes/workspace-files.ts GET",
    },
    {
      id: "contributions.get",
      method: "GET",
      path: "/api/contributions",
      weight: 1,
      note: "http/routes/contributions.ts GET",
    },
    {
      id: "languages.get",
      method: "GET",
      path: "/api/languages",
      weight: 1,
      note: "http/routes/languages.ts GET",
    },
    {
      id: "plugins.library",
      method: "GET",
      path: "/api/plugins",
      weight: 1,
      note: "http/routes/plugins.ts GET (library scan)",
    },
    {
      id: "plugins.installed",
      method: "GET",
      path: "/api/plugins/installed",
      weight: 1,
      note: "http/routes/plugins-installed.ts GET",
    },
    {
      id: "machines.list",
      method: "GET",
      path: "/api/projects/:x/machines",
      weight: 1,
      pool: "projects",
      note: "machines/service.ts routes GET (read-only)",
    },
    {
      id: "orgs.list",
      method: "GET",
      path: "/api/projects/:x/organizations",
      weight: 1,
      pool: "projects",
      note: "http/routes/organizations.ts GET (org cache read)",
    },
    {
      id: "admin.users.list",
      method: "GET",
      path: "/api/admin/users",
      weight: 1,
      note: "http/routes/admin.ts GET /users (admin gate)",
    },
    {
      id: "admin.users.create",
      method: "POST",
      path: "/api/admin/users",
      weight: 2,
      body: (v, ctx) =>
        v === "bad"
          ? { userId: "UPPER BAD!" }
          : { userId: `fuzz_user_${ctx.step}`, password: "fuzz-pass-1" },
      capture: (json, pools) => {
        const u = (json as { user?: { userId?: string } }).user?.userId;
        if (u) pools.users.push(u);
      },
      note: "http/routes/admin.ts POST /users (adminService.createUser)",
    },
    {
      id: "admin.settings.get",
      method: "GET",
      path: "/api/admin/settings",
      weight: 1,
      note: "admin-settings.ts GET (ServerSettingsRepo)",
    },
    {
      id: "admin.settings.put",
      method: "PUT",
      path: "/api/admin/settings",
      weight: 1,
      body: (v) => (v === "bad" ? { attachmentLimitsMb: "huge" } : {}),
      note: "admin-settings.ts PUT (settings validators)",
    },
    {
      id: "models.get",
      method: "GET",
      path: "/api/projects/:x/models",
      weight: 2,
      pool: "projects",
      note: "http/routes/models.ts GET (ProjectConfigService.getModels)",
    },
    {
      id: "models.providers.put",
      method: "PUT",
      path: "/api/projects/:x/models/providers/fuzz-group",
      weight: 1,
      pool: "projects",
      body: (v) => (v === "bad" ? { baseUrl: "not-a-url" } : { baseUrl: "http://127.0.0.1:1/" }),
      note: "http/routes/models.ts PUT /providers/:provider (parseProviderUpdate)",
    },
    {
      id: "chat-defaults.get",
      method: "GET",
      path: "/api/projects/:x/chat-defaults",
      weight: 1,
      pool: "projects",
      note: "http/routes/chat-defaults.ts GET",
    },
    {
      id: "command-policy.get",
      method: "GET",
      path: "/api/projects/:x/command-policy",
      weight: 1,
      pool: "projects",
      note: "http/routes/command-policy.ts GET",
    },
    {
      id: "amsp.agent.get",
      method: "GET",
      path: `/api/amsp/v1/agents/${projectId}/${agentId}`,
      weight: 1,
      note: "amsp/routes.ts GET agent (public API read path)",
    },
    {
      id: "browser.status",
      method: "GET",
      path: "/api/builtin-browser/status",
      weight: 1,
      note: "builtin-browser routes GET /status (autoStart:none group)",
    },
    {
      id: "events.sse",
      method: "GET",
      path: "/api/events",
      weight: 1,
      note: "http/routes/events.ts SSE (ChannelHub subscribe, bounded abort)",
    },
  ];
}

export function fillPath(
  spec: ApiCallSpec,
  ctx: ApiGenCtx,
  projectId: string,
  agentId: string,
): string {
  let path = spec.path;
  const bucket: Record<string, string[]> = {
    x: ctx.pools.projects,
    a: ctx.pools.agents,
    s: ctx.pools.sessions,
    n: ctx.pools.schedules,
    u: ctx.pools.users,
  };
  path = path.replace(/:x/g, () => poolOr(ctx, "projects", projectId));
  path = path.replace(/:a/g, () => poolOr(ctx, "agents", agentId));
  path = path.replace(/:s/g, () => poolOr(ctx, "sessions", ""));
  path = path.replace(/:n/g, () =>
    ctx.pools.schedules.length > 0 && !ctx.rng.chance(0.2)
      ? ctx.rng.pick(ctx.pools.schedules)
      : "no-such-schedule",
  );
  path = path.replace(/:u/g, () =>
    ctx.pools.users.length > 0 && !ctx.rng.chance(0.2)
      ? ctx.rng.pick(ctx.pools.users)
      : "ghost_user",
  );
  void bucket;
  return path;
}
