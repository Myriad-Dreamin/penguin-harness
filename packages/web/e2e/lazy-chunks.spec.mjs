/**
 * Code that loads on first show (src/lib/lazy-component.ts), end to end:
 *
 * - A cold open of the chat requests no company-mode, proposals or KaTeX code; a reply with a
 *   formula then loads KaTeX and typesets it, and entering company mode loads its code.
 * - Every page of the main nav, the dashboard and the terminal opens by its address and by a
 *   click from the nav, its code arriving on the way.
 * - A page whose code fails to arrive shows a notice with a Retry instead of a blank page, and the
 *   Retry loads it.
 *
 * Chunk files are named after the module they start at (Vite), which is what the patterns match.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = `lazy_${Date.now().toString(36)}`;
const P = "password123";

const COMPANY = /\/assets\/(org-routes|sidebar-sections|org-switcher)-[^/]*\.js$/;
const PROPOSALS = /\/assets\/proposals-page-[^/]*\.js$/;
const KATEX = /\/assets\/math-stage-[^/]*\.(js|css)$/;

/** Every script and stylesheet the page asks for, by path, as they are asked. */
function assetRequests(page) {
  const paths = [];
  page.on("request", (req) => {
    const { pathname } = new URL(req.url());
    if (pathname.startsWith("/assets/")) paths.push(pathname);
  });
  return paths;
}

async function enableCompanyMode() {
  const adminCtx = await request.newContext();
  try {
    await login(adminCtx, ADMIN_ID, ADMIN_PASSWORD);
    const res = await adminCtx.put(`${BASE}/api/admin/settings`, { data: { companyMode: true } });
    expect(res.ok(), "enable company mode").toBeTruthy();
  } finally {
    await adminCtx.dispose();
  }
}

/** Gives the signed-in user's Project a model on the mock, so the chat opens without asking for one. */
async function useMockModel(page) {
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
  return projectId;
}

/** The page drew something and is neither still pending nor showing the failed-load notice. */
async function expectPageDrawn(page) {
  // The pending state a deferred page shows is the boot status (components/ui/boot-pending.tsx).
  await expect(page.locator("[role=status].anim-boot-pending")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByText("这部分界面没能加载")).toHaveCount(0);
  await expect(page.locator("#root")).not.toBeEmpty();
}

test("a cold open of the chat loads no company, proposals or KaTeX code until they are needed", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await enableCompanyMode();
  await provisionAndLogin(page.request, U, P);
  const projectId = await useMockModel(page);
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: {} },
  );
  const sessionId = (await created.json()).session.sessionId;

  const assets = assetRequests(page);
  await page.goto(`${BASE}/chat/${sessionId}`);
  const ta = page.getByPlaceholder(/输入消息/);
  await ta.waitFor();
  await page.waitForLoadState("networkidle");
  expect(assets.filter((p) => COMPANY.test(p) || PROPOSALS.test(p) || KATEX.test(p))).toEqual([]);

  // A reply with a formula: KaTeX (script and stylesheet) loads, and the formula is typeset.
  await ta.fill("math reply test");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.locator(".katex").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".katex-display")).toHaveCount(1);
  expect(assets.some((p) => /\/assets\/math-stage-[^/]*\.js$/.test(p))).toBe(true);
  expect(assets.some((p) => /\/assets\/math-stage-[^/]*\.css$/.test(p))).toBe(true);
  expect(assets.filter((p) => COMPANY.test(p))).toEqual([]);

  // Entering company mode loads its code.
  const modeSwitch = page.getByRole("group", { name: "工作模式" });
  await modeSwitch.getByRole("button", { name: /^公司/ }).click();
  await expect(page).toHaveURL(/\/org/);
  await expect(page.getByRole("button", { name: "新建组织", exact: true }).first()).toBeVisible();
  expect(assets.some((p) => /\/assets\/org-routes-/.test(p))).toBe(true);
  expect(assets.some((p) => /\/assets\/sidebar-sections-/.test(p))).toBe(true);
});

/** The nav group's fold toggle while folded (S.nav.expandGroup). */
const EXPAND = "展开";
const NAV_PAGES = ["/agents", "/models", "/plugins", "/machines", "/usage", "/benchmark"];

test("every page opens by its address and by a click, its code loading on the way", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  for (const path of [...NAV_PAGES, "/dashboard", "/terminal"]) {
    await page.goto(`${BASE}${path}`);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expectPageDrawn(page);
  }
  // By a click, each from a fresh load of the chat, so its code is not yet in this document.
  for (const path of NAV_PAGES) {
    await page.goto(`${BASE}/chat`);
    await page.getByPlaceholder(/输入消息/).waitFor();
    // The admin has no model, and the chat says so in a dialog over the nav: dismissed.
    await page.waitForLoadState("networkidle");
    if ((await page.getByRole("dialog").count()) > 0) await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const row = page.locator(`a[href="${path}"]`).first();
    // A folded row is out of reach until the group opens.
    if (!(await row.isVisible())) await page.getByRole("button", { name: EXPAND }).first().click();
    await row.click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expectPageDrawn(page);
  }
});

test("a page whose code does not arrive offers a retry instead of a blank page", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const block = (route) => route.abort("connectionreset");
  await page.route(/\/assets\/usage-page-[^/]*\.js$/, block);
  await page.goto(`${BASE}/usage`);
  const notice = page.getByRole("alert").filter({ hasText: "这部分界面没能加载" });
  await expect(notice).toBeVisible({ timeout: 15_000 });
  // The rest of the app is still there around it.
  await expect(page.locator(`a[href="/agents"]`).first()).toBeAttached();
  await page.unroute(/\/assets\/usage-page-[^/]*\.js$/, block);
  await notice.getByRole("button", { name: "重试" }).click();
  await expect(notice).toHaveCount(0);
  await expectPageDrawn(page);
});
