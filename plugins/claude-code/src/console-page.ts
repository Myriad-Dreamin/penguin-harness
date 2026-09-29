/**
 * The Claude Code console: a company-mode page listing an organization's Claude Code runs — the
 * ones working now, the ones waiting for a slot, and the ones that ended — with the server's
 * slots above them. A running (or ended) run's Open goes to its Session, where the person is
 * inside the very program the employee started and can type into it; Release lets go of a run.
 *
 * Served whole from the plugin, one HTML document with its style and script inline, in the
 * shape of the company-roadmaps page: the web app mounts it in an iframe at
 * `/org/:projectId/:orgId/claude-code`, the page reads the organization off its parent's URL
 * (same origin), asks the queue's routes with the cookie it already has, dresses itself in the
 * app's resolved theme values, follows the app's language, and reads the list again every few
 * seconds. An organization that runs on another machine is asked through `/server/<machine>/`.
 */
import { Hono } from "hono";

/** The page's route group: a prefix without parameters, since the iframe's src cannot name them. */
export const PAGE_ROUTES_ID = "claude-code.page-routes";
export const PAGE_PREFIX = "/api/claude-code";
/** Where the iframe points. */
export const PAGE_SRC = `${PAGE_PREFIX}/page`;
/** How often the list is read again. */
export const PAGE_REFRESH_MS = 3000;

/** The app's resolved theme values the page copies from its parent (web's lib/workflow-theme.ts list). */
export const THEME_VARS = [
  "--font-app-sans",
  "--accent-bg",
  "--accent-fg",
  "--color-gray-50",
  "--color-gray-100",
  "--color-gray-200",
  "--color-gray-300",
  "--color-gray-400",
  "--color-gray-500",
  "--color-gray-600",
  "--color-gray-700",
  "--color-gray-800",
  "--color-gray-900",
  "--color-gray-950",
] as const;

/** The page's words, in the app's two languages. */
export const PAGE_STRINGS = {
  en: {
    title: "Claude Code",
    loading: "Reading the runs…",
    lead: "Employees queue Claude Code runs here; each one starts by itself when a slot is free, and closes after it has sat idle too long.",
    slots: "{running} of {capacity} slots in use on this server · {queued} waiting",
    idleRule: "A run that has sat idle for {minutes} min is closed and its slot handed on.",
    idleNever: "Idle runs are never closed by the queue.",
    empty: "No runs yet. An employee queues one with `penguin org claude-code run`.",
    queued: "Waiting",
    working: "Working",
    idle: "Waiting for input",
    ended: "Ended",
    exited: "exited",
    released: "released",
    cancelled: "cancelled",
    idleEnd: "closed when idle",
    failed: "could not start",
    lost: "lost",
    position: "#{n} in line",
    open: "Open",
    release: "Release",
    cancel: "Cancel",
    confirmRelease: "Close this Claude Code and hand its slot on?",
    confirmCancel: "Take this run out of the line?",
    by: "queued by",
    failedRead: "Could not read the runs",
    noOrg: "This page belongs to an organization: open it from company mode.",
  },
  zh: {
    title: "Claude Code",
    loading: "正在读取运行…",
    lead: "员工在这里排队使用 Claude Code；有空位时自动启动，空闲过久自动关闭。",
    slots: "本服务器已用 {running} / {capacity} 个名额 · {queued} 个在排队",
    idleRule: "空闲满 {minutes} 分钟的运行会被关闭，名额交给下一个。",
    idleNever: "队列不会关闭空闲的运行。",
    empty: "还没有运行。员工用 `penguin org claude-code run` 排队。",
    queued: "排队中",
    working: "工作中",
    idle: "等待输入",
    ended: "已结束",
    exited: "已退出",
    released: "已释放",
    cancelled: "已取消",
    idleEnd: "空闲关闭",
    failed: "启动失败",
    lost: "已丢失",
    position: "第 {n} 位",
    open: "进入",
    release: "释放",
    cancel: "取消",
    confirmRelease: "关闭这个 Claude Code，把名额交给下一个？",
    confirmCancel: "把这个运行移出队列？",
    by: "排队人",
    failedRead: "读取运行失败",
    noOrg: "这个页面属于某个组织：请从公司模式打开。",
  },
} as const;

