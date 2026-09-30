import { ensureColumn } from "../../database.js";
import type { Migration } from "../migration.js";

export const errorRecordsContext: Migration = {
  name: "error-records-context",
  // What an unexpected error's record was missing to be read back by the one who caused
  // it: a truncated stack, the Task it happened in and the request (telemetry's request
  // key). Three nullable columns, plus an index for the per-Session read. Swap-safe: a
  // pushed platform boots against the runtime's already-open database, so the columns
  // have to arrive here, not only in openDatabase's process-start list; a platform rolled
  // back past this never names them.
  swapSafe: true,
  up(db) {
    ensureColumn(db, "error_records", "stack", "TEXT");
    ensureColumn(db, "error_records", "task_id", "TEXT");
    ensureColumn(db, "error_records", "request_id", "TEXT");
    db.exec("CREATE INDEX IF NOT EXISTS idx_error_session ON error_records(session_id)");
  },
  // Deliberately a no-op rather than a DROP: schema.ts declares the columns and the index,
  // so a build rolled back to before them does not mind finding them, and dropping the
  // columns would take every stored stack with them.
  down() {},
};
