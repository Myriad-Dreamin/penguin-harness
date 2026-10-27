/**
 * The three invariants, read off a second, read-only SQLite connection.
 *
 * They are the same three the hand-driven run checked, unchanged in meaning:
 *
 *  1. no process-level error row appears (source='process', or code
 *     uncaught_exception / unhandled_rejection) — the harness contains every input;
 *  2. no `unexpected` row appears outside the LLM failures the scripted stub actually played
 *     (source='llm' rows are budgeted by the play count, so a failure nobody injected shows
 *     up as a violation);
 *  3. an exception may not escape the handler to the caller — that one is checked by the
 *     caller, because it is a throw rather than a row.
 *
 * A violation comes back as a sentence; the fuzz target turns it into a thrown error, which
 * is how Jazzer.js records a crash and saves the input that caused it.
 */
import { openDatabaseReadOnly } from "../../../../packages/server/src/db/database.js";

export interface DbSnapshot {
  projects: number;
  agents: number;
  sessions: number;
  scheduleState: number;
  usage: number;
  errTotal: number;
  errUnexpected: number;
  errUnexpectedNonLlm: number;
  errProcess: number;
  errUncaught: number;
  errUnhandled: number;
  errLlmUnexpected: number;
  /** The fixture the target's own specs stand on, so a route that deletes it is visible. */
  fixtureProject: number;
  fixtureAgent: number;
}

const SNAPSHOT_SQL = `
SELECT
  (SELECT COUNT(*) FROM projects) AS projects,
  (SELECT COUNT(*) FROM agents) AS agents,
  (SELECT COUNT(*) FROM sessions) AS sessions,
  (SELECT COUNT(*) FROM schedule_state) AS scheduleState,
  (SELECT COUNT(*) FROM usage_records) AS usage,
  (SELECT COUNT(*) FROM error_records) AS errTotal,
  (SELECT COUNT(*) FROM error_records WHERE kind='unexpected') AS errUnexpected,
  (SELECT COUNT(*) FROM error_records WHERE kind='unexpected' AND source<>'llm') AS errUnexpectedNonLlm,
  (SELECT COUNT(*) FROM error_records WHERE source='process') AS errProcess,
  (SELECT COUNT(*) FROM error_records WHERE code='uncaught_exception') AS errUncaught,
  (SELECT COUNT(*) FROM error_records WHERE code='unhandled_rejection') AS errUnhandled,
  (SELECT COUNT(*) FROM error_records WHERE source='llm' AND kind='unexpected') AS errLlmUnexpected,
  (SELECT COUNT(*) FROM projects WHERE project_id='default_project') AS fixtureProject,
  (SELECT COUNT(*) FROM agents WHERE agent_id='default_agent') AS fixtureAgent
`;

/** Count the resource tables and the error rows, over a read-only connection. */
export function readSnapshot(dbPath: string): DbSnapshot {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return db.prepare(SNAPSHOT_SQL).get() as unknown as DbSnapshot;
  } finally {
    db.close();
  }
}

export interface InvariantState {
  snapshot: DbSnapshot;
  baseline: DbSnapshot;
  /** Scripted LLM failure plays recorded by the fake loader so far. */
  llmFailurePlays: number;
}

/** Every violation the snapshot shows, in the order a reader wants them. Empty is healthy. */
export function invariantViolations(state: InvariantState): string[] {
  const { snapshot, baseline, llmFailurePlays } = state;
  const violations: string[] = [];
  if (snapshot.errProcess > baseline.errProcess) {
    violations.push(
      `error_records gained source='process' rows: ${baseline.errProcess} → ${snapshot.errProcess}`,
    );
  }
  if (
    snapshot.errUncaught > baseline.errUncaught ||
    snapshot.errUnhandled > baseline.errUnhandled
  ) {
    violations.push(
      `uncaught_exception/unhandled_rejection rows appeared: ${snapshot.errUncaught}/${snapshot.errUnhandled}`,
    );
  }
  if (snapshot.errUnexpectedNonLlm > baseline.errUnexpectedNonLlm) {
    violations.push(
      `kind='unexpected' rows outside the injected source='llm' bucket: ${baseline.errUnexpectedNonLlm} → ${snapshot.errUnexpectedNonLlm}`,
    );
  }
  // Dedup (source, code, project) means rows ≤ plays always; rows > plays means a failure
  // nobody scripted reached the record.
  if (snapshot.errLlmUnexpected > llmFailurePlays) {
    violations.push(
      `source='llm' unexpected rows (${snapshot.errLlmUnexpected}) exceed the scripted failure plays (${llmFailurePlays})`,
    );
  }
  return violations;
}
