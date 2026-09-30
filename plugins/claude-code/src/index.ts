/**
 * @prismshadow/penguin-plugin-claude-code — Claude Code as a session surface.
 *
 * A PLUGIN PACKAGE, not part of the harness: a Project lists it in its config and the
 * harness resolves it from the installation (see the server's plugin/loader.ts). It
 * compiles against the type-only `@prismshadow/penguin-core/plugin` and
 * `@prismshadow/penguin-server/plugin` surfaces and carries no runtime dependency on either.
 *
 * What it contributes is ONE surface (core plugin/surfaces.ts): a "New chat" entry named
 * "Claude Code" whose Session, once opened, is the Claude Code TUI running in that
 * Session's Workspace — in a pty the harness's own terminal manager holds, drawn by the
 * Web App's `TerminalSurface` renderer. The Session lists, titles, archives and deletes
 * like any other; what it cannot do is take a Task, since nothing here is a model.
 *
 * ## State
 *
 * READ OFF THE SCREEN, not off the flow of bytes. Claude Code says what it is doing on its
 * own spinner line, and stops saying it when the turn ends:
 *
 *     ✻ Working… (3s · ↑ 1.2k tokens · esc to interrupt)   ← running
 *     ✻ Worked for 2s · done 1:31 AM                        ← idle
 *
 * The word is picked from a long list and the glyph animates, so {@link RUNNING_LINE} matches
 * the SHAPE — a symbol, one word, an ellipsis — and never a particular word.
 *
 * This used to be "output means running, silence past a window means idle", which is a
 * different question with a similar answer: it called a redraw work (a resize, a paste
 * echoing) and it called a long tool call idle the moment the spinner paused. The marker is
 * the program's own statement, so it is what this reads — from the LAST rows only
 * ({@link MARKER_ROWS}), since a transcript above can say anything. The footer's
 * `esc to interrupt` ({@link INTERRUPT_HINT}) says the same, and stays in those rows when
 * a tip or a task list under the spinner pushes the spinner out of them.
 *
 * ## The title
 *
 * Claude Code names its own conversation: it writes `{"type":"ai-title","aiTitle":"…"}` into
 * its transcript once it knows what the session is about, and again when that changes. This
 * surface follows that file and reports each new title, so a Session in the list stops being
 * called by whatever its first prompt happened to say.
 *
 * The file is CHOSEN EVERY POLL — the newest transcript for the Workspace — rather than
 * pinned at spawn: `/resume` inside the TUI moves the program to another session, and a
 * pinned file would name the one it started with.
 *
 * ## The program
 *
 * `claude` — resolved through PATH and then the places its installer puts it, since a
 * machine's server is started over a non-interactive ssh whose PATH has none of them — or
 * whatever `PENGUIN_CLAUDE_BIN` names, which is the seam for an install neither finds and the
 * one the integration test uses to stand in a fake. A first prompt from the draft page
 * becomes the program's first argument.
 *
 * ## The Session's credential
 *
 * The program runs with the Session's control variables — `PENGUIN_API_URL`, the Session's
 * own `PENGUIN_API_TOKEN` (a `pst1.` credential, see the server's auth/session-token.ts),
 * `PENGUIN_PROJECT_ID`, `PENGUIN_AGENT_ID`, `PENGUIN_SESSION_ID` — and the harness's own
 * `penguin` at the front of PATH: the same environment a harness-driven Session hands every
 * command it runs ({@link sessionControlEnv}). Without it the program carries no identity, and
 * a `penguin` it runs falls back to the sign-in stored on the data root, which is a person's
 * and not this Session's Agent's.
 *
 * ## Hot swaps
 *
 * Plugin modules are rebuilt per App; the ptys outlive the swap in the runtime's registry.
 * The Session → terminal map is parked and, at the next create, each terminal is claimed
 * back from the manager by id — one that is gone reads as never opened.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { Json } from "@prismshadow/penguin-core/kernel";
import { Bind, Component, Use } from "@prismshadow/penguin-core/plugin";
import type {
  ClassCtx,
  Plugin,
  SessionSurface,
  SurfaceOpenOptions,
  SurfaceSessionRef,
  SurfaceReport,
  SurfaceState,
  SurfaceView,
} from "@prismshadow/penguin-core/plugin";
import type { Hono } from "hono";
import type {
  Log,
  OrgGateway,
  Paths,
  PluginConfig,
  SessionEnv,
  SessionIndex,
  SessionServiceIface,
  SessionSurfaces,
  Terminals,
} from "@prismshadow/penguin-server/plugin";
import { ClaudeCodeQueue } from "./queue.js";
import { QUEUE_ROUTES_ID, queueRoutes } from "./queue-routes.js";
import { PAGE_ROUTES_ID, pageRoutes } from "./console-page.js";

export {
  ClaudeCodeQueue,
  KEEP_ENDED,
  PROMPT_MAX,
  PUMP_MS,
  QueueError,
  RUNS_FILE,
  SCREEN_MAX,
  parseRunsFile,
  runsPath,
} from "./queue.js";
export type {
  EndReason,
  QueueConfig,
  QueueDeps,
  RowLike,
  Run,
  RunStatus,
  RunView,
} from "./queue.js";
export { QUEUE_PREFIX, QUEUE_ROUTES_ID, queueRoutes } from "./queue-routes.js";
export {
  PAGE_PREFIX,
  PAGE_ROUTES_ID,
  PAGE_SRC,
  PAGE_STRINGS,
  pageHtml,
  pageRoutes,
} from "./console-page.js";

/**
 * The screen is re-read this long after a burst of output settles — the TUI redraws its bar
 * many times a second while working, and each redraw would otherwise cost a screen scan.
 */
