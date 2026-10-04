/**
 * The boot's list of plugin web modules, kept across loads (plugins/forwarded.ts, list-cache.ts):
 * run.sh enables plugins/example-music for this server, so GET /api/contributions forwards its
 * web module.
 *
 * - The first load has no kept list: it waits for the answer, assembles the module and keeps the
 *   list.
 * - A second load assembles the module from the kept list while its GET /api/contributions is
 *   still held (the module's file and stylesheet are fetched, the app is up), and once the answer
 *   arrives with the same list it does not reload.
 * - A kept list that no longer matches (a stale build id, whose file 404s) is replaced by the
 *   answer and the page reloads exactly once, after which the module's real file loads.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const U = `plc_${Date.now().toString(36)}`;
const P = "password123";
const KEY = "penguin.listCache.webModules";
const MODULE_FILE =
  /\/api\/plugins\/@penguinharness\/example-music\/web\/[0-9a-f]{16}\/ExampleMusic\.js$/;

test("plugin web modules boot from the kept list, and a changed list reloads once", async ({
  page,
}) => {
  await provisionAndLogin(page.request, U, P);
  const files = [];
  page.on("request", (req) => {
    const p = new URL(req.url()).pathname;
    if (p.startsWith("/api/plugins/")) files.push(p);
  });
  let loads = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) loads += 1;
  });
  const composer = page.getByPlaceholder(/输入消息/);

  // First load: nothing kept, so the boot waits for the answer — and keeps it.
  await page.goto(`${BASE}/`);
  await composer.waitFor();
  expect(files.some((p) => MODULE_FILE.test(p))).toBe(true);
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k) ?? "", KEY))
    .toContain("@penguinharness/example-music");

  // Second load, its contributions request held: the module is assembled from the kept list.
  let release = () => {};
  const held = new Promise((resolve) => (release = resolve));
  let asked = 0;
  await page.route("**/api/contributions", async (route) => {
    asked += 1;
    await held;
    await route.continue();
  });
  files.length = 0;
  loads = 0;
  await page.goto(`${BASE}/`);
  await composer.waitFor();
  expect(files.some((p) => MODULE_FILE.test(p))).toBe(true);
  await expect(page.locator('link[data-plugin="@penguinharness/example-music"]')).toHaveCount(1);
  expect(asked).toBe(1);
  const answered = page.waitForResponse((r) => r.url().endsWith("/api/contributions"));
  release();
  await answered;
  await page.waitForTimeout(1500);
  expect(loads).toBe(1);
  await page.unroute("**/api/contributions");

  // A kept list naming a build that is gone: its file 404s, the answer replaces the list, and
  // the page reloads once — then loads the real file and stays.
  await page.evaluate((k) => {
    const doc = JSON.parse(localStorage.getItem(k));
    const m = doc.packages[0].modules[0];
    m.url = m.url.replace(/\/web\/[0-9a-f]{16}\//, "/web/0000000000000000/");
    localStorage.setItem(k, JSON.stringify(doc));
  }, KEY);
  files.length = 0;
  loads = 0;
  await page.goto(`${BASE}/`);
  await expect.poll(() => loads).toBe(2);
  await composer.waitFor();
  await expect.poll(() => files.some((p) => MODULE_FILE.test(p))).toBe(true);
  expect(files.some((p) => p.includes("/web/0000000000000000/"))).toBe(true);
  await page.waitForTimeout(1500);
  expect(loads).toBe(2);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).not.toContain(
    "0000000000000000",
  );
});
