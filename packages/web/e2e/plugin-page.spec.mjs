/**
 * A real plugin's page, end to end: nothing here is intercepted.
 *
 * run.sh enables plugins/example-hello-page (with plugins/example-music) for default_project
 * before the server starts. The plugin ships a WEB module: GET /api/contributions forwards it
 * (its manifest — the page's route and nav row — and the URL of its built file), and the app adds
 * it to its module tree before it mounts. What a Project lists is loaded for the whole server, so
 * this spec's own user sees the page too.
 *
 * - The row sits indented directly under the Evaluation Center, named in Chinese and in English,
 *   drawn from the manifest: the page's own code (a lazy chunk) is requested only once the page is
 *   opened, and the plugin's stylesheet is attached with the app.
 * - Opening it draws the plugin's page in the app's frame: the page's one title, its paragraph and
 *   three cards styled from the host's tokens, in the language the app is in (read through the
 *   `Language` interface the app provides), and in the dark theme when the app is.
 * - The collapsed rail draws no row for it and lights the Evaluation Center while it is open.
 * - With `?safe` the row is gone, its path is not routed, and no plugin file is requested.
 * - Screenshots (the page and the nav with its row, light and dark, zh and en) go to E2E_SHOTS_DIR
 *   when it is set.
 */
import path from "node:path";
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const U = `plugpage_${Date.now().toString(36)}`;
const P = "password123";
const PATH = "/example-hello";
const SHOTS = process.env.E2E_SHOTS_DIR;
/** Where the plugin's built web files are served (plugin/web-modules.ts in the server). */
const WEB_FILES = /\/api\/plugins\/@penguinharness\/example-hello-page\/web\/[0-9a-f]{16}\//;

/** Requests for the plugin's built files, as paths, from now on. */
function watchFiles(page) {
  const requested = [];
  page.on("request", (req) => {
    if (WEB_FILES.test(req.url())) requested.push(new URL(req.url()).pathname);
  });
  return requested;
}

/** Switches the theme mode, and lets the shell's colour transitions settle before a shot. */
const dark = async (page, on) => {
  await page.evaluate((v) => document.documentElement.classList.toggle("dark", v), on);
  await page.waitForTimeout(400);
};

test.beforeEach(async ({ page }) => {
  await provisionAndLogin(page.request, U, P);
  await page.setViewportSize({ width: 1280, height: 800 });
});

test("plugin page: a row under the Evaluation Center opens the plugin's own page", async ({
  page,
}) => {
  const requested = watchFiles(page);
  const forwarded = await (await page.request.get(`${BASE}/api/contributions`)).json();
  const hello = forwarded.webModules.find(
    (p) => p.package === "@penguinharness/example-hello-page",
  );
  expect(hello.modules.map((m) => m.manifest.name)).toEqual(["ExampleHelloPage"]);
  const moduleUrl = hello.modules[0].url;
  const moduleCode = await (await page.request.get(`${BASE}${moduleUrl}`)).text();
  const pageChunk = /import\("\.\/(chunk-[^"]+\.js)"\)/.exec(moduleCode)?.[1];
  expect(pageChunk, "the module file imports the page lazily").toBeTruthy();
  const pageRequested = () => requested.some((p) => p.endsWith(`/${pageChunk}`));

  // Not /chat: a fresh user's chat page opens the "no model credential" dialog over the nav.
  await page.goto(`${BASE}/agents`);
  const sidebar = page.locator("aside").first();
  const parent = sidebar.locator('a[href="/benchmark"]');
  const row = sidebar.locator(`a[href="${PATH}"]`);
  await expect(row).toBeVisible();
  await expect(row).toHaveText("插件页面");
  // The row is the manifest's: the module file and the stylesheet came with the app, the page's
  // code did not.
  expect(requested).toContain(moduleUrl);
  expect(requested.some((p) => p.endsWith("/styles.css"))).toBe(true);
  await expect(page.locator('link[data-plugin="@penguinharness/example-hello-page"]')).toHaveCount(
    1,
  );
  expect(pageRequested()).toBe(false);

  // Directly below its parent, and indented.
  const [p, r] = [await parent.boundingBox(), await row.boundingBox()];
  expect(r.x, "indented under the parent").toBeGreaterThan(p.x);
  expect(r.y, "below the parent").toBeGreaterThan(p.y);
  expect(r.y - (p.y + p.height), "nothing between them").toBeLessThan(4);

  await row.click();
  await expect(page).toHaveURL(new RegExp(`${PATH}$`));
  const main = page.locator("main");
  await expect(main.getByRole("heading", { level: 1, name: "插件页面" })).toBeVisible();
  expect(pageRequested()).toBe(true);
  await expect(row).toHaveAttribute("aria-current", "page");
  await expect(main.getByText("当前语言：中文")).toBeVisible();
  const cards = main.locator("[data-example-hello] li");
  await expect(cards).toHaveCount(3);
  // The cards are drawn by the plugin's stylesheet over the host's tokens: a radius, a line and a
  // surface, and another surface in the dark theme.
  const look = () =>
    cards.first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        radius: cs.borderTopLeftRadius,
        border: cs.borderTopWidth,
        surface: cs.backgroundColor,
      };
    });
  const light = await look();
  expect(light.radius).not.toBe("0px");
  expect(light.border).toBe("1px");
  expect(light.surface).not.toBe("rgba(0, 0, 0, 0)");
  await dark(page, true);
  expect((await look()).surface).not.toBe(light.surface);
  await dark(page, false);

  // The collapsed rail: no row of its own, the parent lit while it is open.
  await page.getByRole("button", { name: "收起侧栏" }).click();
  const rail = page.locator("aside nav");
  await expect(rail.locator(`a[href="${PATH}"]`)).toHaveCount(0);
  await expect(rail.locator('a[href="/benchmark"]')).toHaveAttribute("aria-current", "page");
});