export const SCREEN_SETTLE_MS = 120;

/** How many rows of the tail carry the hint bar. Enough for the bar and its neighbours, not the transcript. */
export const MARKER_ROWS = 6;

/**
 * The line Claude Code draws while a turn is in flight: a spinner frame, a word, an ellipsis.
 *
 *     ✻ Working… (3s · ↑ 1.2k tokens · esc to interrupt)
 *     ✽ Herding… (12s · ↓ 400 tokens)
 *
 * THE WORD VARIES — the program picks from a long list of gerunds (Working, Wrangling,
 * Herding, Baking, …) and animates the glyph through several frames, so neither is matched.
 * What is matched is the shape: a symbol, a single word, and the ellipsis that says the word
 * is a present participle. That is also what separates it from the line left behind when the
 * turn ENDS, which is the same glyph and a past tense with no ellipsis:
 *
 *     ✻ Worked for 2s · done 1:31 AM
 */
export const RUNNING_LINE = /^\s*[^\p{L}\p{N}\s]\s+\p{L}[\p{L}'’-]*(?:…|\.\.\.)/u;

/**
 * The hint Claude Code puts in its footer, the last row of the screen, for as long as a turn
 * can be interrupted:
 *
 *     ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt · ← for agents
 *
 * The spinner line alone is not enough: whatever the program prints under it — a two-row
 * `⎿ Tip: …`, a task list — sits between it and the input box, and pushes it out of the last
 * {@link MARKER_ROWS} rows while the turn is still going. The footer stays at the bottom.
 */
export const INTERRUPT_HINT = /\besc to interrupt\b/i;

/**
 * Whether the screen says a turn is in flight: the spinner line or the footer's interrupt
 * hint, among the last rows that carry anything.
 *
 * Blank rows are dropped before the tail is taken — a capture is the whole buffer including
 * the empty rows below the cursor, so counting from the bottom without this reads six blanks
 * and concludes nothing is happening.
 */
export function readsAsRunning(lines: readonly string[]): boolean {
  const written = lines.filter((line) => line.trim() !== "");
  return written
    .slice(-MARKER_ROWS)
    .some((line) => RUNNING_LINE.test(line) || INTERRUPT_HINT.test(line));
}

/**
 * The parent's Claude Code SESSION markers, scrubbed from the pty's environment.
 *
 * A surface's pty inherits the server process's environment, and a harness started from
 * inside a Claude Code session carries that session's markers — which a child `claude`
 * reads as "I am nested": it turns transcript saving off and points its messaging at the
 * parent's socket. The Session opened here is a top-level conversation of its own, so the
 * markers go.
 *
 * Only the markers that IDENTIFY a running session are listed. Configuration a deployment
 * sets on purpose — `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_MAX_OUTPUT_TOKENS`, the
 * `ANTHROPIC_*` variables — is inherited untouched, which is how an operator configures
 * the tool at all.
 */
export const INHERITED_SESSION_MARKERS: readonly string[] = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_BRIDGE_SESSION_ID",
  "CLAUDE_CODE_MESSAGING_SOCKET",
  "CLAUDE_CODE_MESSAGING_TOKEN",
  "CLAUDE_CODE_EXECPATH",
];

