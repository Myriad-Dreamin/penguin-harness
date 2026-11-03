/**
 * Park and release — the per-input clean state.
 *
 * At the end of every input (in the leg's `fuzz`) the rig is parked and released:
 *
 *   park     the rig must go quiet, then its SQLite state is serialized: the write-ahead log is
 *            checkpointed with TRUNCATE, the log must end up empty (every byte of state now sits
 *            in the main file), `quick_check` must pass, and the content is read out as a
 *            per-table row count. A park that cannot do any of these is a finding — it means the
 *            rig's state is not serializable at an input boundary.
 *   release  the parked rig is torn down and a fresh one booted in the same process (libFuzzer
 *            never stops), and the fresh rig's snapshot must equal the premises the boot itself
 *            wrote — sessions, usage, error rows, everything the input created is gone.
 *
 * Together they are what makes a finding reproducible without archived evidence: every input
 * starts from the same clean state, so the input bytes alone re-run it. The data root's file tree
 * is deliberately outside park's scope — the fs the fuzzer mocks is not the state park manages;
 * park's contract covers the process's own state (the database, the timers, the in-flight work).
 *
 * The invariants live here because both legs share them; each leg owns the order (park → rotate →
 * assert) around its own boot.
 */
import fs from "node:fs";
import { openDatabaseReadOnly, openExistingDatabase } from "../../../../packages/server/src/db/database.js";
import { settleQuiet } from "./epoch.js";
import type { DbSnapshot } from "./invariants.js";

/** What park read off the rig — the serialized state, and the proof that it is complete. */
export interface Parked {
  root: string;
  dbPath: string;
  /** Bytes left in the write-ahead log after the TRUNCATE checkpoint — always 0 or park failed. */
  walBytes: number;
  /** The serialized content: every user table's row count. */
  tables: Record<string, number>;
}

/** Park the rig: quiet, checkpoint, integrity, and the serialized table counts. */
export async function parkRig(rig: { root: string; dbPath: string; quiet: Parameters<typeof settleQuiet>[0] }): Promise<Parked> {
  const settled = await settleQuiet(rig.quiet);
  if (!settled) {
    throw new Error(
      `[park] the rig did not go quiet at the input boundary, its state cannot be serialized: ` +
        `${rig.quiet.busy() || "unknown work still in flight"}`,
    );
  }
  const db = openExistingDatabase(rig.dbPath);
  let check = "ok";
  try {
    // Every committed row moves from the log into the main file; with no other connection in
    // flight the log ends up zero-length. A log that survives means a writer park cannot see.
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    const row = db.prepare("PRAGMA quick_check(1)").get() as { quick_check?: string } | undefined;
    check = row?.quick_check ?? "ok";
  } finally {
    db.close();
  }
  if (check !== "ok") {
    throw new Error(`[park] the parked database failed quick_check: ${check}`);
  }
  const walBytes = fs.existsSync(`${rig.dbPath}-wal`) ? fs.statSync(`${rig.dbPath}-wal`).size : 0;
  if (walBytes !== 0) {
    throw new Error(
      `[park] the write-ahead log still holds ${walBytes}B after the TRUNCATE checkpoint — ` +
        `the serialization is incomplete (a connection park does not know is still writing)`,
    );
  }
  return { root: rig.root, dbPath: rig.dbPath, walBytes, tables: tableCounts(rig.dbPath) };
}

/** Every user table's row count — the serialization a park hands back. */
function tableCounts(dbPath: string): Record<string, number> {
  const db = openDatabaseReadOnly(dbPath);
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM "${table.name}"`).get() as
        | { n?: number }
        | undefined;
      counts[table.name] = Number(row?.n ?? 0);
    }
    return counts;
  } finally {
    db.close();
  }
}

const SNAPSHOT_FIELDS: readonly (keyof DbSnapshot)[] = [
  "projects",
  "agents",
  "sessions",
  "scheduleState",
  "usage",
  "errTotal",
  "errUnexpected",
  "errUnexpectedNonLlm",
  "errProcess",
  "errUncaught",
  "errUnhandled",
  "errLlmUnexpected",
  "fixtureProject",
  "fixtureAgent",
];

/**
 * The release invariant, read off the fresh rig: every field must equal the premises the boot
 * itself wrote. Anything else is state a released input left behind.
 */
export function releaseViolations(premises: DbSnapshot, released: DbSnapshot): string[] {
  return SNAPSHOT_FIELDS.filter((field) => released[field] !== premises[field]).map(
    (field) => `${field} ${premises[field]} → ${released[field]}`,
  );
}
