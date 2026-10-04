/**
 * A reply's link to an audio file in the Workspace, end to end: nothing here is intercepted.
 *
 * run.sh enables plugins/example-music for default_project before the server starts. The plugin
 * ships a WEB module: GET /api/contributions forwards it (its manifest — the rule `mp3`/`wav`/
 * `ogg`/`m4a` — and the URL of its built file), and the app adds it to its module tree before it
 * mounts. The mock model answers "music link test" with a reply whose first paragraph links
 * music/evening.wav twice and shows a look-alike link inside a code span, and whose second paragraph
 * links chime.ogg, which does not exist.
 *
 * - The module's file loads with the app; the player's own code (a lazy chunk) is requested only
 *   once a reply links an audio file, and the plugin's stylesheet is attached and applied (a
 *   utility only the player uses resolves).
 * - One player sits directly below each linking paragraph, one per file; the code span gets none.
 *   It is the app's own card (a named play button, a seek bar) over an `<audio>` without the
 *   browser's controls, and pressing play loads the file and reads its length into the card.
 * - The links stay links: same href, no new tab.
 * - The player's src is the Workspace file URL, answering 200 with an audio content type, and the
 *   browser decodes the file; the missing file's player turns into a line saying so.
 * - With `?safe` the reply renders without a player, and no plugin file is requested.
 * - Screenshots of the player (light and dark, zh and en) go to E2E_SHOTS_DIR when it is set.
 */
import path from "node:path";
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = `music_${Date.now().toString(36)}`;
const P = "password123";
const SHOTS = process.env.E2E_SHOTS_DIR;
/** Where the plugin's built web files are served (plugin/web-modules.ts in the server). */
const WEB_FILES = /\/api\/plugins\/@penguinharness\/example-music\/web\/[0-9a-f]{16}\//;

/** A short mono 16-bit WAV: a quarter second of A4. */
function wav() {
  const rate = 8000;
  const n = rate / 4;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / rate)), 44 + i * 2);
  return buf;
}