/**
 * Where Claude Code puts itself, relative to `$HOME`, when it is not on the server's PATH.
 *
 * This exists because of how a server is usually started, not because of anything odd about
 * the tool: a machine's server is launched over a NON-INTERACTIVE ssh, whose PATH is
 * `/usr/local/bin:/usr/bin:/bin` and nothing else — no profile is read, so `~/.local/bin`,
 * where the official installer puts `claude`, is not on it. The pty inherits that PATH and
 * `execvp` answers "No such file or directory" about a program that is plainly installed.
 *
 * Order is install-recency: the current installer's location first, then the older local
 * install, then the two package managers people run it under.
 */
const CLAUDE_HOME_PATHS: readonly string[] = [
  ".local/bin/claude",
  ".claude/local/claude",
  ".bun/bin/claude",
  ".npm-global/bin/claude",
];

/** Windows equivalents, under `%USERPROFILE%` / `%APPDATA%` (the latter as an absolute env read). */
const CLAUDE_HOME_PATHS_WIN: readonly string[] = [
  ".local/bin/claude.exe",
  ".local/bin/claude.cmd",
  "AppData/Roaming/npm/claude.cmd",
  ".bun/bin/claude.exe",
];

/** True when `file` is there and this process may execute it. */
function runnable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** `name` as PATH would resolve it, or null — the same search `execvp` performs, done in advance so a miss can be explained. */
function onPath(name: string, env: NodeJS.ProcessEnv): string | null {
  const dirs = (env.PATH ?? "").split(path.delimiter).filter((d) => d !== "");
  const names =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .map((ext) => `${name}${ext.toLowerCase()}`)
      : [name];
  for (const dir of dirs) {
    for (const candidate of names) {
      const file = path.join(dir, candidate);
      if (runnable(file)) return file;
    }
  }
  return null;
}

/**
 * The program to run: the operator's override, else `claude` wherever it actually is.
 *
 * Resolved rather than handed to the pty as a bare name, because the bare name is what fails
 * on a machine (see CLAUDE_HOME_PATHS) — and fails as `execvp(3) failed.: No such file or
 * directory`, which says nothing about which program or why. `PENGUIN_CLAUDE_BIN` is taken as
 * given: an operator naming a path means that path, and a test standing in a fake means the
 * fake.
 */
export function claudeBinary(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.PENGUIN_CLAUDE_BIN?.trim();
  if (explicit) return explicit;
  const found = onPath("claude", env);
  if (found !== null) return found;
  const home = env.HOME ?? env.USERPROFILE ?? "";
  if (home !== "") {
    const relative = process.platform === "win32" ? CLAUDE_HOME_PATHS_WIN : CLAUDE_HOME_PATHS;
    for (const rel of relative) {
      const file = path.join(home, ...rel.split("/"));
      if (runnable(file)) return file;
    }
  }
  // Nothing found: hand the bare name over anyway. The spawn then fails with the plugin's
  // own message (the harness names the program it could not start), which is a better place
  // to explain it than here — this function has one job and no way to report.
  return "claude";
}

/**
 * Whether the search came up empty.
 *
 * Reads the resolution rather than repeating it: an unresolved `claude` is the ONE case where
 * the bare name comes back, since anything found comes back as a path and an override comes
 * back as the operator wrote it.
 */
export function claudeMissing(env: NodeJS.ProcessEnv = process.env): boolean {
  return claudeBinary(env) === "claude";
}

/** Where a missing `claude` was looked for, for the message that says it is not installed. */
export function claudeSearchedIn(env: NodeJS.ProcessEnv = process.env): string[] {
  const home = env.HOME ?? env.USERPROFILE ?? "";
  const relative = process.platform === "win32" ? CLAUDE_HOME_PATHS_WIN : CLAUDE_HOME_PATHS;
  return [
    `PATH (${env.PATH ?? ""})`,
    ...(home === "" ? [] : relative.map((rel) => path.join(home, ...rel.split("/")))),
  ];
}

/** The argv for one Session: the program, then the first prompt when there is one. */
export function claudeArgv(
  prompt: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const argv = [claudeBinary(env)];
  const first = prompt?.trim() ?? "";
  if (first !== "") argv.push(first);
  return argv;
}

