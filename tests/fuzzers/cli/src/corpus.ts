/**
 * CLI cross-section corpus (DESIGN.md §5.2): command-line specs distilled from the commander
 * declarations in packages/cli/src/commands/*. Every spec names the real command file it
 * drives. The serialization format for this leg is the command line itself (argv array),
 * which out/cli-sequence.jsonl records verbatim.
 *
 * 🔴-danger behaviors are absent by the §5.3 danger gate: no update (self-update job), no
 * auth token/login (writes cli-session.json), no config lang/vault set (writes secrets
 * surfaces), no plugin install/remove (network + filesystem mutation), no browser
 * exec/click/type/open (drives a real browser), no benchmark import, no org writes (they
 * open real desk sessions), no server stop / reset-admin-password / web / chat.
 */
import type { Rng } from "../../server/src/rng.js";

export type Variant = "ok" | "bad";

export interface CliPools {
  sessions: string[];
  schedules: string[];
}

export interface CliGenCtx {
  rng: Rng;
  pools: CliPools;
  step: number;
}

export interface CliCallSpec {
  id: string;
  argv: (ctx: CliGenCtx, variant: Variant) => string[];
  /** Exit codes the CLI's contract allows here; anything else is a finding. */
  exits: number[];
  /** Parse the captured stdout after the command (e.g. session id from `run --json`). */
  capture?: (stdout: string, pools: CliPools, variant: Variant) => void;
  /** Real code this spec drives — file and action, for the coverage report. */
  note: string;
}

const BAD_SESSION = "session-1970-01-01-00-00-00-deadbeef";
const sessionOr = (ctx: CliGenCtx): string =>
  ctx.pools.sessions.length > 0 && !ctx.rng.chance(0.25)
    ? ctx.rng.pick(ctx.pools.sessions)
    : BAD_SESSION;

/** Parse the last JSON line of a `--json` command's stdout; null when there is none. */
export function lastJsonLine(stdout: string): unknown | null {
  const lines = stdout.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (line === "") continue;
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }
  return null;
}