test("music: a reply's link to an audio file gets a player below its paragraph", async ({
  page,
  browser,
}) => {
  const requested = [];
  page.on("request", (req) => {
    if (WEB_FILES.test(req.url())) requested.push(new URL(req.url()).pathname);
  });
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
          pricing: { cacheRead: 1, cacheWrite: 5, output: 10 },
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
  expect(forwarded.webModules.map((p) => p.package)).toEqual(["@penguinharness/example-music"]);
  expect(forwarded.webModules[0].modules.map((m) => m.manifest.name)).toEqual(["ExampleMusic"]);

  await page.goto(`${BASE}/chat/${sessionId}`);
  const ta = page.getByPlaceholder(/输入消息/);
  await ta.waitFor();
  // The module's file and stylesheet came with the app; the player's chunk — the one the module
  // file imports lazily — has not.
  const moduleUrl = forwarded.webModules[0].modules[0].url;
  expect(requested).toContain(moduleUrl);
  expect(requested.some((p) => p.endsWith("/styles.css"))).toBe(true);
  const moduleCode = await (await page.request.get(`${BASE}${moduleUrl}`)).text();
  const lazyChunk = /import\("\.\/(chunk-[^"]+\.js)"\)/.exec(moduleCode)?.[1];
  expect(lazyChunk, "the module file imports the player lazily").toBeTruthy();
  const playerRequested = () => requested.some((p) => p.endsWith(`/${lazyChunk}`));
  expect(playerRequested()).toBe(false);
  await expect(page.locator('link[data-plugin="@penguinharness/example-music"]')).toHaveCount(1);
  await ta.fill("music link test");
  await page.getByRole("button", { name: "发送" }).click();

  const first = page.locator("p", { hasText: "Here is your tune" });
  await expect(first).toBeVisible();
  // The player is the paragraph's next sibling, holding one player for the file linked twice.
  const below = first.locator("xpath=following-sibling::*[1]");
  await expect(below).toHaveAttribute("data-reply-files");
  await expect(below.locator("audio")).toHaveCount(1);
  const player = below.locator("audio");
  // The reply linked an audio file: now the player's chunk is fetched.
  expect(playerRequested()).toBe(true);
  // The card is drawn with the plugin's own stylesheet: the clock's `min-w-[11ch]` is a utility
  // only the player uses, and the card's radius and surface read the host's tokens.
  const card = below.locator("[data-audio-file]");
  const style = await card.evaluate((el) => {
    const cs = getComputedStyle(el);
    const clock = el.querySelector("[aria-hidden]");
    return {
      radius: cs.borderTopLeftRadius,
      maxWidth: cs.maxWidth,
      clockMinWidth: clock ? getComputedStyle(clock).minWidth : "",
      surface: cs.backgroundColor,
    };
  });
  expect(style.radius).not.toBe("0px");
  expect(style.maxWidth).not.toBe("none");
  expect(style.clockMinWidth).not.toBe("0px");
  expect(style.clockMinWidth).not.toBe("auto");
  expect(style.surface).not.toBe("rgba(0, 0, 0, 0)");
  await expect(player).not.toHaveAttribute("controls");
  await expect(player).toHaveAttribute("preload", "none");
  const play = below.getByRole("button", { name: "播放 evening.wav" });
  await expect(play).toBeVisible();
  // Nothing is fetched before play: the length is unknown and the seek bar is off.
  const seek = below.getByRole("slider", { name: "evening.wav 的播放位置" });
  await expect(seek).toBeDisabled();
  await expect(below.locator("[data-audio-file]")).toContainText("0:00 / -:--");

  // The links are untouched: still links to the file, opening nothing in a new tab.
  const link = first.getByRole("link", { name: "Evening Theme" });
  await expect(link).toHaveAttribute("href", "music/evening.wav");
  await expect(link).not.toHaveAttribute("target", "_blank");
  // Text in a code span is not a link.
  await expect(first.locator("code")).toHaveText("[code](music/code.wav)");
  await expect(page.getByLabel("播放 code.wav")).toHaveCount(0);

  // The second paragraph has its own player; two in the whole reply.
  const second = page.locator("p", { hasText: "And a chime" });
  await expect(second.locator("xpath=following-sibling::*[1]").locator("audio")).toHaveCount(1);
  await expect(page.locator("audio")).toHaveCount(2);

  // The src is the Workspace file URL: 200, an audio type, and a file the browser decodes.
  const src = await player.getAttribute("src");
  expect(src).toBe(`/api/sessions/${sessionId}/files/content?path=music%2Fevening.wav`);
  const res = await page.request.get(`${BASE}${src}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("audio/wav");
  const duration = await player.evaluate(
    (el) =>
      new Promise((resolve, reject) => {
        el.addEventListener("loadedmetadata", () => resolve(el.duration), { once: true });
        el.addEventListener("error", () => reject(new Error("audio error")), { once: true });
        el.load();
      }),
  );
  expect(duration).toBeCloseTo(0.25, 1);

  // Pressing play loads the file into the card: its length arrives, the seek bar turns on, and the
  // quarter-second tune ends back on a play button.
  await play.click();
  await expect(seek).toBeEnabled();
  await expect(seek).toHaveAttribute("aria-valuetext", /，共 0:00$/);
  await expect(below.locator('[data-audio-file="paused"]')).toBeVisible();
  await expect(below.getByRole("button", { name: "播放 evening.wav" })).toBeVisible();

  // A missing file: once loading fails, the player says so instead.
  await second
    .locator("xpath=following-sibling::*[1]")
    .locator("audio")
    .evaluate((el) => el.load());
  await expect(page.getByRole("status").filter({ hasText: "无法播放 chime.ogg" })).toBeVisible();

  if (SHOTS) await shoot(page, browser, sessionId);

  // Safe mode: the same reply, no player, and no plugin file asked for.
  requested.length = 0;
  await page.goto(`${BASE}/chat/${sessionId}?safe`);
  await expect(page.locator("p", { hasText: "Here is your tune" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Evening Theme" })).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(0);
  expect(requested).toEqual([]);
  await expect(page.locator('link[data-plugin="@penguinharness/example-music"]')).toHaveCount(0);
});

/** The player, light and dark, in Chinese and (in a fresh English context) in English. */
async function shoot(page, browser, sessionId) {
  const dark = (on) =>
    page.evaluate((v) => document.documentElement.classList.toggle("dark", v), on);
  const paragraph = page.locator("p", { hasText: "Here is your tune" });
  const region = async (p, file) => {
    const box = await p.locator("p", { hasText: "Here is your tune" }).boundingBox();
    const files = await p.locator("[data-reply-files]").first().boundingBox();
    await p.screenshot({
      path: path.join(SHOTS, file),
      clip: {
        x: Math.max(0, box.x - 16),
        y: Math.max(0, box.y - 16),
        width: Math.max(box.width, files.width) + 32,
        height: files.y + files.height - box.y + 32,
      },
    });
  };
  await paragraph.scrollIntoViewIfNeeded();
  await dark(false);
  await region(page, "player-zh-light.png");
  await dark(true);
  await region(page, "player-zh-dark.png");
  await dark(false);

  const en = await browser.newContext({
    locale: "en-US",
    storageState: await page.context().storageState(),
  });
  const p = await en.newPage();
  await p.goto(`${BASE}/chat/${sessionId}`);
  await expect(p.getByRole("button", { name: "Play evening.wav" })).toBeVisible();
  await region(p, "player-en-light.png");
  await p.evaluate(() => document.documentElement.classList.add("dark"));
  await region(p, "player-en-dark.png");
  await en.close();
}