const STYLE = `
:root {
  --cc-bg: var(--wf-bg, #ffffff);
  --cc-fg: var(--wf-fg, #111827);
  --cc-muted: var(--wf-muted, #6b7280);
  --cc-line: var(--wf-border, #e5e7eb);
  --cc-hover: var(--wf-hover, #f3f4f6);
  --cc-accent: var(--wf-accent, #111827);
  --cc-accent-fg: var(--wf-accent-fg, #ffffff);
  --cc-gray-bg: var(--color-gray-100, #f3f4f6); --cc-gray-fg: var(--color-gray-600, #4b5563);
  --cc-ok-bg: #ecfdf5; --cc-ok-fg: #047857;
  --cc-info-bg: #eff6ff; --cc-info-fg: #1d4ed8;
  --cc-warn-bg: #fffbeb; --cc-warn-fg: #b45309;
  --cc-bad-bg: #fef2f2; --cc-bad-fg: #c10007;
}
:root.dark {
  --cc-gray-bg: var(--color-gray-800, #1f1f1f); --cc-gray-fg: var(--color-gray-300, #d1d5db);
  --cc-ok-bg: #002c22; --cc-ok-fg: #5ee9b5;
  --cc-info-bg: #162456; --cc-info-fg: #8ec5ff;
  --cc-warn-bg: #461901; --cc-warn-fg: #ffd236;
  --cc-bad-bg: #460809; --cc-bad-fg: #ffa2a2;
}
* { box-sizing: border-box; }
body { margin: 0; padding: 1rem; background: var(--cc-bg); color: var(--cc-fg); font-size: 0.875rem; line-height: 1.5; }
@media (min-width: 768px) { body { padding: 1.5rem; } }
main { max-width: 72rem; margin: 0 auto; }
h1 { margin: 0 0 0.25rem; font-size: 1.25rem; font-weight: 600; line-height: 1.3; }
.muted { color: var(--cc-muted); }
.small { font-size: 0.75rem; }
.summary { margin: 0.75rem 0 1rem; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; }
.list { border: 1px solid var(--cc-line); border-radius: 0.5rem; overflow: hidden; }
.row { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.625rem 0.875rem; border-top: 1px solid var(--cc-line); }
.row:first-child { border-top: 0; }
.row:hover { background: var(--cc-hover); }
.id { font-variant-numeric: tabular-nums; color: var(--cc-muted); min-width: 2.25rem; }
.body { flex: 1; min-width: 0; }
.name { font-weight: 500; overflow-wrap: anywhere; }
.meta { color: var(--cc-muted); font-size: 0.75rem; overflow-wrap: anywhere; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; }
.pill { display: inline-block; white-space: nowrap; border-radius: 9999px; padding: 0 0.5rem; font-size: 0.75rem; line-height: 1.25rem; }
.pill.ok { background: var(--cc-ok-bg); color: var(--cc-ok-fg); }
.pill.info { background: var(--cc-info-bg); color: var(--cc-info-fg); }
.pill.warn { background: var(--cc-warn-bg); color: var(--cc-warn-fg); }
.pill.bad { background: var(--cc-bad-bg); color: var(--cc-bad-fg); }
.pill.gray { background: var(--cc-gray-bg); color: var(--cc-gray-fg); }
.actions { display: flex; gap: 0.375rem; flex-shrink: 0; }
button, a.button { font: inherit; font-size: 0.75rem; border: 1px solid var(--cc-line); background: var(--cc-bg); color: var(--cc-fg); border-radius: 0.375rem; padding: 0.125rem 0.625rem; cursor: pointer; text-decoration: none; white-space: nowrap; }
button.primary, a.button.primary { background: var(--cc-accent); color: var(--cc-accent-fg); border-color: var(--cc-accent); }
.empty { padding: 2rem 1rem; text-align: center; color: var(--cc-muted); }
.error { color: var(--cc-bad-fg); }
`;

