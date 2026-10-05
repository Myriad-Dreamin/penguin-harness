/**
 * The program a Claude Code Session runs (program.ts): where `claude` is found, the argv for a
 * new conversation and for a continued one, and the environment the pty gets — the Session's
 * control variables in, the inherited session markers and any control variable it lacks out.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CONTROL_ENV_NAMES,
  ClaudeCodeSurface,
  INHERITED_SESSION_MARKERS,
  claudeArgv,
  claudeBinary,
  claudeSearchedIn,
  controlUnset,
} from "../src/index.js";

describe("the program", () => {
  it("is claude from PATH unless PENGUIN_CLAUDE_BIN names another", () => {
    expect(claudeBinary({})).toBe("claude");
    expect(claudeBinary({ PENGUIN_CLAUDE_BIN: " /opt/claude " })).toBe("/opt/claude");
    expect(claudeArgv(undefined, {})).toEqual(["claude"]);
    expect(claudeArgv("  ", {})).toEqual(["claude"]);
    expect(claudeArgv("fix the tests", { PENGUIN_CLAUDE_BIN: "c" })).toEqual([
      "c",
      "fix the tests",
    ]);
  });

  it("continues a session with --resume, and starts a turn with the prompt when there is one", () => {
    const env = { PENGUIN_CLAUDE_BIN: "c" };
    // A person opening it: the conversation as it was left.
    expect(claudeArgv(undefined, env, "sess-1")).toEqual(["c", "--resume", "sess-1"]);
    expect(claudeArgv(" ", env, "sess-1")).toEqual(["c", "--resume", "sess-1"]);
    // An event waking it: continued, and told at once.
    expect(claudeArgv(" review the comments ", env, "sess-1")).toEqual([
      "c",
      "--resume",
      "sess-1",
      "review the comments",
    ]);
  });

  it.skipIf(process.platform === "win32")(
    "finds an install the server's PATH cannot see, and says where it looked when there is none",
    async () => {
      const home = await fs.mkdtemp(path.join(os.tmpdir(), "claude-home-"));
      const onPathDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-path-"));
      try {
        const env = { HOME: home, PATH: onPathDir };
        // Nothing anywhere: the bare name is handed over, and the search is reportable.
        expect(claudeBinary(env)).toBe("claude");
        expect(claudeSearchedIn(env)).toEqual([
          `PATH (${onPathDir})`,
          path.join(home, ".local/bin/claude"),
          path.join(home, ".claude/local/claude"),
          path.join(home, ".bun/bin/claude"),
          path.join(home, ".npm-global/bin/claude"),
        ]);

        // Installed where the installer puts it, off PATH: found, as an absolute path.
        const installed = path.join(home, ".local", "bin", "claude");
        await fs.mkdir(path.dirname(installed), { recursive: true });
        await fs.writeFile(installed, "#!/bin/sh\n", { mode: 0o755 });
        expect(claudeBinary(env)).toBe(installed);

        // PATH still wins when it can answer: that is the one the operator's shell runs.
        const preferred = path.join(onPathDir, "claude");
        await fs.writeFile(preferred, "#!/bin/sh\n", { mode: 0o755 });
        expect(claudeBinary(env)).toBe(preferred);

        // And an explicit override beats both, unexamined.
        expect(claudeBinary({ ...env, PENGUIN_CLAUDE_BIN: "/opt/claude" })).toBe("/opt/claude");
      } finally {
        await fs.rm(home, { recursive: true, force: true });
        await fs.rm(onPathDir, { recursive: true, force: true });
      }
    },
  );
});

describe("the program's environment", () => {
  /** A terminal manager that records each request and answers with a terminal that lives. */
  function terminals() {
    const requests: Array<Record<string, unknown>> = [];
    const terminal = {
      id: "t1",
      alive: true,
      capture: () => ({ lines: [], totalLines: 0 }),
      onOutput: () => () => {},
      onExit: () => () => {},
      kill: () => {},
    };
    const manager = {
      create: async (request: Record<string, unknown>) => {
        requests.push(request);
        return terminal;
      },
      get: () => terminal,
    };
    return { manager: manager as never, requests };
  }

  const control = {
    PENGUIN_API_URL: "http://127.0.0.1:7364",
    PENGUIN_API_TOKEN: "session-credential",
    PENGUIN_PROJECT_ID: "p",
    PENGUIN_AGENT_ID: "dev",
    PENGUIN_SESSION_ID: "s1",
    PENGUIN_ORG_ID: "acme",
  };
  const ref = (env: Record<string, string>) => ({
    sessionId: "s1",
    projectId: "p",
    agentId: "dev",
    workspace: os.tmpdir(),
    ownerUserId: "admin",
    env,
  });

  it("is the Session's control environment, over what the server inherited", async () => {
    const { manager, requests } = terminals();
    const surface = new ClaudeCodeSurface(manager, { PENGUIN_CLAUDE_BIN: "c" });
    await surface.open(ref(control), {}, () => {});
    surface.close("s1");
    expect(requests[0]).toMatchObject({ env: control, unsetEnv: INHERITED_SESSION_MARKERS });
    expect(CONTROL_ENV_NAMES).toEqual(Object.keys(control));
  });

  it("scrubs a control variable the Session has none of, rather than inherit the server's", async () => {
    const { manager, requests } = terminals();
    const surface = new ClaudeCodeSurface(manager, { PENGUIN_CLAUDE_BIN: "c" });
    // No organization, and no credential to hand out: neither may leak in from the server.
    const { PENGUIN_ORG_ID: _org, PENGUIN_API_TOKEN: _token, ...rest } = control;
    await surface.open(ref(rest), {}, () => {});
    surface.close("s1");
    expect(requests[0]!.env).toEqual(rest);
    expect(requests[0]!.unsetEnv).toEqual([
      ...INHERITED_SESSION_MARKERS,
      "PENGUIN_API_TOKEN",
      "PENGUIN_ORG_ID",
    ]);
    expect(controlUnset(rest)).toEqual(requests[0]!.unsetEnv);
  });
});
