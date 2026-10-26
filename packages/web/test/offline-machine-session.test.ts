// @vitest-environment jsdom
/**
 * A conversation on a machine that is out of reach, on the two surfaces that meet the reader
 * there (the gap this closes: the alias panel only appeared when a history read failed AND
 * the list had already named the machine, so the ordinary paths — a cold deep link into an
 * offline machine's conversation, a conversation already open when its machine drops — said
 * nothing at all).
 *
 * The routed note — `MachineAwayPanel` as the chat page renders it from the probe's 503
 * (route-offline.ts), for a cold `/chat/<sid>` into a conversation whose machine is down:
 *
 * - Given the list answers with the machine reconnecting (4 failed of 8, the next one
 *   scheduled), the note names the machine by its alias, says it is reconnecting, shows the
 *   attempt the machines row carries and the countdown, and keeps the transport's words — the
 *   machine's internal id — one fold away.
 * - Given that, Retry now asks the server to try the machine now, on the reconnect route the
 *   Machines page's own Retry takes (`ssh:<alias>`), and the status follows the answer.
 * - Given the machine's automatic reconnects stopped (8 of 8), the note says where it stopped
 *   and its Retry starts a new streak on the same route.
 * - Given the machine list cannot be read at all, the note still names the machine — by the
 *   alias the 503 itself carried — and says the conversation opens on its own.
 *
 * The strip over an open conversation — `MachineAwayBanner`, for the conversation whose body
 * is already on screen when its machine drops (nothing fails again to say so):
 *
 * - Given a Session on a machine that went from connected to reconnecting, the strip names the
 *   machine by its alias with the same retry line, and nothing is asked of this server's own
 *   machine; a Session on this server grows no strip.
 * - Given the machine connected again, the strip leaves on its own — the conversation stays.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import type { MachineInfo, MachinesResponse } from "@prismshadow/penguin-server/api";
import { ADMIN_ME } from "./helpers/admin-settings";
import { button, click, mount, settle, unmountAll, waitFor } from "./helpers/dom";
import { apiError, json, stubFetch } from "./helpers/fetch";
import type { FetchRequest } from "./helpers/fetch";

const PROJECT = "proj";
/** The machine's internal id, as the machines row and the 503's details carry it. */
const MACHINE = "5QR0DutzvjoAGspD";
/** The alias the machines row carries — the name a person recognises. */
const ALIAS = "qa-once-20261025";
const SESSION = "session-2026-10-25-06-01-37-896e1a10";
/** The server's own sentence for the fold. */
const SAID = `The machine holding session ${SESSION} is not connected.`;

afterEach(async () => {
  await unmountAll();
  vi.unstubAllGlobals();
});

type Link = "waiting" | "trying" | "gaveUp" | "connected";

/** The Project's machine list with `ALIAS` in the state the test sets. */
function machineList(link: Link): MachinesResponse {
  const machine = {
    id: `ssh:${ALIAS}`,
    alias: ALIAS,
    machineId: MACHINE,
    installed: { version: "0.2.16", at: "2026-10-15T00:00:00.000Z" },
    member: true,
    local: false,
    connection: link === "connected" ? { pid: 1 } : null,
    ...(link === "connected"
      ? {}
      : {
          reconnect: {
            since: "2026-10-25T06:40:00.000Z",
            attempts: link === "gaveUp" ? 8 : 4,
            maxAttempts: 8,
            nextAt:
              link === "waiting" ? new Date(Date.now() + 40_000).toISOString() : null,
            lastError: null,
            diagnosis: null,
            ...(link === "gaveUp" ? { gaveUp: "attempts" } : {}),
          },
        }),
    keepConnected: true,
    api: null,
    root: "~/.penguin/data",
    status: null,
  } as unknown as MachineInfo;
  return { machines: [machine], imageVersion: "0.2.16", job: null } as unknown as MachinesResponse;
}

/**
 * The page's answers. `machines` may be a list or a failure, and a reconnect POST moves the
 * machine to `trying` — the server answers the route with the list, as the Machines page reads.
 */
