/**
 * A finding kit, read back: the saved input against the state it ran on.
 *
 * `finding.ts` writes the kit while the rig that tripped the finding is still alive — the input,
 * the calls it decoded to, the database and the data root's files. This file is the other half.
 * It boots a rig out of that kit, rebases every absolute path inside the copied database onto the
 * new root (a Session's `workspace` names the old root, and a tool call that resolves it would
 * write outside the rig or into a directory that no longer exists), runs the saved input once and
 * says which face came back.
 *
 * The three answers, and the exit code each one gets:
 *
 *   0  the same kind of finding — `soft-timeout`, `invariant` or `crash` — came back
 *   2  the input passed: the finding does not reproduce against its own kit
 *   3  a different kind came back (a crash where a soft timeout was recorded): the input is
 *      still live, but not on the face the kit names
 *
 * Exit 2 is not a harness failure, and that distinction is the point of the tool: a finding that
 * does not reproduce from its own state is a fact about the finding, and triage needs to see it
 * instead of a second guess.
 *
 * A replay never re-derives its own premises. The kit is the state; running the setup pipeline on
 * top of it would write over exactly what has to be reproduced, so a replay boots the rig and
 * runs the input, and nothing else.
 */
import fs from "node:fs";
import path from "node:path";
import { openExistingDatabase } from "../../../../packages/server/src/db/database.js";
import type { SeedReading } from "./assemble.js";
import { findingKind } from "./finding.js";

export interface Kit {
  /** Absolute path of the kit directory. */
  dir: string;
  /** The input bytes, exactly as libFuzzer handed them to `fuzz`. */
  input: Buffer;
  /** What `kind.txt` recorded: `soft-timeout`, `invariant` or `crash` (`unknown` when absent). */
  kind: string;
  /** The finding's message — its first line, which is what a reader compares. */
  message: string;
  /** The calls the kit names, in order; the last one is the failing call. */
  calls: string[];
  /** The data root the kit was taken from; `null` for a kit written before that was recorded. */
  oldRoot: string | null;
  /** The API leg's credential at the time of the finding, when the kit carries it. */
  adminPassword: string | null;
  /** Whether the kit carries the rig's file tree (`root/`) beside the database. */
  hasTree: boolean;
}

/**
 * Read a kit directory. Only `input.bin` is required: a kit whose database or metadata could not
 * be written is still worth replaying the input of, and saying which part is missing is more
 * useful than refusing the whole directory.
 */
export function readKit(dir: string): Kit {
  const absolute = path.resolve(dir);
  const inputPath = path.join(absolute, "input.bin");
  if (!fs.existsSync(inputPath)) {
    throw new Error(`${absolute} is not a finding kit: no input.bin in it`);
  }
  const { kind, message } = readKind(path.join(absolute, "kind.txt"));
  const state = readState(path.join(absolute, "kit.json"));
  const calls = Array.isArray(state["calls"])
    ? (state["calls"] as unknown[]).filter((call): call is string => typeof call === "string")
    : [];
  const root = state["root"];
  const password = state["adminPassword"];
  return {
    dir: absolute,
    input: fs.readFileSync(inputPath),
    kind,
    message,
    calls,
    oldRoot: typeof root === "string" && root !== "" ? root : null,
    adminPassword: typeof password === "string" ? password : null,
    hasTree: fs.existsSync(path.join(absolute, "root")),
  };
}

/** `kind.txt` is `<kind>\n<message>\n<stack…>` — see finding.ts. */
function readKind(file: string): { kind: string; message: string } {
  try {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    return { kind: (lines[0] ?? "").trim() || "unknown", message: (lines[1] ?? "").trim() };
  } catch {
    return { kind: "unknown", message: "" };
  }
}