/** How often the transcript directory is re-read for a title. Cheap: a readdir and the new bytes of one file. */
export const TITLE_POLL_MS = 4000;

/**
 * Claude Code's transcript directory for a working directory.
 *
 * It keeps one directory per cwd under `~/.claude/projects`, named after the path with every
 * character that is not a letter, a digit or a dash replaced by one — `/home/k/.penguin/x`
 * becomes `-home-k--penguin-x`. `CLAUDE_CONFIG_DIR` moves the root, as it does for the tool.
 */
export function transcriptDir(cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  const root =
    env.CLAUDE_CONFIG_DIR?.trim() || path.join(env.HOME ?? env.USERPROFILE ?? "", ".claude");
  return path.join(root, "projects", cwd.replace(/[^A-Za-z0-9-]/g, "-"));
}

/**
 * The title Claude Code gave the session, from a chunk of its transcript.
 *
 * It writes `{"type":"ai-title","aiTitle":"…"}` when it has named the conversation, and again
 * whenever the name changes; the last one in the chunk is the current one. Parsed line by
 * line rather than with one regex over the whole text, so a title that merely MENTIONS the
 * shape cannot be read out of somebody's message.
 */
export function readAiTitle(chunk: string): string | null {
  let title: string | null = null;
  for (const line of chunk.split("\n")) {
    if (!line.startsWith('{"type":"ai-title"')) continue;
    try {
      const parsed = JSON.parse(line) as { type?: unknown; aiTitle?: unknown };
      if (
        parsed.type === "ai-title" &&
        typeof parsed.aiTitle === "string" &&
        parsed.aiTitle !== ""
      ) {
        title = parsed.aiTitle;
      }
    } catch {
      // A half-written last line: the next poll reads it whole.
    }
  }
  return title;
}

/** One transcript in a Workspace's directory: when it was last written, and how much of it there is. */
interface Transcript {
  file: string;
  at: number;
  /** Bytes. A transcript is append-only, so this is what says it grew — see pickTranscript. */
  size: number;
}

/** Every transcript in the directory, newest first. */
async function transcripts(dir: string): Promise<Transcript[]> {
  let entries: string[];
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return []; // No transcript yet, or none for this directory at all.
  }
  const found: Transcript[] = [];
  for (const name of entries) {
    if (!name.endsWith(".jsonl")) continue;
    const file = path.join(dir, name);
    try {
      const stat = await fsp.stat(file);
      found.push({ file, at: stat.mtimeMs, size: stat.size });
    } catch {
      // Gone between readdir and stat.
    }
  }
  return found.sort((a, b) => b.at - a.at);
}

/**
 * Which transcript a Session follows: the one its own program wrote, claimed once and kept.
 *
 * ONE TRANSCRIPT, ONE SESSION. Two surfaces can share a Workspace — the New chat page lets a
 * person pick one — and then they share this directory. "The newest file" is then whichever
 * of the two programs typed last, so both Sessions would take one title and rename each
 * other; that is the bug this exists for. A file another Session follows is never taken.
 *
 * `baseline` is the SIZE of everything the directory held when this Session began following
 * it. A file is this program's only when it is new or has GROWN since — a leftover from an
 * earlier run in the same Workspace never grows again, and naming a Session after a
 * conversation it never had is worse than not naming it.
 *
 * Size rather than mtime, because mtime cannot tell: a filesystem stamps it from a coarse
 * clock (a few milliseconds per tick here), so two appends moments apart carry the SAME
 * timestamp — measured, while writing this. A transcript is append-only, so its length is the
 * exact statement that something was written.
 *
 * KEPT, not re-chosen. A `/resume` inside the TUI moves the program to another session and
 * therefore another file, and this follower does not follow it there: from the outside, "my
 * program resumed elsewhere" and "the Session next door just started" look the same, and
 * guessing wrong renames somebody else's Session. The cost is a title that stops updating
 * after a resume until the surface is opened again; the alternative was the bug.
 */
export function pickTranscript(
  found: readonly Transcript[],
  current: { file: string | null },
  takenByOthers: ReadonlySet<string>,
  baseline: ReadonlyMap<string, number> = new Map(),
): string | null {
  if (current.file !== null && found.some((t) => t.file === current.file)) return current.file;
  const live = (t: Transcript) => {
    const was = baseline.get(t.file);
    return was === undefined || t.size > was;
  };
  return found.find((t) => !takenByOthers.has(t.file) && live(t))?.file ?? null;
}

