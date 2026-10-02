import type { Migration } from "../migration.js";

export const dropGoalState: Migration = {
  name: "drop-goal-state",
  // Narrowing: drops a table. A pushed platform rolled back to 0.2.9 mid-process would
  // prepare its goal statements against a table that is gone (its declarative track only
  // runs at the runtime's own open, never at a platform boot), so this is the first
  // restart-only migration: refused on the swap path, applied by the runtime's open.
  swapSafe: false,
  // Done once neither the table nor its index is left. Every database a build since 0.2.10
  // opened is in that state, so a root adopted into the ledger does not refuse a push here.
  isApplied(db) {
    return (
      db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE name IN ('goal_state', 'idx_goal_session') LIMIT 1",
        )
        .get() === undefined
    );
  },
  up(db) {
    // 0.2.9 → 0.2.10. goal_state held goal mode's run state, one row per goal run, read
    // back only for the chat page's goal banner; the goal plugin's GOAL.json in the
    // Session scratchpad is that record now (see runtime/goal-events.ts). IF EXISTS only
    // because a database this build created never had the table.
    db.exec(`
      DROP INDEX IF EXISTS idx_goal_session;
      DROP TABLE IF EXISTS goal_state;
    `);
  },
  // Recreates the table exactly as 0.2.9 declared it — EMPTY. LOSES every goal run ever
  // recorded (objective, status, budget, used, rounds per run): the rows only ever fed the
  // banner of a finished goal, and a build with this migration reads the goal file instead.
  down(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS goal_state (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id  TEXT NOT NULL,
        project_id  TEXT NOT NULL,
        agent_id    TEXT NOT NULL,
        objective   TEXT NOT NULL,
        status      TEXT NOT NULL,
        budget      INTEGER NOT NULL,
        used        INTEGER NOT NULL DEFAULT 0,
        rounds      INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_goal_session ON goal_state(session_id);
    `);
  },
};
