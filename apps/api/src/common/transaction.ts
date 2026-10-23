// Multi-record changes run in one transaction (docs/14 M8), together with
// their audit entry.

import type { ClientSession, Connection } from "mongoose";

const MAX_ATTEMPTS = 5;

function isAuditSeqConflict(err: unknown): boolean {
  const e = err as { code?: number; keyPattern?: Record<string, unknown> } | null;
  return !!e && e.code === 11000 && !!e.keyPattern && "seq" in e.keyPattern;
}

/**
 * Runs `work` in a transaction. MongoDB retries transient conflicts itself;
 * this also retries when another transaction took the next audit sequence
 * number first, so concurrent changes queue up instead of failing.
 */
export async function inTransaction<T>(
  conn: Connection,
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const session = await conn.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && isAuditSeqConflict(err)) continue;
      throw err;
    } finally {
      await session.endSession();
    }
  }
}
