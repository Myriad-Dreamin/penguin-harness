/**
 * The Session list drawn from the list cache (lib/list-cache.ts): a second load shows the rows
 * the servers last answered before this load's list request is answered, and the conversation
 * the route names asks for its messages without waiting for the list. The server's answer then
 * settles the list — a cached row of a Session deleted meanwhile leaves it, and one clicked
 * before the answer takes the ordinary not-found path off the page.
 *
 * API calls ride the app's WebSocket (api/socket.ts), so the list is held there: the socket is
 * proxied, and every `…/agents/<id>/sessions` call frame is kept back until the test releases
 * it. Everything else passes straight through.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "listcacheuser";
const P = "password123";

const LIST_CALL = /^\/api\/projects\/[^/]+\/agents\/[^/]+\/sessions(\?|$)/;

/**
 * Proxies the page's sockets, holding every Session-list call frame until `release()`; `paths`
 * records each call's path in the order the page sent it, `heldCount` how many are held.
 */
async function holdSessionLists(page) {
  const held = [];
  const paths = [];
  let releasing = false;
  await page.routeWebSocket(/./, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      let path = null;
      try {
        path = JSON.parse(String(message))?.call?.path ?? null;
      } catch {
        // Not a call frame: forwarded as is.
      }
      if (path !== null) paths.push(path);
      if (!releasing && path !== null && LIST_CALL.test(path))
        held.push(() => server.send(message));
      else server.send(message);
    });
    server.onMessage((message) => ws.send(message));
  });
  return {
    paths,
    heldCount: () => held.length,
    release: () => {
      releasing = true;
      for (const send of held.splice(0)) send();
    },
  };
}

async function seed(page, tag) {
  await provisionAndLogin(page.request, U, P);
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: { provider: "custom", modelId: "claude-4-8" },
      models: [
        {
          provider: "custom",
          modelId: "claude-4-8",
          apiKey: "sk-mock",
          baseUrl: MOCK,
          contextWindow: 200000,
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();
  const create = async (title) => {
    const res = await page.request.post(
      `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
      { data: {} },
    );
    expect(res.ok(), `create ${title}`).toBeTruthy();
    const { sessionId } = (await res.json()).session;
    const patched = await page.request.patch(`${BASE}/api/sessions/${sessionId}`, {
      data: { title },
    });
    expect(patched.ok(), `title ${title}`).toBeTruthy();
    return sessionId;
  };
  return {
    projectId,
    alpha: await create(`${tag} alpha`),
    beta: await create(`${tag} beta`),
  };
}

/** A first load, settled: the list answered and was written to the cache. */
async function warm(page, tag) {
  await page.goto("/");
  await expect(page.getByTestId("session-row").filter({ hasText: `${tag} alpha` })).toBeVisible();
  await page.waitForFunction(() =>
    Object.keys(localStorage).some((k) => k.startsWith("penguin.listCache.sessions.")),
  );
}

test("a second load draws the list, and opens the routed Session, before the list answers", async ({
  page,
}) => {
  const { alpha } = await seed(page, "Warm");
  await warm(page, "Warm");

  const socket = await holdSessionLists(page);
  await page.goto(`/chat/${alpha}`);
  const alphaRow = page.getByTestId("session-row").filter({ hasText: "Warm alpha" });
  const betaRow = page.getByTestId("session-row").filter({ hasText: "Warm beta" });
  // Drawn as soon as the Project is known — before the list is even asked for, which waits
  // for the Agent list.
  await expect(alphaRow).toBeVisible();
  await expect(betaRow).toBeVisible();
  // Then asked for, and held: nothing has answered for the list, and the rows stay.
  await expect.poll(() => socket.heldCount()).toBeGreaterThan(0);
  await expect(alphaRow).toBeVisible();
  // And the routed conversation did not wait for it.
  await expect
    .poll(() => socket.paths.some((p) => p.startsWith(`/api/sessions/${alpha}/messages`)))
    .toBe(true);
  expect(socket.heldCount()).toBeGreaterThan(0);

  socket.release();
  await expect(alphaRow).toBeVisible();
  await expect(betaRow).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/chat/${alpha}$`));
});

test("a cached row of a deleted Session leaves on the answer; clicked first, it takes the not-found path", async ({
  page,
}) => {
  const { beta } = await seed(page, "Gone");
  await warm(page, "Gone");
  // Deleted with no page open, as from another device: nothing here hears of it.
  await page.goto("about:blank");
  const deleted = await page.request.delete(`${BASE}/api/sessions/${beta}`);
  expect(deleted.ok(), "delete beta").toBeTruthy();

  const socket = await holdSessionLists(page);
  await page.goto("/");
  const betaRow = page.getByTestId("session-row").filter({ hasText: "Gone beta" });
  // Still drawn from the cache: nothing has answered for the list yet.
  await expect(betaRow).toBeVisible();
  await betaRow.click();
  await expect(page).toHaveURL(new RegExp(`/chat/${beta}$`));

  socket.release();
  await expect(betaRow).toHaveCount(0);
  // The direct lookup finds nothing, and the page moves off the Session that is gone.
  await expect(page).not.toHaveURL(new RegExp(`/chat/${beta}$`));
});