function server(link: Link, machinesFail = false) {
  const state = { link, machinesFail };
  const fetch = stubFetch((request: FetchRequest) => {
    if (request.path === "/api/me") return json(ADMIN_ME);
    if (request.path === "/api/me/prefs") return json({ prefs: {} });
    if (request.path === "/api/projects") {
      return json({
        projects: [
          {
            projectId: PROJECT,
            name: "Project",
            role: "owner",
            ownerUserId: "admin",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      });
    }
    if (request.path === `/api/projects/${PROJECT}/agents`) return json({ agents: [] });
    if (request.path === `/api/projects/${PROJECT}/machines`) {
      if (state.machinesFail) return apiError(500, "http_error");
      return json(machineList(state.link));
    }
    if (
      request.method === "POST" &&
      request.path === `/api/projects/${PROJECT}/machines/ssh%3A${ALIAS}/reconnect`
    ) {
      state.link = "trying";
      return json(machineList("trying"));
    }
    return apiError(404, "not_found");
  });
  return { state, fetch };
}

/** The page's modules from one fresh graph: the session-to-machine map is module state. */
async function fresh() {
  vi.resetModules();
  const strings = await import("../src/lib/strings");
  const { en } = await import("../src/lib/strings-en");
  strings.setActiveStrings(en);
  return {
    en,
    panel: await import("../src/features/chat/history-load-failed"),
    notice: await import("../src/features/chat/machine-away-notice"),
    machines: await import("../src/state/machines"),
    auth: await import("../src/state/auth"),
    project: await import("../src/state/project"),
    sessionMachines: await import("../src/lib/session-machines"),
  };
}

type Modules = Awaited<ReturnType<typeof fresh>>;

/** The note over a provider graph that answers like the page does. */
async function note(
  modules: Modules,
  props: { alias?: string | null; onRetry?: () => void } = {},
) {
  const mounted = await mount(
    h(
      modules.auth.AuthProvider,
      null,
      h(
        modules.project.ProjectProvider,
        null,
        h(
          modules.machines.MachinesProvider,
          null,
          h(modules.panel.MachineAwayPanel, {
            projectId: PROJECT,
            machineId: MACHINE,
            alias: props.alias === undefined ? ALIAS : props.alias,
            error: SAID,
            onRetry: props.onRetry ?? vi.fn(),
            fallback: h(
              "p",
              { "data-fallback": "" },
              modules.en.chat.sessionOnOfflineMachine(
                (props.alias === undefined ? ALIAS : props.alias) ?? MACHINE,
              ),
            ),
          }),
        ),
      ),
    ),
  );
  await settle();
  return mounted;
}

/** The strip over an open conversation. */
async function strip(modules: Modules) {
  const mounted = await mount(
    h(
      modules.auth.AuthProvider,
      null,
      h(
        modules.project.ProjectProvider,
        null,
        h(
          modules.machines.MachinesProvider,
          null,
          h(modules.notice.MachineAwayBanner, { projectId: PROJECT, sessionId: SESSION }),
        ),
      ),
    ),
  );
  await settle();
  return mounted;
}

/** What a reader sees: the text outside every `hidden` subtree. */
function visibleText(): string {
  const copy = document.body.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll("[hidden]")) hidden.remove();
  return copy.textContent ?? "";
}

const reconnectPosts = (requests: readonly FetchRequest[]) =>
  requests.filter((r) => r.method === "POST" && r.path.endsWith("/reconnect"));

describe("the note for a routed conversation on an offline machine", () => {
  it("names the machine by its alias, with the attempt the machines row carries", async () => {
    server("waiting");
    const modules = await fresh();
    await note(modules);
    const words = modules.en.chat.machineAway;
    await waitFor(() => visibleText().includes(words.reconnecting(ALIAS)));

    expect(document.querySelector("[data-retry-phase]")?.getAttribute("data-retry-phase")).toBe(
      "waiting",
    );
    // The attempt is the machines row's own: 4 failed of 8, the next one waited for.
    expect(visibleText()).toContain(modules.en.machines.retry.failed(4, 8));
    expect(document.querySelector("[data-retry-countdown]")).not.toBeNull();
    // The machine's internal id is the transport's business, not the headline's.
    expect(visibleText()).not.toContain(MACHINE);

    await click(button(words.details));
    expect(visibleText()).toContain(SAID);
  });

  it("asks the server to try the machine now, on the Machines page's own route", async () => {
    const s = server("waiting");
    const modules = await fresh();
    await note(modules);
    const retryNow = modules.en.machines.retry.retryNow;
    await waitFor(() => visibleText().includes(retryNow));

    await click(button(retryNow));
    expect(reconnectPosts(s.fetch.requests)).toHaveLength(1);
    expect(document.querySelector("[data-retry-phase]")?.getAttribute("data-retry-phase")).toBe(
      "trying",
    );
  });

  it("says where the automatic reconnects stopped, and its Retry starts a new streak", async () => {
    const s = server("gaveUp");
    const modules = await fresh();
    await note(modules);
    const words = modules.en.chat.machineAway;
    await waitFor(() => visibleText().includes(words.reconnectStopped(ALIAS)));

    expect(document.querySelector("[data-retry-phase]")?.getAttribute("data-retry-phase")).toBe(
      "gaveUp",
    );
    await click(button(modules.en.machines.retry.retry));
    expect(reconnectPosts(s.fetch.requests)).toHaveLength(1);
  });

  it("still names the machine when the list cannot be read, by the alias the 503 carried", async () => {
    server("waiting", true);
    const modules = await fresh();
    await note(modules);
    await waitFor(() =>
      visibleText().includes(modules.en.chat.sessionOnOfflineMachine(ALIAS)),
    );

    expect(visibleText()).not.toContain(modules.en.chat.machineAway.missing);
    expect(document.querySelector("[data-retry-phase]")).toBeNull();
  });
});

describe("the strip over a conversation whose machine dropped", () => {
  it("names the machine and carries the same retry, asking the machine's own route", async () => {
    const s = server("waiting");
    const modules = await fresh();
    modules.sessionMachines.rememberSessionMachine(SESSION, MACHINE);
    await strip(modules);
    const words = modules.en.chat.machineAway;
    await waitFor(() => visibleText().includes(words.reconnecting(ALIAS)));

    expect(visibleText()).toContain(modules.en.machines.retry.failed(4, 8));
    expect(visibleText()).not.toContain(MACHINE);
    await click(button(modules.en.machines.retry.retryNow));
    expect(reconnectPosts(s.fetch.requests)).toHaveLength(1);
  });

  it("grows nothing for a conversation on this server, and leaves when the machine is back", async () => {
    const s = server("waiting");
    const modules = await fresh();
    // This server's own Session: no machine to name, no strip.
    await strip(modules);
    await settle();
    expect(document.querySelector("[data-machine-away-banner]")).toBeNull();

    // The same conversation on the machine that dropped: the strip appears.
    modules.sessionMachines.rememberSessionMachine(SESSION, MACHINE);
    await strip(modules);
    await waitFor(() => document.querySelector("[data-machine-away-banner]") !== null);

    // The machine comes back: the strip leaves on its own — the conversation stays.
    s.state.link = "connected";
    modules.machines.publishMachinesChanged();
    await waitFor(() => document.querySelector("[data-machine-away-banner]") === null);
  });
});