/** The two per-Session policies of the harness's SessionEnv this surface reads. */
export type SessionControl = Pick<SessionEnv, "controlEnv" | "pathPrepend">;

/**
 * The environment the program gets on top of the server's own: the Session's control
 * variables, and PATH with the harness's shim directory in front.
 *
 * The same two policies the harness applies to every command a Session it drives spawns, and
 * evaluated with this Session's coordinates, so the credential speaks for this Session's Agent
 * and nothing wider. PATH is rebuilt from `env` (the server's environment, which the pty
 * inherits) under the name it already has there — `Path` on Windows.
 */
export function sessionControlEnv(
  control: SessionControl,
  session: SurfaceSessionRef,
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  const vars = control.controlEnv({
    projectId: session.projectId,
    agentId: session.agentId,
    sessionId: session.sessionId,
  });
  const prepend = control.pathPrepend();
  if (prepend.length === 0) return vars;
  const key = Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  const current = env[key];
  const prefix = prepend.join(path.delimiter);
  return {
    ...vars,
    [key]:
      current === undefined || current === "" ? prefix : `${prefix}${path.delimiter}${current}`,
  };
}

/** What the pty manager gives back; the members this surface reads of a terminal. */
type TerminalHandle = NonNullable<ReturnType<Terminals["get"]>>;

interface Tracked {
  terminal: TerminalHandle;
  state: SurfaceState;
  report: ((state: SurfaceState | SurfaceReport) => void) | null;
  quiet: ReturnType<typeof setTimeout> | null;
  unsubscribe: () => void;
  /** Where this Session's transcripts are, and how far one has been read. */
  titles: {
    dir: string;
    file: string | null;
    /**
     * What the directory held when this Session started following it, by SIZE — everything
     * an earlier run left behind. A file that has not grown since is not this program's
     * (see pickTranscript).
     */
    baseline: Map<string, number>;
    offset: number;
    last: string | null;
    timer: ReturnType<typeof setInterval> | null;
  } | null;
}

/** The parked document: which terminal each Session's surface is. */
interface Parked {
  sessions?: Record<string, string>;
}

/**
 * The surface: one pty per Session, running Claude Code in the Workspace, with the activity
 * heuristic above as its state.
 */
export class ClaudeCodeSurface implements SessionSurface {
  private readonly tracked = new Map<string, Tracked>();

  constructor(
    private readonly terminals: Terminals,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly settleMs: number = SCREEN_SETTLE_MS,
    private readonly titlePollMs: number = TITLE_POLL_MS,
    /** The Session's control variables; null runs the program with the server's environment alone. */
    private readonly control: SessionControl | null = null,
  ) {}

  /** Claims back the terminals a previous App parked; a terminal that is gone is forgotten. */
  adopt(parked: Json): void {
    const sessions = (parked as Parked | null)?.sessions ?? {};
    for (const [sessionId, terminalId] of Object.entries(sessions)) {
      const terminal = this.terminals.get(terminalId);
      if (terminal === undefined || !terminal.alive) continue;
      this.track(sessionId, terminal);
    }
  }

  park(): Json {
    const sessions: Record<string, string> = {};
    for (const [sessionId, t] of this.tracked) sessions[sessionId] = t.terminal.id;
    return { sessions };
  }

  async open(
    session: SurfaceSessionRef,
    options: SurfaceOpenOptions,
    report: (state: SurfaceState | SurfaceReport) => void,
  ): Promise<SurfaceView> {
    const existing = this.tracked.get(session.sessionId);
    if (existing !== undefined && existing.terminal.alive) {
      // Idempotent: the same program, and the reporter of THIS App from now on. A terminal
      // claimed back after a swap has no follower yet — this is where it gets one.
      existing.report = report;
      if (existing.titles === null)
        await this.followTitle(session.sessionId, existing, session.workspace);
      return this.viewOf(existing);
    }
    if (existing !== undefined) this.untrack(session.sessionId);
    // Refused here rather than at the pty, which can only say `execvp(3) failed.: No such
    // file or directory` — true, and useless about which program or where it was sought.
    if (claudeMissing(this.env)) {
      throw new Error(
        `Claude Code is not installed where this server can see it. Looked in ` +
          `${claudeSearchedIn(this.env).join(", ")}. Install it there, or set ` +
          `PENGUIN_CLAUDE_BIN to the path of the \`claude\` executable.`,
      );
    }
    const terminal = await this.terminals.create({
      cwd: session.workspace,
      ownerUserId: session.ownerUserId,
      name: "claude",
      command: claudeArgv(options.prompt, this.env),
      ...(this.control !== null ? { env: sessionControlEnv(this.control, session, this.env) } : {}),
      unsetEnv: INHERITED_SESSION_MARKERS,
      ...(options.cols !== undefined ? { cols: options.cols } : {}),
      ...(options.rows !== undefined ? { rows: options.rows } : {}),
    });
    const tracked = this.track(session.sessionId, terminal);
    tracked.report = report;
    await this.followTitle(session.sessionId, tracked, session.workspace);
    return this.viewOf(tracked);
  }

