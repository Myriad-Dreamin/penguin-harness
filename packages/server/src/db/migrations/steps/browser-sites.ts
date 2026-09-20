import type { Migration } from "../migration.js";

export const browserSites: Migration = {
  name: "browser-sites",
  // One new table, nothing existing touched: a platform rolled back to one without the
  // Browser never queries it.
  swapSafe: true,
  up(db) {
    // Frozen copy of the DDL as of the Browser feature; do not re-derive from schema.ts.
    db.exec(`
      CREATE TABLE IF NOT EXISTS browser_sites (
        label        TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        machine_id   TEXT NOT NULL,
        origin       TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        last_used_at TEXT NOT NULL,
        UNIQUE (user_id, machine_id, origin)
      );
    `);
  },
  // LOSES which host each site was served on: every site gets a new one the next time it is
  // opened, so what a page kept in that host's storage and cookies is orphaned.
  down(db) {
    db.exec(`DROP TABLE IF EXISTS browser_sites;`);
  },
};