function readState(file: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { state?: unknown };
    const state = parsed.state;
    return typeof state === "object" && state !== null ? (state as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Point every absolute path in the copied database at the new root.
 *
 * Generic over the schema on purpose: which columns hold a path is the product's business (today
 * `sessions.workspace`, `agent_api.workspace` and the Trace cache's `workspace`), and a replay
 * that silently missed a column added later would look like a finding that does not reproduce.
 * Every text column of every table is scanned for the old root instead — on a disposable copy, so
 * a false positive in an error message costs nothing, and a miss costs a wrong answer.
 *
 * Returns how many columns and rows it touched, for the report.
 */
export function rebaseDatabase(
  dbPath: string,
  oldRoot: string,
  newRoot: string,
): { columns: number; rows: number } {
  const db = openExistingDatabase(dbPath);
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    let columns = 0;
    let rows = 0;
    for (const table of tables) {
      const columnsOf = db.prepare(`PRAGMA table_info("${table.name}")`).all() as {
        name: string;
        type: string;
      }[];
      for (const column of columnsOf) {
        // `instr`, not `LIKE`: the root is a temp path and a `%` or `_` in it would be a wildcard.
        const update = db.prepare(
          `UPDATE "${table.name}" SET "${column.name}" = replace("${column.name}", ?, ?) ` +
            `WHERE instr("${column.name}", ?) > 0`,
        );
        const result = update.run(oldRoot, newRoot, oldRoot) as { changes?: number };
        const changed = Number(result.changes ?? 0);
        if (changed > 0) {
          columns += 1;
          rows += changed;
        }
      }
    }
    // Leave one file instead of a database plus its write-ahead log: the boot that follows opens
    // the same file, and a checkpoint here keeps the copied rig diagnosable by hand.
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch {
      // Not fatal: SQLite replays the log on the next open.
    }
    return { columns, rows };
  } finally {
    db.close();
  }
}

/**
 * The ids the rig already knows, by the key the contract gives them — the pool a replayed input
 * draws from.
 *
 * An input's argv is derived from the bytes *and* from the pools (`specs/decode.ts`): `session
 * show` names whatever `pools.sessionId` holds. A replay that booted the saved state with empty
 * pools would therefore run a different command line than the one the kit recorded, so the pools
 * are rebuilt from the very database the input ran against. Ids the input itself creates are
 * captured as it runs, exactly as in a fuzz run.
 */
export function seedPools(dbPath: string, pools: Record<string, string[]>): void {
  const sources: [key: string, sql: string][] = [
    ["projectId", "SELECT project_id AS id FROM projects"],
    ["agentId", "SELECT agent_id AS id FROM agents"],
    ["sessionId", "SELECT session_id AS id FROM sessions"],
    ["userId", "SELECT user_id AS id FROM users"],
    ["ownerUserId", "SELECT owner_user_id AS id FROM projects"],
    ["scheduleId", "SELECT name AS id FROM schedule_state"],
  ];
  const db = openExistingDatabase(dbPath);
  try {
    for (const [key, sql] of sources) {
      try {
        const rows = db.prepare(sql).all() as { id?: unknown }[];
        const ids = rows
          .map((row) => row.id)
          .filter((id): id is string => typeof id === "string" && id !== "");
        if (ids.length > 0) pools[key] = [...new Set([...(pools[key] ?? []), ...ids])];
      } catch {
        // A table this build does not have: nothing to seed from it.
      }
    }
  } finally {
    db.close();
  }
}

/** What the rig holds on disk: files and bytes under a data root, excluding the database itself. */
export function describeTree(root: string): { files: number; bytes: number; traces: number } {
  let files = 0;
  let bytes = 0;
  let traces = 0;
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files += 1;
        try {
          bytes += fs.statSync(full).size;
        } catch {
          // A file that vanished mid-walk contributes nothing.
        }
        if (entry.name.endsWith(".jsonl")) traces += 1;
      }
    }
  };
  walk(root);
  return { files, bytes, traces };
}

export interface ReplayOptions {
  /** The leg's own `fuzz` — the same function libFuzzer calls. */
  run: (input: Buffer) => Promise<void>;
  /** The rig's size after boot: the state scale a reader needs to judge the replay. */
  probe: () => Promise<Record<string, number>>;
  /** The new data root, for the "what was planted" reading. */
  root: string;
  /** What the boot planted, when the rig came from the kit: tree, rebased columns and rows. */
  seed?: SeedReading;
  /** Tear the rig down before exiting (the kit lives elsewhere; this is tidiness). */
  cleanup: () => Promise<void>;
}

/**
 * Run the kit's input once and end the process with what came back.
 *
 * Never returns: a replay is one answer, and the exit code is the answer.
 */
export async function replayAndExit(kit: Kit, options: ReplayOptions): Promise<never> {
  const report: string[] = [];
  const say = (line: string): void => {
    report.push(line);
    console.log(line);
  };

  const planted = describeTree(options.root);
  say(`[replay] kit: ${kit.dir}`);
  say(`[replay] expected: ${kit.kind}${kit.message === "" ? "" : ` — ${kit.message}`}`);
  if (kit.calls.length > 0) {
    say(`[replay] recorded ${kit.calls.length} call(s); the last was`);
    say(`[replay]   ${kit.calls[kit.calls.length - 1]}`);
  }
  if (!kit.hasTree)
    say("[replay] the kit carries no file tree — the input runs on the database alone");
  if (options.seed !== undefined) {
    const { tree, rebased } = options.seed;
    say(
      `[replay] planted: ${tree ? "the file tree and " : ""}the database — ` +
        `${rebased.columns} text column(s) / ${rebased.rows} row(s) rebased onto this root` +
        (kit.oldRoot === null ? "" : ` from ${kit.oldRoot}`),
    );
  }
  if (kit.oldRoot === null)
    say("[replay] the kit names no old data root — no path could be rebased");
  say(
    `[replay] rig: ${options.root} — ${planted.files} file(s) / ${planted.bytes}B under it, ` +
      `${planted.traces} Trace shard(s)`,
  );
  const state = await options.probe().catch(() => ({}) as Record<string, number>);
  say(`[replay] state: ${JSON.stringify(state)}`);
  say(`[replay] input: ${kit.input.length}B`);

  const began = performance.now();
  let thrown: Error | null = null;
  try {
    await options.run(kit.input);
  } catch (err) {
    thrown = err instanceof Error ? err : new Error(String(err));
  }
  const ms = Math.round(performance.now() - began);

  let code: number;
  if (thrown === null) {
    say(`[replay] outcome: did not reproduce — the input passed (${ms}ms)`);
    code = 2;
  } else {
    const kind = findingKind(thrown);
    const same = kind === kit.kind;
    const sameMessage = kit.message !== "" && thrown.message.split("\n")[0] === kit.message;
    say(
      `[replay] outcome: ${same ? "reproduced" : "a different face"} (${kind}) after ${ms}ms — ` +
        `${sameMessage ? "same message" : "a different message"}`,
    );
    say(`[replay]   ${thrown.message.split("\n").slice(0, 6).join("\n[replay]   ")}`);
    code = same ? 0 : 3;
  }

  try {
    const outDir = process.env.FUZZ_OUT_DIR;
    if (outDir !== undefined) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "replay.md"), `${report.join("\n")}\n`, "utf8");
    }
  } catch {
    // The console line is the answer; a report that cannot be filed does not change it.
  }

  await options.cleanup().catch(() => {});
  process.exit(code);
}