  view(sessionId: string): SurfaceView | null {
    const tracked = this.tracked.get(sessionId);
    return tracked === undefined ? null : this.viewOf(tracked);
  }

  status(sessionId: string): SurfaceState {
    return this.tracked.get(sessionId)?.state ?? "idle";
  }

  close(sessionId: string): void {
    const tracked = this.tracked.get(sessionId);
    if (tracked === undefined) return;
    if (tracked.terminal.alive) tracked.terminal.kill();
    this.untrack(sessionId);
  }

  private viewOf(tracked: Tracked): SurfaceView {
    return { alive: tracked.terminal.alive, view: { terminalId: tracked.terminal.id } };
  }

  /**
   * Follows the title Claude Code gives this Session, and reports each new one.
   *
   * Polled rather than watched: a transcript is an append-only file in a directory the tool
   * owns, `fs.watch` is unreliable across platforms and mounted filesystems, and the read is
   * a readdir plus the bytes appended since the last look. The file is re-chosen every poll
   * because `/resume` moves the program to another session — and therefore another file.
   */
  private async followTitle(sessionId: string, tracked: Tracked, cwd: string): Promise<void> {
    const dir = transcriptDir(cwd, this.env);
    // The baseline is taken BEFORE the first look, and awaited: everything already in the
    // directory belongs to earlier runs in this Workspace, and this program's own transcript
    // does not exist yet. Taken later, a transcript written in the meantime would be read as
    // one of those leftovers and never followed.
    tracked.titles = {
      dir,
      file: null,
      baseline: new Map((await transcripts(dir)).map((t) => [t.file, t.size])),
      offset: 0,
      last: null,
      timer: null,
    };
    const look = () => {
      void (async () => {
        const state = tracked.titles;
        if (state === null) return;
        const found = await transcripts(state.dir);
        // What every OTHER Session of this surface is following: a shared Workspace means a
        // shared directory, and two Sessions must never read one program's transcript.
        const takenByOthers = new Set<string>();
        for (const [id, other] of this.tracked) {
          if (id !== sessionId && other.titles?.file != null) takenByOthers.add(other.titles.file);
        }
        const file = pickTranscript(found, { file: state.file }, takenByOthers, state.baseline);
        if (file === null) return;
        if (file !== state.file) {
          // A different transcript (the first one, or one `/resume` moved to): read it whole.
          state.file = file;
          state.offset = 0;
          state.last = null;
        }
        let chunk: string;
        try {
          const handle = await fsp.open(file, "r");
          try {
            const { size } = await handle.stat();
            if (size < state.offset) state.offset = 0; // Truncated or replaced under the name.
            if (size === state.offset) return;
            const buffer = Buffer.alloc(size - state.offset);
            await handle.read(buffer, 0, buffer.length, state.offset);
            state.offset = size;
            chunk = buffer.toString("utf8");
          } finally {
            await handle.close();
          }
        } catch {
          return; // Being written, or gone: the next poll tries again.
        }
        const title = readAiTitle(chunk);
        if (title === null || title === state.last) return;
        state.last = title;
        // Logged once per change: a title that does not reach the Session list is otherwise
        // indistinguishable from a program that never named itself.
        console.log(`[claude-code] title: ${JSON.stringify(title)}`);
        tracked.report?.({ status: tracked.state, title });
      })();
    };
    const timer = setInterval(look, this.titlePollMs);
    timer.unref?.();
    tracked.titles.timer = timer;
    look();
  }

