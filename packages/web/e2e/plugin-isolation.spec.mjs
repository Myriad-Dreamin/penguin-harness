/**
 * A plugin's web code failing degrades only its own part of the page (components/ui/deferred.tsx,
 * plugins/assemble.ts). run.sh enables plugins/example-music for this server, so
 * GET /api/contributions forwards its web module, whose player is a lazy chunk.
 *
 * - The player's chunk answering with code that throws while rendering: the reply shows the
 *   part-failed notice where the player would be, the reply's text and the composer stay, and no
 *   rescue panel replaces the app.
 * - The player's chunk answering 404 (the plugin rebuilt under an open tab): the load notice in
 *   the same place, nothing more.
 * - The module file held and never answered: the app still boots once the plugin's load deadline
 *   has passed, and the plugin is recorded as left out with that reason. (The Plugins page shows
 *   the reason on the row of a plugin the Project lists; run.sh lists the examples for
 *   default_project, not for the spec's own user's Project, so the record is read from the
 *   console here.)
 * - The boot's list request is in flight together with the install reconcile, not after it.
 *
 * Screenshots go to E2E_SHOTS_DIR when it is set.
 */
import path from "node:path";
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = `piso_${Date.now().toString(36)}`;
const P = "password123";
const SHOTS = process.env.E2E_SHOTS_DIR;
const PKG = "@penguinharness/example-music";

/** A short mono 16-bit WAV of silence: something for the reply to link. */
function wav() {
  const n = 2000;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(8000, 24);
  buf.writeUInt32LE(16000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  return buf;
}

/** A Project with the mock model, a Session holding music/evening.wav, and the music package. */
async function setUp(page) {
  await provisionAndLogin(page.request, U, P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
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
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: {} },
  );
  const sessionId = (await created.json()).session.sessionId;
  const up = await page.request.put(
    `${BASE}/api/sessions/${sessionId}/files/content?path=music%2Fevening.wav`,
    { data: { dataBase64: wav().toString("base64") } },
  );
  expect(up.ok(), "upload wav").toBeTruthy();
  const forwarded = await (await page.request.get(`${BASE}/api/contributions`)).json();
  const music = forwarded.webModules.find((p) => p.package === PKG);
  const moduleUrl = music.modules[0].url;
  const moduleCode = await (await page.request.get(`${BASE}${moduleUrl}`)).text();
  const lazyChunk = /import\("\.\/(chunk-[^"]+\.js)"\)/.exec(moduleCode)?.[1];
  expect(lazyChunk, "the module file imports the player lazily").toBeTruthy();
  return { chat: `${BASE}/chat/${sessionId}`, moduleUrl, lazyChunk };
}

/** The app-wide rescue panel; the part-failed notice says "界面出错了" too, so it is excluded. */
const rescuePanel = (page) =>
  page.locator('[role="alert"]:not([data-part-failed])').filter({ hasText: "界面出错了" });

/** Sends the prompt the mock answers with a reply linking music/evening.wav. */
async function askForTheTune(page) {
  const ta = page.getByPlaceholder(/输入消息/);
  await ta.waitFor();
  await ta.fill("music link test");
  await page.getByRole("button", { name: "发送" }).click();
  const first = page.locator("p", { hasText: "Here is your tune" });
  await expect(first).toBeVisible();
  return first.locator("xpath=following-sibling::*[1]");
}

test("a file renderer that throws fails only its own block", async ({ page }) => {
  const { chat, lazyChunk } = await setUp(page);
  // The chunk's default export throws on render: what a buggy plugin component does.
  await page.route(`**/${lazyChunk}`, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: 'export default function Broken() { throw new Error("plugin render bug"); }',
    }),
  );
  await page.goto(chat);
  const below = await askForTheTune(page);
  await expect(below).toHaveAttribute("data-reply-files");
  const notice = below.locator("[data-part-failed]");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("这部分界面出错了");
  await expect(notice.getByRole("button", { name: "重试" })).toBeVisible();
  await expect(rescuePanel(page)).toHaveCount(0);
  await expect(page.getByPlaceholder(/输入消息/)).toBeVisible();
  if (SHOTS) await below.screenshot({ path: path.join(SHOTS, "plugin-render-throws.png") });
});

test("a plugin chunk that 404s fails only its own block", async ({ page }) => {
  const { chat, lazyChunk } = await setUp(page);
  await page.route(`**/${lazyChunk}`, (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto(chat);
  const below = await askForTheTune(page);
  const notice = below.locator("[data-part-failed]");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("这部分界面没能加载");
  await expect(rescuePanel(page)).toHaveCount(0);
  await expect(page.getByPlaceholder(/输入消息/)).toBeVisible();
});

test("a held plugin file: the app boots after the deadline and says why", async ({ page }) => {
  const { moduleUrl } = await setUp(page);
  const order = [];
  page.on("request", (req) => {
    const p = new URL(req.url()).pathname;
    if (p === "/api/install" || p === "/api/contributions" || p === "/api/me")
      order.push({ p, t: Date.now(), kind: "req" });
  });
  page.on("response", (res) => {
    const p = new URL(res.url()).pathname;
    if (p === "/api/install" || p === "/api/contributions" || p === "/api/me")
      order.push({ p, t: Date.now(), kind: "res" });
  });
  const warnings = [];
  page.on("console", (msg) => {
    if (msg.type() === "warning") warnings.push(msg.text());
  });
  // Never answered: a stalled request.
  await page.route(`**${moduleUrl}`, () => new Promise(() => {}));
  const started = Date.now();
  await page.goto(`${BASE}/plugins`);
  await expect(page.getByRole("heading", { level: 1, name: "插件" })).toBeVisible({
    timeout: 15_000,
  });
  const bootMs = Date.now() - started;
  // PLUGIN_LOAD_DEADLINE_MS (4 s), and not much more.
  expect(bootMs).toBeGreaterThan(3500);
  expect(bootMs).toBeLessThan(12_000);
  // The list request was sent before the install reconcile had answered: side by side.
  const sent = (p) => order.find((e) => e.p === p && e.kind === "req")?.t;
  const answered = (p) => order.find((e) => e.p === p && e.kind === "res")?.t;
  expect(sent("/api/contributions")).toBeDefined();
  expect(sent("/api/contributions")).toBeLessThanOrEqual(answered("/api/install"));
  console.log(
    `[plugin-isolation] boot with a held file: ${bootMs} ms; requests ${JSON.stringify(order.map((e) => [e.kind, e.p, e.t - started]))}`,
  );

  await expect
    .poll(() => warnings.find((w) => w.includes(`web modules of ${PKG} left out`)) ?? "")
    .toContain("its files did not load within 4000 ms");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "boot-after-deadline.png") });
});
