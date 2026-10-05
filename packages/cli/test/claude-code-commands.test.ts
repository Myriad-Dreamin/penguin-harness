/**
 * `penguin org claude-code` (commands/claude-code.ts), driven through `cli()` in-process
 * against the fake server's claude-code queue routes: queue, list, show and release a run,
 * the caller identity from the control environment, and `release --self` — the run the
 * calling Session is the program of, found by PENGUIN_SESSION_ID.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cli } from "../src/index.js";
import { getMessages } from "../src/i18n.js";
import { FakeServer } from "./fake-server.js";

const t = getMessages("en");

// The same in-process harness as org-commands.test.ts, trimmed to what these cases read: each
// suite keeps its own so that one's fixtures never leak into the other's expectations.
const ENV_KEYS = ["PENGUIN_ORG_ID", "PENGUIN_AGENT_ID", "PENGUIN_SESSION_ID", "PENGUIN_PROJECT_ID"];
const saved = new Map<string, string | undefined>();

/** The desk session the CLI is assumed to run inside when PENGUIN_SESSION_ID is set below. */
const DESK_SESSION = "session-2026-09-02-10-00-00-de5c0001";

let server: FakeServer;
let uninstall: () => void;
let stdout: string[];
let stderr: string[];
let outSpy: { mockRestore(): void };
let errSpy: { mockRestore(): void };

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  server = new FakeServer();
  uninstall = server.install();
  server.addOrg({ orgId: "acme", name: "Acme", mission: "Ship the site" });
  process.env.PENGUIN_ORG_ID = "acme";
  stdout = [];
  stderr = [];
  outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
});
afterEach(() => {
  outSpy.mockRestore();
  errSpy.mockRestore();
  uninstall();
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const out = () => stdout.join("");
const err = () => stderr.join("");
/** The most recent recorded request of `method` whose path ends with `suffix`. */
const lastRequest = (method: string, suffix: string) =>
  server.requests.findLast((r) => r.method === method && r.path.endsWith(suffix));
const org = () => server.orgs.get("acme")!;

describe("penguin org claude-code (the claude-code plugin's queue)", () => {
  beforeEach(() => {
    server.addEmployee("acme", { agentId: "dev1", title: "Developer" });
    process.env.PENGUIN_SESSION_ID = DESK_SESSION;
    process.env.PENGUIN_AGENT_ID = "dev1";
  });

  it("run queues for the calling employee with its identity, then ls, show and release follow the run", async () => {
    org().claudeCodeRuns = new Map();
    expect(
      await cli(["org", "claude-code", "run", "Fix the flaky test", "--title", "Flaky test"]),
    ).toBe(0);
    expect(lastRequest("POST", "/organizations/acme/claude-code/runs")?.body).toEqual({
      prompt: "Fix the flaky test",
      title: "Flaky test",
      sessionId: DESK_SESSION,
      agentId: "dev1",
    });
    expect(out()).toBe(`${t.org.claudeCodeQueued(1, t.org.claudeCodeQueuedAt(1))}\n`);

    stdout.length = 0;
    expect(await cli(["org", "claude-code", "ls"])).toBe(0);
    expect(lastRequest("GET", "/claude-code/runs")?.search).toBe(
      `?sessionId=${DESK_SESSION}&agentId=dev1`,
    );
    expect(out()).toBe(
      `${t.org.claudeCodeSlots(0, 4, 1)}\n#1  ${t.org.claudeCodeQueuedAt(1)}  dev1  Flaky test\n`,
    );

    stdout.length = 0;
    org().claudeCodeRuns!.get(1)!.status = "running";
    org().claudeCodeRuns!.get(1)!.sessionId = "cc-1";
    expect(await cli(["org", "claude-code", "show", "1", "--screen", "5"])).toBe(0);
    expect(lastRequest("GET", "/claude-code/runs/1")?.search).toContain("screen=5");
    expect(out()).toContain(`${t.org.claudeCodeSessionLabel()}: cc-1`);
    expect(out()).toContain("  > ready");

    stdout.length = 0;
    expect(await cli(["org", "claude-code", "release", "1", "--json"])).toBe(0);
    expect(JSON.parse(out())).toMatchObject({ id: 1, status: "ended", end: "released" });
  });

  it("says the plugin is missing on a plain 404, and refuses a run id that is not a number", async () => {
    expect(await cli(["org", "claude-code", "ls"])).toBe(1);
    expect(err()).toContain(t.org.claudeCodePluginMissing());
    org().claudeCodeRuns = new Map();
    expect(await cli(["org", "claude-code", "release", "x1"])).toBe(1);
    expect(err()).toContain(t.org.claudeCodeRunIdInvalid("x1"));
    expect(await cli(["org", "claude-code", "show", "9"])).toBe(1);
    expect(err()).toContain("run_not_found");
  });

  it("release --self ends the run whose Session is the caller's, and says why when there is none", async () => {
    org().claudeCodeRuns = new Map();
    expect(await cli(["org", "claude-code", "run", "first"])).toBe(0);
    expect(await cli(["org", "claude-code", "run", "second"])).toBe(0);
    // Run #2 is the program this command runs inside: its Session is PENGUIN_SESSION_ID.
    org().claudeCodeRuns!.get(1)!.status = "running";
    org().claudeCodeRuns!.get(1)!.sessionId = "cc-other";
    org().claudeCodeRuns!.get(2)!.status = "running";
    org().claudeCodeRuns!.get(2)!.sessionId = "cc-self";
    process.env.PENGUIN_SESSION_ID = "cc-self";
    stdout.length = 0;
    expect(await cli(["org", "claude-code", "release", "--self"])).toBe(0);
    expect(lastRequest("POST", "/release")?.path).toMatch(/\/claude-code\/runs\/2\/release$/);
    expect(lastRequest("POST", "/release")?.body).toEqual({
      sessionId: "cc-self",
      agentId: "dev1",
    });
    expect(org().claudeCodeRuns!.get(1)!.status).toBe("running");
    expect(out()).toContain("Run #2");

    // Ended now: no run holds the Session any more.
    expect(await cli(["org", "claude-code", "release", "--self"])).toBe(1);
    expect(err()).toContain(t.org.claudeCodeSelfNoRun("cc-self"));
    // Outside a Session there is nothing to find it by.
    delete process.env.PENGUIN_SESSION_ID;
    expect(await cli(["org", "claude-code", "release", "--self"])).toBe(1);
    expect(err()).toContain(t.org.claudeCodeSelfNoSession());
    // One of the two, not neither and not both.
    expect(await cli(["org", "claude-code", "release"])).toBe(1);
    expect(await cli(["org", "claude-code", "release", "1", "--self"])).toBe(1);
    expect(err()).toContain(t.org.claudeCodeReleaseWhich());
    expect(org().claudeCodeRuns!.get(1)!.status).toBe("running");
  });
});