test("plugin page: in English, the row and the page", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("penguin.lang", "en"));
  await page.goto(`${BASE}/agents`);
  const row = page.locator("aside").first().locator(`a[href="${PATH}"]`);
  await expect(row).toHaveText("Plugin page");
  await row.click();
  const main = page.locator("main");
  await expect(main.getByRole("heading", { level: 1, name: "Plugin page" })).toBeVisible();
  await expect(main.getByText("Current language: English")).toBeVisible();
});

test("plugin page: opened by its URL, it draws without a detour", async ({ page }) => {
  await page.goto(`${BASE}${PATH}`);
  await expect(page).toHaveURL(new RegExp(`${PATH}$`));
  await expect(
    page.locator("main").getByRole("heading", { level: 1, name: "插件页面" }),
  ).toBeVisible();
});

test("plugin page: safe mode drops the row and the route, and loads nothing of the plugin", async ({
  page,
}) => {
  const requested = watchFiles(page);
  await page.goto(`${BASE}/agents?safe`);
  const sidebar = page.locator("aside").first();
  await expect(sidebar.locator('a[href="/benchmark"]')).toBeVisible();
  await expect(sidebar.locator(`a[href="${PATH}"]`)).toHaveCount(0);
  await page.goto(`${BASE}${PATH}`);
  await expect(page).toHaveURL(/\/chat(\/new)?$/);
  expect(requested).toEqual([]);
});

test("plugin page: screenshots", async ({ page, browser }) => {
  test.skip(!SHOTS, "E2E_SHOTS_DIR is not set");
  await page.goto(`${BASE}${PATH}`);
  await expect(page.locator("[data-example-hello] li")).toHaveCount(3);
  await shoot(page, "zh");
  const en = await browser.newContext({
    locale: "en-US",
    storageState: await page.context().storageState(),
  });
  const p = await en.newPage();
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.addInitScript(() => localStorage.setItem("penguin.lang", "en"));
  await p.goto(`${BASE}${PATH}`);
  await expect(p.locator("[data-example-hello] li")).toHaveCount(3);
  await shoot(p, "en");
  await en.close();
});

/** The page whole, and the nav around the row, light and dark. */
async function shoot(page, lang) {
  const nav = async (file) => {
    const box = await page.locator("aside").first().boundingBox();
    const row = await page.locator(`aside a[href="${PATH}"]`).first().boundingBox();
    const top = Math.max(0, row.y - 160);
    await page.screenshot({
      path: path.join(SHOTS, file),
      clip: { x: box.x, y: top, width: box.width, height: row.y + row.height + 80 - top },
    });
  };
  for (const mode of ["light", "dark"]) {
    await dark(page, mode === "dark");
    await page.screenshot({ path: path.join(SHOTS, `hello-page-${lang}-${mode}.png`) });
    await nav(`nav-child-row-${lang}-${mode}.png`);
  }
  await dark(page, false);
}