  private track(sessionId: string, terminal: TerminalHandle): Tracked {
    const tracked: Tracked = {
      terminal,
      state: "idle",
      report: null,
      quiet: null,
      unsubscribe: () => {},
      titles: null,
    };
    // Output is the CUE to look, never the answer: the screen is what says whether a turn is
    // in flight. Coalesced, because the bar redraws many times a second while it works.
    const offOutput = terminal.onOutput(() => {
      if (tracked.quiet !== null) return;
      tracked.quiet = setTimeout(() => {
        tracked.quiet = null;
        this.readScreen(tracked);
      }, this.settleMs);
      tracked.quiet.unref?.();
    });
    const offExit = terminal.onExit(() => {
      if (tracked.quiet !== null) clearTimeout(tracked.quiet);
      tracked.quiet = null;
      this.flip(tracked, "idle");
    });
    tracked.unsubscribe = () => {
      offOutput();
      offExit();
    };
    this.tracked.set(sessionId, tracked);
    return tracked;
  }

  private untrack(sessionId: string): void {
    const tracked = this.tracked.get(sessionId);
    if (tracked === undefined) return;
    if (tracked.titles?.timer != null) clearInterval(tracked.titles.timer);
    tracked.titles = null;
    if (tracked.quiet !== null) clearTimeout(tracked.quiet);
    tracked.unsubscribe();
    this.tracked.delete(sessionId);
  }

  /** One look at the screen, and a report when it changed the answer. */
  private readScreen(tracked: Tracked): void {
    if (!tracked.terminal.alive) return this.flip(tracked, "idle");
    let lines: readonly string[];
    try {
      lines = tracked.terminal.capture().lines;
    } catch {
      // A terminal that cannot be read says nothing about the turn; the last answer stands.
      return;
    }
    this.flip(tracked, readsAsRunning(lines) ? "running" : "idle");
  }

  private flip(tracked: Tracked, state: SurfaceState): void {
    if (tracked.state === state) return;
    tracked.state = state;
    tracked.report?.(state);
  }
}

/**
 * The plugin's one module: the surface on the SessionSurfacesModule.surfaces slot, with
 * Terminals and the Sessions' SessionEnv as its requirements (its manifest is generated into
 * ifaces.json from here). Rebuilt per App; the Session → terminal map parks and is claimed
 * back at the next setup.
 */
@Component({
  contributes: {
    "WebModule.quickStarts": [
      {
        id: "claude-code.quick-start",
        prompt:
          "Look around this Workspace and summarize what the project is and how to build and test it.",
        promptZh: "浏览当前工作区，概括这个项目是什么，以及如何构建和测试它。",
        surface: "claude-code",
      },
    ],
    "SessionSurfacesModule.surfaces": [
      {
        id: "claude-code.surface",
        kind: "claude-code",
        label: "Claude Code",
        labelZh: "Claude Code",
        renderer: { builtin: "TerminalSurface" },
      },
    ],
  },
  context: { version: 1 },
})
export class ClaudeCode {
  @Use() private readonly terminals!: Terminals;
  @Use("SessionRuntimeModule") private readonly sessionEnv!: SessionEnv;
  @Bind("claude-code.surface") surface!: ClaudeCodeSurface;

  setup(_ctx: ClassCtx, context: Json) {
    this.surface = new ClaudeCodeSurface(
      this.terminals,
      process.env,
      SCREEN_SETTLE_MS,
      TITLE_POLL_MS,
      this.sessionEnv,
    );
    this.surface.adopt(context);
    liveSurface.current = this.surface;
  }

  park(): Json {
    return this.surface.park();
  }
}

/**
 * The surface of the current App, for the queue to read a program's activity off: the two
 * modules are rebuilt together, and the queue asks at every pass rather than holding on.
 */
const liveSurface: { current: ClaudeCodeSurface | null } = { current: null };

/** The queue's settings group — its contribution id, which the values are stored under. */
export const QUEUE_CONFIG_GROUP = "claude-code-queue";
export const DEFAULT_CAPACITY = 4;
export const DEFAULT_IDLE_MINUTES = 30;

function bounded(raw: unknown, min: number, max: number, fallback: number): number {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= min && raw <= max
    ? raw
    : fallback;
}

