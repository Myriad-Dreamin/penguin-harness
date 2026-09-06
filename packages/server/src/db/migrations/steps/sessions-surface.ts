import { ensureColumn } from "../../database.js";
import type { Migration } from "../migration.js";

export const sessionsSurface: Migration = {
  name: "sessions-surface",
  // The column that says which surface renders a Session (NULL = the built-in
  // conversation). It has to be a migration, not only a line in openDatabase's
  // ensureColumn list: that list runs when the PROCESS starts, and a pushed platform
  // boots against the runtime's already-open database. Without this, a push carrying
  // the surface code would write `surface` to a table that has no such column, and
  // every session insert — creation, fork, subagent registration, and the Trace
  // adoption the session list hydrates through — would fail on a live deployment.
  swapSafe: true,
  up(db) {
    ensureColumn(db, "sessions", "surface", "TEXT");
  },
  // Deliberately a no-op rather than a DROP: schema.ts declares the column, so a build
  // rolled back to before it does not mind finding it, and dropping it would discard
  // which surface every surface Session is — the one fact its row carries.
  down() {},
};