const SCRIPT = `
const STRINGS = ${JSON.stringify(PAGE_STRINGS)};
// "{name}" in a string, filled from the values.
// Spelled without a regular expression: this script sits in a template literal, which eats a lone backslash.
const fill = (text, values) => Object.keys(values).reduce((s, k) => s.split("{" + k + "}").join(String(values[k])), String(text));
const THEME_VARS = ${JSON.stringify(THEME_VARS)};
const REFRESH_MS = ${PAGE_REFRESH_MS};
const main = document.getElementById("main");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const read = (f, fallback) => { try { return f(); } catch { return fallback; } };
const lang = String(read(() => localStorage.getItem("penguin.lang"), null) || navigator.language || "en").startsWith("zh") ? "zh" : "en";
const T = STRINGS[lang];
document.documentElement.lang = lang;
document.title = T.title;
const root = document.documentElement;
function syncTheme() {
  const dark = read(() => window.parent.document.documentElement.classList.contains("dark"), false);
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
  const parent = read(() => window.parent.document.documentElement, null);
  const computed = parent && parent !== root ? read(() => window.parent.getComputedStyle(parent), null) : null;
  if (computed) {
    for (const name of THEME_VARS) {
      const value = String(computed.getPropertyValue(name) || "").trim();
      if (value !== "") root.style.setProperty(name, value);
    }
    const size = read(() => parent.style.fontSize, "") || computed.fontSize;
    if (size) root.style.fontSize = size;
  }
}
syncTheme();
read(() => {
  if (typeof MutationObserver !== "function" || window.parent === window) return;
  new MutationObserver(syncTheme).observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
}, null);
const where = read(() => window.parent.location.pathname, location.pathname);
const m = /\\/org\\/([^/]+)\\/([^/]+)\\/claude-code/.exec(where);
const head = '<h1>' + esc(T.title) + '</h1><p class="muted">' + esc(T.lead) + '</p>';
async function request(method, url) {
  const res = await fetch(url, { method, credentials: "same-origin", headers: method === "POST" ? { "content-type": "application/json" } : {}, body: method === "POST" ? "{}" : undefined });
  if (!res.ok) {
    let message = "";
    try { const b = await res.json(); message = (b && b.error && b.error.message) || ""; } catch {}
    throw new Error(method + " " + url + " → " + res.status + (message ? ": " + message : ""));
  }
  return res.json();
}
let base = m === null ? "" : "/api/projects/" + m[1] + "/organizations/" + m[2] + "/claude-code";
async function resolveOrg() {
  try {
    const listing = await request("GET", "/api/projects/" + m[1] + "/organizations");
    const mine = (listing.organizations || []).find((o) => o.orgId === decodeURIComponent(m[2]));
    if (mine && typeof mine.machineId === "string" && mine.machineId !== "") base = "/server/" + encodeURIComponent(mine.machineId) + base;
  } catch {
    // No listing: asked here, where the organization runs unless it says otherwise.
  }
}
const go = (path) => {
  const entered = read(() => {
    const parent = window.parent;
    if (!parent || parent === window || !parent.history) return false;
    parent.history.pushState(null, "", path);
    parent.dispatchEvent(new parent.PopStateEvent("popstate"));
    return true;
  }, false);
  if (!entered) read(() => { window.top.location.href = path; }, null);
};
const ENDS = { exited: T.exited, released: T.released, cancelled: T.cancelled, idle: T.idleEnd, failed: T.failed, lost: T.lost };
function pill(r) {
  if (r.status === "queued") return '<span class="pill warn">' + esc(T.queued) + (r.position ? " · " + esc(fill(T.position, { n: r.position })) : "") + "</span>";
  if (r.status === "running") return r.activity === "working" ? '<span class="pill info">' + esc(T.working) + "</span>" : '<span class="pill ok">' + esc(T.idle) + "</span>";
  const tone = r.end === "failed" || r.end === "lost" ? "bad" : "gray";
  return '<span class="pill ' + tone + '">' + esc(T.ended) + (r.end ? " · " + esc(ENDS[r.end] || r.end) : "") + "</span>";
}
const firstLine = (s) => String(s || "").split(/\\r?\\n/, 1)[0];
function row(r) {
  const name = r.title || firstLine(r.prompt);
  const when = r.startedAt || r.queuedAt;
  const actions = [];
  if (r.sessionId) actions.push('<a class="button' + (r.status === "running" ? " primary" : "") + '" href="/chat/' + encodeURIComponent(r.sessionId) + '" target="_top" data-open="' + esc(r.sessionId) + '">' + esc(T.open) + "</a>");
  if (r.status !== "ended") actions.push('<button type="button" data-release="' + r.id + '" data-queued="' + (r.status === "queued" ? "1" : "") + '">' + esc(r.status === "queued" ? T.cancel : T.release) + "</button>");
  return '<div class="row"><span class="id">#' + r.id + '</span><div class="body"><div class="name">' + esc(name) + " " + pill(r) + "</div>" +
    '<div class="meta">' + esc(r.agentId) + " · " + esc(T.by) + " " + esc(String(r.by).replace(/^(user|agent):/, "")) + " · " + esc(when) + '</div>' +
    '<div class="meta"><code>' + esc(r.workspace) + "</code></div>" +
    (r.error ? '<div class="meta error">' + esc(r.error) + "</div>" : "") +
    '</div><div class="actions">' + actions.join("") + "</div></div>";
}
function draw(data) {
  const summary = '<div class="summary"><span>' + esc(fill(T.slots, data)) + '</span><span class="muted">' + esc(data.idleMinutes > 0 ? fill(T.idleRule, { minutes: data.idleMinutes }) : T.idleNever) + "</span></div>";
  const list = data.runs.length === 0 ? '<div class="list"><div class="empty">' + esc(T.empty) + "</div></div>" : '<div class="list">' + data.runs.map(row).join("") + "</div>";
  main.innerHTML = head + summary + list;
}
let busy = false;
async function refresh() {
  if (busy) return;
  busy = true;
  try { draw(await request("GET", base + "/runs")); }
  catch (e) { main.innerHTML = head + '<p class="error">' + esc(T.failedRead) + ": " + esc(e && e.message || e) + "</p>"; }
  finally { busy = false; }
}
main.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const open = target.closest("[data-open]");
  if (open) { event.preventDefault(); go("/chat/" + encodeURIComponent(open.getAttribute("data-open"))); return; }
  const release = target.closest("[data-release]");
  if (release) {
    if (!confirm(release.getAttribute("data-queued") ? T.confirmCancel : T.confirmRelease)) return;
    release.disabled = true;
    request("POST", base + "/runs/" + release.getAttribute("data-release") + "/release").then(refresh, (e) => { alert(String(e && e.message || e)); refresh(); });
  }
});
if (m === null) main.innerHTML = head + '<p class="muted">' + esc(T.noOrg) + "</p>";
else resolveOrg().then(() => { refresh(); setInterval(refresh, REFRESH_MS); });
`;

/** The whole document. */
export function pageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${PAGE_STRINGS.en.title}</title>
<link rel="stylesheet" href="/workflow-ui.css">
<style>${STYLE}</style>
</head>
<body>
<main id="main"><h1>${PAGE_STRINGS.en.title}</h1><p class="muted">${PAGE_STRINGS.en.loading}</p></main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

/** The page's route group: `GET /page` answers the document (behind the cookie gate). */
export function pageRoutes(): Hono {
  const app = new Hono();
  app.get("/page", (c) => c.html(pageHtml()));
  return app;
}
