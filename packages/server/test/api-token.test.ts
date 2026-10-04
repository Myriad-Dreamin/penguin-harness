/**
 * Bearer credentials: what a command line may present as `Authorization: Bearer`.
 *
 * - The boot's local API token is minted per boot, written to `<root>/api-token` (owner-only)
 *   and accepted as the admin (sessionVia "token"); it also signs session credentials
 *   (session-credential.test.ts). An older boot's value is no credential.
 * - Every App writes the file when it starts, idempotently: a re-assembly (what a hot push
 *   performs) puts a removed file back with the same token, and an App on a runtime that
 *   published no token writes nothing.
 * - A person's sign-in token (`penguin auth login` / `penguin auth token`) authenticates as that
 *   person on every protected route, SSE endpoints included (the CLI consumes SSE via fetch with
 *   headers, so header auth must reach them); the admin's speaks as the admin (sessionVia
 *   "token").
 * - A wrong Bearer is 401, even beside a valid cookie: no silent fallback to the cookie.
 * - A Bearer works on writes (the JSON-only CSRF guard still applies) and on SSE streams, and
 *   the hot-update APIs take the admin's.
 * - The comparison is constant-time and length-aware, and only a Bearer header shape parses.
 */
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MeResponse, SessionCreateResponse } from "../src/api/types.js";
import { apiTokenPath, readApiToken, tokensEqual } from "../src/auth/api-token.js";
import type { AuthRuntimeState } from "../src/auth/runtime-state.js";
import { HMR_AUTH_STATE_RESOURCE_ID } from "../src/hmr/capabilities.js";
import type { Reassembly } from "../src/hmr/capabilities.js";
import { bearerToken } from "../src/auth/middleware.js";
import { adminBearerToken, createTestApp, loginAdmin, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

describe("Bearer credentials", () => {
  let t: TestApp;
  let token: string;

  beforeAll(async () => {
    t = await createTestApp({
      // A token file an older boot wrote: replaced by this boot's.
      beforeSeed: async (root) => {
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(apiTokenPath(root), "older-boot-token\n");
      },
    });
    token = await adminBearerToken(t.app);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  const bearer = (value: string, init: RequestInit = {}, apiPath = "/api/me") =>
    t.app.request(apiPath, {
      ...init,
      headers: {
        authorization: `Bearer ${value}`,
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...((init.headers as Record<string, string>) ?? {}),
      },
    });

  it("boot writes the token to <root>/api-token with owner-only permissions", () => {
    const bootToken = t.deps.authService.localApiToken();
    expect(bootToken).not.toBeNull();
    expect(readApiToken(t.root)).toBe(bootToken);
    if (process.platform !== "win32") {
      expect(fs.statSync(apiTokenPath(t.root)).mode & 0o777).toBe(0o600);
    }
  });

  it("the boot token is the admin (sessionVia 'token'); an older boot's file value is 401", async () => {
    const res = await bearer(t.deps.authService.localApiToken()!);
    expect(res.status).toBe(200);
    const body = (await res.json()) as MeResponse;
    expect(body.user.userId).toBe("admin");
    expect(body.sessionVia).toBe("token");
    expect((await bearer("older-boot-token")).status).toBe(401);
  });

  it("the admin's sign-in token authenticates as the admin (sessionVia 'token'), with no cookie", async () => {
    const res = await bearer(token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as MeResponse;
    expect(body.user.userId).toBe("admin");
    expect(body.user.isAdmin).toBe(true);
    expect(body.sessionVia).toBe("token");
  });

  it("a member's sign-in token is that member, and speaks as a person", async () => {
    const { cookie } = await provisionUser(t.app, "olivia");
    const res = await bearer(cookie.slice(cookie.indexOf("=") + 1));
    expect(res.status).toBe(200);
    const body = (await res.json()) as MeResponse;
    expect(body.user.userId).toBe("olivia");
    expect(body.sessionVia).toBe("password");
  });

  it("a wrong Bearer is 401 — even alongside a valid cookie (no silent fallback)", async () => {
    expect((await bearer("not-the-token")).status).toBe(401);
    const { cookie } = await loginAdmin(t.app);
    const res = await t.app.request("/api/me", {
      headers: { authorization: "Bearer not-the-token", cookie },
    });
    expect(res.status).toBe(401);
    // Without the header the same cookie works (the cookie path is untouched).
    const cookieOnly = await t.app.request("/api/me", { headers: { cookie } });
    expect(cookieOnly.status).toBe(200);
  });

  it("Bearer works on writes (the JSON-only CSRF guard still applies) and on SSE endpoints", async () => {
    // Pin a model whose client constructs without a credential (the anthropic protocol);
    // the seeded preset default may need an env key this machine does not have. The PUT
    // itself is a Bearer-authenticated write too.
    const models = await bearer(
      token,
      {
        method: "PUT",
        body: JSON.stringify({
          defaultModel: { provider: "anthropic", modelId: "claude-sonnet-4-6" },
          models: [{ provider: "anthropic", modelId: "claude-sonnet-4-6", contextWindow: 128000 }],
        }),
      },
      "/api/projects/default_project/models",
    );
    expect(models.status).toBe(200);
    // Write path: create a Session in default_project as the admin, Bearer-only.
    const create = await bearer(
      token,
      { method: "POST", body: JSON.stringify({ client: "cli" }) },
      "/api/projects/default_project/agents/default_agent/sessions",
    );
    expect(create.status).toBe(201);
    const { session } = (await create.json()) as SessionCreateResponse;
    expect(t.deps.sessionsRepo.findById(session.sessionId)!.client).toBe("cli");

    // A write with a form Content-Type is still refused (the CSRF guard is not bypassed).
    const form = await t.app.request(
      "/api/projects/default_project/agents/default_agent/sessions",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "client=cli",
      },
    );
    expect(form.status).toBe(415);

    // SSE: the session stream answers a Bearer-authenticated subscribe.
    const sse = await bearer(token, {}, `/api/sessions/${session.sessionId}/stream`);
    expect(sse.status).toBe(200);
    expect(sse.headers.get("content-type")).toContain("text/event-stream");
    await sse.body?.cancel();
  });

  it("hot-update APIs accept the admin's sign-in token", async () => {
    // /api/hmr/status goes through the same middleware plus the admin check: it must pass the
    // gate (the malformed body then 404s or answers, but never 401/403).
    const res = await bearer(token, {}, "/api/hmr/status");
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("tokensEqual: constant-time compare semantics (equal / different / different length)", () => {
    expect(tokensEqual("abc", "abc")).toBe(true);
    expect(tokensEqual("abc", "abd")).toBe(false);
    expect(tokensEqual("abc", "abcd")).toBe(false);
    expect(tokensEqual("", "")).toBe(true);
  });

  it("bearerToken parses the header shape and nothing else", () => {
    expect(bearerToken("Bearer tok")).toBe("tok");
    expect(bearerToken("bearer tok")).toBe("tok");
    expect(bearerToken("  Bearer   tok  ")).toBe("tok");
    expect(bearerToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken("Bearer")).toBeNull();
  });
});

describe("the api-token file across Apps", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.cleanup();
  });

  // The kernel re-assembly a hot push performs: a new App over the same runtime, asked of
  // whichever App is current.
  const reassemble = async (): Promise<boolean> => {
    const instance = await t.deps.hmr.ensure();
    return instance.api.business()!.api<Reassembly>("RuntimeModule", "Reassembly").reassemble();
  };

  it("a new App puts a removed file back with the same token, and leaves no temp file", async () => {
    const bootToken = t.deps.authService.localApiToken();
    fs.rmSync(apiTokenPath(t.root));
    expect(await reassemble()).toBe(true);
    expect(readApiToken(t.root)).toBe(bootToken);
    expect(fs.readdirSync(t.root).filter((name) => name.startsWith("api-token."))).toEqual([]);
    // Idempotent: an App finding the file as it should be leaves it untouched.
    const before = fs.statSync(apiTokenPath(t.root)).mtimeMs;
    expect(await reassemble()).toBe(true);
    expect(fs.statSync(apiTokenPath(t.root)).mtimeMs).toBe(before);
  });

  it("an App on a runtime that published no token writes no file", async () => {
    const state = t.deps.hmr.resources.claim<AuthRuntimeState>(HMR_AUTH_STATE_RESOURCE_ID)!;
    const bootToken = state.apiToken;
    fs.rmSync(apiTokenPath(t.root));
    state.apiToken = null;
    try {
      expect(await reassemble()).toBe(true);
      expect(fs.existsSync(apiTokenPath(t.root))).toBe(false);
    } finally {
      state.apiToken = bootToken;
      expect(await reassemble()).toBe(true);
    }
    expect(readApiToken(t.root)).toBe(bootToken);
  });
});
