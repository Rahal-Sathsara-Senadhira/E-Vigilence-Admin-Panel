// Record numbers — docs/14 M3: one sequence per prefix per year, in the
// existing `counters` collection ({ _id, seq }, shared with the old system,
// whose keys look like "citation-2026"). Assigned inside the caller's
// transaction, so a rolled-back insert doesn't burn a number.

import type { ClientSession, Connection } from "mongoose";

export type NumberPrefix = "RP" | "TC" | "PN" | "CR";

/** Sri Lanka year of `at` — numbers roll over at midnight in Colombo (UTC+05:30). */
function colomboYear(at: Date): number {
  return new Date(at.getTime() + 5.5 * 3_600_000).getUTCFullYear();
}

/** "RP-2026-000123" */
export async function nextNumber(
  conn: Connection,
  prefix: NumberPrefix,
  session?: ClientSession,
  at: Date = new Date(),
): Promise<string> {
  const year = colomboYear(at);
  const res = await conn
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: `${prefix}-${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after", session },
    );
  const seq = res?.seq ?? 1;
  return `${prefix}-${year}-${String(seq).padStart(6, "0")}`;
}
