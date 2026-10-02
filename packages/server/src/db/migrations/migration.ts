import type { DatabaseSync } from "node:sqlite";

interface MigrationBase {
  /**
   * Kebab-case, names the change. It is the migration's IDENTITY: the ledger records it, and
   * every build — older or newer, from any PR line — recognises the work by it. Never renamed
   * once pushed.
   */
  name: string;
  /**
   * Applied inside a transaction together with its ledger row; throw to abort and leave the
   * ledger without it. Must be safe to run again on a database where its work is already done
   * (see the module doc's RE-RUNNABLE rule).
   */
  up: (db: DatabaseSync) => void;
  /**
   * Undoes `up`, or null when this migration cannot be undone — required, not optional, so
   * "there is no undo" is something the author states rather than forgets.
   *
   * Never called by the swap path (see the module doc): a failed boot reverts the platform,
   * not the schema. Reached only through `rollbackTo`, and destructive by nature — dropping
   * a table takes its rows with it.
   */
  down: ((db: DatabaseSync) => void) | null;
}

/** Strictly additive (or a superset the previous platform still reads and writes). */
interface SwapSafeMigration extends MigrationBase {
  swapSafe: true;
}

/**
 * Narrowing work a rolled-back platform could not survive: refused on the swap path, applied
 * by the runtime's own open.
 */
interface RestartOnlyMigration extends MigrationBase {
  swapSafe: false;
  /**
   * Is this migration's effect already in the database? A root adopted into the ledger has
   * every migration pending by name, though most of them took effect long ago; without this
   * probe the first restart-only migration would refuse every hot push onto such a root. When
   * it answers true the swap path does not refuse, and `up` runs as the no-op it then is.
   */
  isApplied: (db: DatabaseSync) => boolean;
}

/**
 * One schema change. `swapSafe` exists because of hot updates: a pushed platform boots against
 * a live database and is ROLLED BACK to its predecessor if it fails; the predecessor then runs
 * on whatever the migration already did.
 */
export type Migration = SwapSafeMigration | RestartOnlyMigration;
