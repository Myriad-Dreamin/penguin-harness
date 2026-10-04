/**
 * A real plugin removes a page, end to end, beside the other two examples: nothing here is
 * intercepted.
 *
 * run.sh runs this spec in a plugin set of its own ("all-examples"): a server whose
 * default_project enables all three examples — plugins/example-hello-page, whose page sits under
 * the Evaluation Center; plugins/example-music; and plugins/example-no-evaluation-center, whose one
 * module is data only and removes the page keyed `benchmark`. What a Project lists is loaded for
 * the whole server, so no other spec runs against this one.
 *
 * - The three packages are forwarded and all three join the tree: the removal's module without a
 *   file (nothing of it is requested), the other two with theirs and a stylesheet each, and no
 *   package is left out.
 * - The Evaluation Center has no row in the sidebar or the collapsed rail — not even for a moment
 *   after a reload, since the removal is in the tree from the first render — and neither has the
 *   hello page under it: removing a page drops its children.
 * - /benchmark, one Benchmark's /benchmark/<id> and the child's path all fall to the catch-all.
 * - With `?safe` no plugin is assembled: the Evaluation Center is back and opens, without the
 *   hello row; leaving safe mode reloads with the plugins, and the open page falls to the
 *   catch-all.
 * - Screenshots of the nav after the removal (light and dark, zh and en) go to E2E_SHOTS_DIR.
 */
import path from "node:path";
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const U = `noeval_${Date.now().toString(36)}`;
const P = "password123";
const CHILD = "/example-hello";
const SHOTS = process.env.E2E_SHOTS_DIR;
const PLUGIN_FILES = /\/api\/plugins\/(@penguinharness\/[^/]+)\/web\//;

// The catch-all leads to /chat, which a fresh user's chat page turns into /chat/new.
const AT_CHAT = /\/chat(\/new)?$/;
const marker = (page) => page.getByRole("status").filter({ hasText: "安全模式：未加载服务端贡献" });

test.beforeEach(async ({ page }) => {
  await provisionAndLogin(page.request, U, P);
  await page.setViewportSize({ width: 1280, height: 800 });
});

test("all three examples: the removal, the page under it and the player's sheet coexist", async ({
  page,
}) => {
  const fetched = new Set();
  page.on("request", (req) => {
    const m = PLUGIN_FILES.exec(req.url());
    if (m) fetched.add(m[1]);
  });
  const leftOut = [];
  page.on("console", (msg) => {
    if (msg.text().includes("[plugins] web modules of")) leftOut.push(msg.text());
  });
  // Asked here rather than watched: the app's own API calls ride its socket, which a response
  // listener does not see. The request shares the signed-in page's cookies.
  const body = await (await page.request.get(`${BASE}/api/contributions`)).json();
  expect("pageRemovals" in body).toBe(false);
  const byName = Object.fromEntries(body.webModules.map((p) => [p.package, p]));
  expect(Object.keys(byName).sort()).toEqual([
    "@penguinharness/example-hello-page",
    "@penguinharness/example-music",
    "@penguinharness/example-no-evaluation-center",
  ]);
  const removal = byName["@penguinharness/example-no-evaluation-center"];
  expect(removal.modules).toEqual([
    {
      manifest: expect.objectContaining({
        name: "NoEvaluationCenter",
        contributes: {
          "ShellModule.pageRemovals": [
            { id: "example-no-evaluation-center.benchmark", key: "benchmark" },
          ],
        },
      }),
    },
  ]);
  expect(removal.styles).toEqual([]);

  // Not /chat: a fresh user's chat page opens the "no model credential" dialog over the nav.
  await page.goto(`${BASE}/agents`);
  const sidebar = page.locator("aside").first();
  await expect(sidebar.locator('a[href="/agents"]')).toBeVisible();
  await expect(sidebar.locator('a[href="/benchmark"]')).toHaveCount(0);
  await expect(sidebar.locator(`a[href="${CHILD}"]`)).toHaveCount(0);
  // Two sheets, one per plugin with code; nothing fetched for the data-only one.
  await expect(page.locator("link[data-plugin]")).toHaveCount(2);
  expect([...fetched].sort()).toEqual([
    "@penguinharness/example-hello-page",
    "@penguinharness/example-music",
  ]);
  expect(leftOut).toEqual([]);

  if (SHOTS) await shootNav(page, "zh");

  await page.getByRole("button", { name: "收起侧栏" }).click();
  const rail = page.locator("aside nav");
  await expect(rail.locator('a[href="/agents"]')).toBeVisible();
  await expect(rail.locator('a[href="/benchmark"]')).toHaveCount(0);
  await page.getByRole("button", { name: "展开侧栏" }).click();

  for (const target of ["/benchmark", "/benchmark/some-benchmark", CHILD]) {
    await page.goto(`${BASE}${target}`);
    await expect(page, target).toHaveURL(AT_CHAT);
  }
});

test("all three examples: no moment with the removed row after a reload", async ({ page }) => {
  await page.goto(`${BASE}/agents`);
  await expect(page.locator('aside a[href="/agents"]').first()).toBeVisible();
  // Watch the nav from the reload's first paint: the removed row is never drawn.
  await page.evaluate(() => sessionStorage.setItem("penguin.e2e.sawBenchmark", "0"));
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (document.querySelector('aside a[href="/benchmark"]'))
        sessionStorage.setItem("penguin.e2e.sawBenchmark", "1");
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  await expect(page.locator('aside a[href="/agents"]').first()).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("penguin.e2e.sawBenchmark"))).toBe("0");
});

test("page removal: safe mode brings the Evaluation Center back, leaving it removes it again", async ({
  page,
}) => {
  await page.goto(`${BASE}/agents?safe`);
  await expect(marker(page)).toBeVisible();
  const sidebar = page.locator("aside").first();
  await expect(sidebar.locator('a[href="/benchmark"]')).toBeVisible();
  await expect(sidebar.locator(`a[href="${CHILD}"]`)).toHaveCount(0);

  await sidebar.locator('a[href="/benchmark"]').click();
  await expect(page).toHaveURL(/\/benchmark$/);
  await expect(sidebar.locator('a[href="/benchmark"]')).toHaveAttribute("aria-current", "page");

  await marker(page).getByRole("button", { name: "离开安全模式", exact: true }).click();
  await expect(marker(page)).toHaveCount(0);
  await expect(page).toHaveURL(AT_CHAT);
  await expect(page.locator("aside").first().locator('a[href="/benchmark"]')).toHaveCount(0);
});

test("page removal: nav screenshots in English", async ({ page }) => {
  test.skip(!SHOTS, "E2E_SHOTS_DIR is not set");
  await page.addInitScript(() => localStorage.setItem("penguin.lang", "en"));
  await page.goto(`${BASE}/agents`);
  await expect(page.locator('aside a[href="/agents"]').first()).toBeVisible();
  await shootNav(page, "en");
});

/** The expanded nav after the removal, light and dark. */
async function shootNav(page, lang) {
  const nav = page.locator("aside").first();
  for (const mode of ["light", "dark"]) {
    await page.evaluate(
      (v) => document.documentElement.classList.toggle("dark", v),
      mode === "dark",
    );
    // The shell's colour transitions settle before the shot.
    await page.waitForTimeout(400);
    const box = await nav.boundingBox();
    await page.screenshot({
      path: path.join(SHOTS, `nav-removed-${lang}-${mode}.png`),
      clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 520) },
    });
  }
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
}