export function cliCorpus(): CliCallSpec[] {
  return [
    {
      id: "version.json",
      argv: () => ["version", "--json"],
      exits: [0],
      note: "commands/version.ts --json (buildInfo + harness report)",
    },
    {
      id: "version",
      argv: () => ["version"],
      exits: [0],
      note: "commands/version.ts (rendered report)",
    },
    {
      id: "project.ls",
      argv: () => ["project", "ls", "--json"],
      exits: [0],
      note: "commands/project.ts ls (GET /api/projects through ServerClient)",
    },
    {
      id: "agent.ls",
      argv: () => ["agent", "ls"],
      exits: [0],
      note: "commands/agent.ts ls (agent list render)",
    },
    {
      id: "session.ls",
      argv: () => ["session", "ls"],
      exits: [0],
      note: "commands/ls.ts (listAgents + listAgentSessions, table render)",
    },
    {
      id: "session.log",
      argv: (ctx, v) => ["session", "log", ...(v === "bad" ? [BAD_SESSION] : [sessionOr(ctx)])],
      exits: [0, 1],
      note: "commands/log.ts (getSessionMessages snapshot; 1 = session_not_found)",
    },
    {
      id: "session.rename",
      argv: (ctx, v) => [
        "session",
        "rename",
        "-t",
        v === "bad" ? "" : `fuzz title ${ctx.step}`,
        sessionOr(ctx),
      ],
      exits: [0, 1],
      note: "commands/session.ts rename (checkSessionTitle + PATCH /api/sessions/:id)",
    },
    {
      id: "session.input",
      argv: (ctx, v) => [
        "session",
        "input",
        "-m",
        `fuzz input ${ctx.step}`,
        "--timeout",
        "10s",
        sessionOr(ctx),
      ],
      exits: [0, 1],
      note: "commands/input.ts (steer-or-task via POST /tasks, SessionStream watch)",
    },
    {
      id: "session.input.poll",
      argv: (ctx) => ["session", "input", "--timeout", "3s", sessionOr(ctx)],
      exits: [0, 1],
      note: "commands/input.ts poll form (getSessionInfo + latest answer snapshot)",
    },
    {
      id: "run.foreground",
      argv: (ctx) => ["run", "-m", `fuzz cli task ${ctx.step}`, "--timeout", "10s"],
      exits: [0],
      note: "commands/run.ts (create-or-reuse session, POST task, StreamRenderer watch)",
    },
    {
      id: "run.json",
      argv: (ctx) => ["run", "-m", `fuzz cli task ${ctx.step}`, "--json", "--timeout", "10s"],
      exits: [0],
      capture: (stdout, pools) => {
        const parsed = lastJsonLine(stdout) as { sessionId?: string } | null;
        if (parsed !== null && typeof parsed.sessionId === "string") {
          if (!pools.sessions.includes(parsed.sessionId)) pools.sessions.push(parsed.sessionId);
        }
      },
      note: "commands/run.ts --json ({sessionId,status,text})",
    },
    {
      id: "run.background",
      argv: (ctx) => ["run", "-m", `fuzz background ${ctx.step}`, "--background", "--json"],
      exits: [0],
      note: "commands/run.ts --background (task keeps running server-side)",
    },
    {
      id: "schedule.ls",
      argv: () => ["schedule", "ls"],
      exits: [0],
      note: "commands/schedule.ts ls (GET agent schedules)",
    },
    {
      id: "schedule.add",
      argv: (_ctx, v) =>
        v === "bad"
          ? ["schedule", "add", "fuzz/bad!", "--prompt", "", "--start-at", "not-a-date"]
          : [
              "schedule",
              "add",
              "fuzz_sched",
              "--prompt",
              "fuzz prompt",
              "--start-at",
              "2028-01-01T00:00:00Z",
              "--disabled",
            ],
      exits: [0, 1],
      capture: (_stdout, pools, variant) => {
        // A fixed name makes `schedule rm` targetable; only the ok variant pools it. A
        // refused create (exit 1) leaves rm targeting a name that may not exist — rm's
        // own exits set already allows that, and both outcomes exercise real paths.
        if (variant === "ok" && !pools.schedules.includes("fuzz_sched")) {
          pools.schedules.push("fuzz_sched");
        }
      },
      note: "commands/schedule.ts add (name/prompt/startAt validators; disabled seed)",
    },
    {
      id: "schedule.rm",
      argv: (ctx) => [
        "schedule",
        "rm",
        ctx.pools.schedules.length > 0 ? ctx.rng.pick(ctx.pools.schedules) : "no-such-schedule",
      ],
      exits: [0, 1],
      note: "commands/schedule.ts rm (delete schedule file, absent → 1)",
    },
    {
      id: "cost",
      argv: () => ["cost", "--days", "1"],
      exits: [0],
      note: "commands/cost.ts (usage aggregate, calendar window)",
    },
    {
      id: "plugin.list",
      argv: () => ["plugin", "list"],
      exits: [0],
      note: "commands/plugin.ts list (local plugin scan)",
    },
    {
      id: "org.ls",
      argv: () => ["org", "ls"],
      exits: [0, 1],
      note: "commands/org.ts ls (org directory read; 1 = company_mode_off, the server's own answer when company mode is off)",
    },
    {
      id: "auth.status",
      argv: () => ["auth", "status"],
      exits: [0],
      note: "commands/auth.ts status (stored sign-in presence)",
    },
    {
      id: "server.status",
      argv: () => ["server", "status"],
      exits: [0],
      note: "commands/server-status.ts (readMachineStatus: lock + read-only db)",
    },
    {
      id: "config.model.list",
      argv: () => ["config", "model", "list"],
      exits: [0],
      note: "commands/config.ts model list (loadProjectConfig local read)",
    },
    {
      id: "config.vault.list",
      argv: () => ["config", "vault", "list"],
      exits: [0],
      note: "commands/config.ts vault list (agent_state vault keys, absent → empty)",
    },
    {
      id: "browser.status",
      argv: () => ["browser", "status"],
      exits: [0, 1],
      note: "commands/browser.ts status (GET /api/builtin-browser/status)",
    },
    {
      id: "help.bare",
      argv: () => [],
      exits: [0],
      note: "index.ts program.action → outputHelp on empty argv",
    },
    {
      id: "usage.unknown",
      argv: () => ["frobnicate"],
      exits: [1],
      note: "usage-error.ts reportCommanderError (commander.unknownCommand)",
    },
    {
      id: "usage.missing-option",
      argv: () => ["agent", "create"],
      exits: [1],
      note: "commander missingMandatoryOptionValue path via usage-error.ts",
    },
    {
      id: "run.approve.bogus",
      argv: () => [
        "run",
        "-m",
        "never reaches the server",
        "--approve",
        "bogus",
        "--timeout",
        "5s",
      ],
      exits: [1],
      note: "approval.ts resolveApprovalMode — the known process.exit(1) hard-exit face, caught by the exit guard on purpose",
    },
  ];
}
