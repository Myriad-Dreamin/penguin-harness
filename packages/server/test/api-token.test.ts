/**
 * Bearer credentials: what a command line may present as `Authorization: Bearer`.
 *
 * - The boot's local API token is minted per boot and held in memory only: it signs session
 *   credentials (session-credential.test.ts) and is no credential itself. No `<root>/api-token`
 *   is written, and one an older build left is removed.
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
import { apiTokenPath, tokensEqual } from "../src/auth/api-token.js";
import { bearerToken } from "../src/auth/middleware.js";
import { adminBearerToken, createTestApp, loginAdmin, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

describe("Bearer credentials", () => {
  let t: TestApp;
  let token: string;

  beforeAll(async () => {
    t = await createTestApp({
      // A token file an older build wrote at its boot: the admin's authority for any reader.
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

  it("boot holds the token in memory: no <root>/api-token, and an older build's is removed", () => {
    expect(t.deps.authService.localApiToken()).not.toBeNull();
    expect(fs.existsSync(apiTokenPath(t.root))).toBe(false);
  });

  it("the boot token and an older build's file value are no credential (401)", async () => {
    expect((await bearer(t.deps.authService.localApiToken()!)).status).toBe(401);
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
