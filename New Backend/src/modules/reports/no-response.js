// No answer from the reporter — docs/02 §6.3, docs/09: a report waiting for
// information longer than the limit (default 7 days) is rejected as
// "no response", and the reporter is told. The limit in force when the
// question was asked applies (docs/09 T2). Run regularly by the server.

import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { limitAt } from "../settings/settings.service.js";
import { publishUpdate, updateFor } from "./citizen-updates.js";
import { Report } from "./report.model.js";

const BY = "Automatic (no answer)";
const BATCH = 200;

/**
 * Rejects every report whose reporter didn't answer in time.
 * @param {Date} [now]
 * @returns {Promise<number>} how many were rejected
 */
export async function rejectUnanswered(now = new Date()) {
  let rejected = 0;
  /** @type {any} */
  let after = null;
  for (;;) {
    const waiting = await Report.find(
      { status: "needs_info", ...(after ? { _id: { $gt: after } } : {}) },
      { _id: 1, triage: 1, updatedAt: 1 },
    )
      .sort({ _id: 1 })
      .limit(BATCH)
      .lean();
    for (const w of waiting) {
      const due = await limitAt("reports.needs_info_reply", w.triage.askedAt ?? w.updatedAt);
      if (due <= now && (await rejectOne(w._id, due))) rejected++;
    }
    if (waiting.length < BATCH) return rejected;
    after = waiting.at(-1)?._id;
  }
}

/**
 * @param {import("mongoose").Types.ObjectId} id @param {Date} due
 * @returns {Promise<boolean>}
 */
function rejectOne(id, due) {
  return inTransaction(async (session) => {
    // Re-read in the transaction: an answer may have arrived meanwhile.
    const report = await Report.findOne({ _id: id, status: "needs_info" }, null, { session });
    if (!report) return false;
    const now = new Date();
    report.status = "rejected";
    report.triage.reasonCode = "no_response";
    report.triage.decidedBy = BY;
    report.triage.decidedAt = now;
    report.history.push({
      at: now,
      event: "rejected",
      by: BY,
      note: `No answer by ${due.toISOString().slice(0, 10)}`,
    });
    await report.save({ session });
    const update = updateFor(report);
    if (update) await publishUpdate(session, report, update);
    await recordAudit(
      {
        actor: { kind: "system", id: null, name: BY },
        action: "reports.rejected_no_response",
        summary: "Rejected: the reporter didn't answer in time",
        target: { type: "report", id: String(report._id), label: report.reportNumber },
        source: { ip: null, userAgent: "no-response-sweep" },
        places: [{ stationId: report.stationId }],
      },
      session,
    );
    return true;
  });
}
