// Migrations — docs/14 §5 (R1–R5).
//
// Each migration has a stable id, is idempotent (safe to run twice), and
// supports a dry run that reports what it would change without writing.
// Applied migrations are recorded in the `migrations` collection and in the
// audit log. Add new ones to the end of MIGRATIONS in registry.ts.

import type { Connection } from "mongoose";

export interface MigrationContext {
  conn: Connection;
  /** false = dry run: report, don't write. */
  apply: boolean;
  log: (message: string) => void;
}

export interface MigrationResult {
  /** Records (or indexes) created or changed — or that would be, in a dry run. */
  changed: number;
  /** Counts per kind, for the reconciliation report (R4). */
  details?: Record<string, number>;
}

export interface Migration {
  /** "0001-create-indexes" — never renamed once applied anywhere. */
  id: string;
  description: string;
  /**
   * Runs on every `migrate`, not just once — for idempotent upkeep such as
   * creating the indexes of models added since the last run.
   */
  repeatable?: boolean;
  run(ctx: MigrationContext): Promise<MigrationResult>;
}