/** The stored values, each one outside its bounds read as its default. */
export function queueConfigOf(values: Record<string, unknown>): {
  capacity: number;
  idleMinutes: number;
} {
  return {
    capacity: bounded(values.capacity, 1, 64, DEFAULT_CAPACITY),
    idleMinutes: bounded(values.idleMinutes, 0, 1440, DEFAULT_IDLE_MINUTES),
  };
}

/**
 * The queue (queue.ts), its routes, and the console page company mode shows it on. A node of
 * its own: it requires the session surfaces the ClaudeCode node contributes to, which that
 * node must not (a cycle).
 */
@Component({
  contributes: {
    "HttpModule.routes": [
      {
        // These literals repeat QUEUE_PREFIX / PAGE_PREFIX; a test holds the copies together.
        id: "claude-code.queue-routes",
        prefix: "/api/projects/:projectId/organizations/:orgId/claude-code",
        auth: "user",
        order: 150,
      },
      {
        id: "claude-code.page-routes",
        prefix: "/api/claude-code",
        auth: "user",
        order: 151,
      },
    ],
    "WebModule.pages": [
      {
        id: "claude-code.console",
        key: "claude-code",
        path: "claude-code",
        nav: "org",
        admin: false,
        renderer: { iframe: { src: "/api/claude-code/page", namespace: "claude-code" } },
      },
    ],
    "PluginConfigProvider.groups": [
      {
        // These literals repeat QUEUE_CONFIG_GROUP and the defaults; a test holds them together.
        id: "claude-code-queue",
        title: "Claude Code queue",
        titleZh: "Claude Code 队列",
        description:
          "The runs employees queue in company mode. The settings apply to every organization on this server.",
        descriptionZh: "公司模式下员工排队的 Claude Code 运行。设置对本服务器上的所有组织生效。",
        properties: {
          capacity: {
            type: "number",
            title: "Slots",
            titleZh: "名额",
            description:
              "How many Claude Code runs may be open at once on this server; the rest wait in line.",
            descriptionZh: "本服务器上同时打开的 Claude Code 运行数上限，其余的排队等待。",
            minimum: 1,
            maximum: 64,
            default: 4,
          },
          idleMinutes: {
            type: "number",
            title: "Close when idle (minutes)",
            titleZh: "空闲关闭（分钟）",
            description:
              "A run whose program has been waiting for input this long is closed and its slot handed on. 0 never closes one.",
            descriptionZh: "程序等待输入满这么久的运行会被关闭，名额交给下一个。0 表示从不关闭。",
            minimum: 0,
            maximum: 1440,
            default: 30,
          },
        },
      },
    ],
  },
})
export class ClaudeCodeQueueModule {
  @Use("CompanyModule") private readonly gateway!: OrgGateway;
  @Use("SessionRuntimeModule") private readonly sessionService!: SessionServiceIface;
  @Use("SessionRuntimeModule") private readonly sessions!: SessionIndex;
  @Use("SessionRuntimeModule") private readonly surfaces!: SessionSurfaces;
  @Use() private readonly terminals!: Terminals;
  @Use("RuntimeModule") private readonly paths!: Paths;
  @Use("RuntimeModule") private readonly log!: Log;
  @Use("PluginConfigModule") private readonly pluginConfig!: PluginConfig;
  @Bind(QUEUE_ROUTES_ID) routes!: Hono;
  @Bind(PAGE_ROUTES_ID) page!: Hono;

  setup({ effect }: ClassCtx) {
    const queue = new ClaudeCodeQueue({
      gateway: this.gateway,
      sessionService: this.sessionService,
      sessions: this.sessions,
      surfaces: this.surfaces,
      activity: (sessionId) => liveSurface.current?.status(sessionId) ?? "idle",
      screen: (terminalId) => {
        const terminal = this.terminals.get(terminalId);
        if (terminal === undefined || !terminal.alive) return null;
        try {
          return [...terminal.capture().lines];
        } catch {
          return null;
        }
      },
      root: this.paths.root,
      config: () => queueConfigOf(this.pluginConfig.get(QUEUE_CONFIG_GROUP)),
      surfaceKind: "claude-code",
      log: (line) => this.log.line(line),
    });
    void queue.start();
    effect(() => {
      void queue.stop();
    });
    this.routes = queueRoutes(queue);
    this.page = pageRoutes();
  }
}

const plugin: Plugin = { modules: [ClaudeCode, ClaudeCodeQueueModule] };
export default plugin;
