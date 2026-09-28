import type { Migration } from "../migration.js";

export const machineDefinitions: Migration = {
  name: "machine-definitions",
  // One new table, nothing existing touched — `machines` keeps every row as it is, since an
  // `ssh:<alias>` address is still what the ssh kind names it. A platform rolled back to one
  // without machine kinds never queries it.
  swapSafe: true,
  up(db) {
    // Frozen copy of the DDL as of machine kinds; do not re-derive from schema.ts.
    db.exec(`
      CREATE TABLE IF NOT EXISTS machine_definitions (
        address    TEXT PRIMARY KEY,
        kind       TEXT NOT NULL,
        name       TEXT NOT NULL,
        spec       TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  },
  // LOSES every machine a person defined by hand for a kind that leaves it to the host (the
  // containers): their records stay in `machines`, listed as nothing names them any more.
  down(db) {
    db.exec(`DROP TABLE IF EXISTS machine_definitions;`);
  },
};
