// Reports from the mobile app — docs/11 §8. The import job (app-import
// module) reads the app's collections and normalises what it finds; these
// functions apply it under the same rules as everything else: one
// transaction, an audit entry, and an update for the citizen.

import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { nextNumber } from "#src/core/db/counters.js";
import { toPoint } from "#src/core/geo.js";
import { recordNumber } from "#src/core/srilanka.js";
import { recordEvidence } from "../evidence/index.js";
import { RECEIVED, publishUpdate, updateFor } from "./citizen-updates.js";
import { Report } from "./report.model.js";

const IMPORTER = { id: null, name: "Mobile app import" };
const SYSTEM_ACTOR = { kind: /** @type {const} */ ("system"), id: null, name: IMPORTER.name };

/**
 * @typedef {object} AppReportInput
 * @property {import("mongoose").Types.ObjectId} appReportId
 * @property {string | null} clientReportId
 * @property {string | null} userId          null: anonymous
 * @property {string | null} reporterName
 * @property {string | null} reporterPhone
 * @property {Date} receivedAt
 * @property {Date} occurredAt
 * @property {{ lat: number, lng: number } | null} location
 * @property {string | null} address
 * @property {string | null} vehicleNumber
 * @property {string | null} vehicleType
 * @property {string | null} vehicleDescription
 * @property {string[]} offenceCodes
 * @property {string} description
 * @property {boolean} injuries
 * @property {"P1" | "P2"} priority
 * @property {string[]} flags
 * @property {keyof typeof import("./report.model.js").REJECTION_REASONS | null} rejection  refused on import, with the reason
 */

/**
 * @typedef {object} StoredAppFile
 * @property {string} key
 * @property {import("../evidence/receive-upload.js").ReceivedFile} file
 * @property {boolean} capturedInApp
 * @property {Date | null} capturedAt
 */

/**
 * Creates the report for one app report, with its already-stored files.
 * Returns null if it was imported before (same app id, or the same
 * device's report re-sent) — the caller then removes the stored files.
 * @param {AppReportInput} input @param {StoredAppFile[]} files
 */
export async function receiveFromApp(input, files) {
  try {
    return await inTransaction(async (session) => {
      const reportNumber = recordNumber("RP", await nextNumber("reports", session));
      const now = new Date();
      const rejected = input.rejection !== null;
      const [created] = await Report.create(
        [
          {
            reportNumber,
            channel: "citizen_app",
            receivedAt: input.receivedAt,
            receivedBy: IMPORTER,
            reporter: input.userId
              ? {
                  kind: "citizen",
                  name: input.reporterName,
                  phone: input.reporterPhone,
                  citizenId: input.userId,
                }
              : { kind: "anonymous" },
            source: {
              appReportId: input.appReportId,
              clientReportId: input.clientReportId,
              userId: input.userId,
            },
            flags: input.flags,
            occurredAt: input.occurredAt,
            location: input.location ? toPoint(input.location.lat, input.location.lng) : null,
            address: input.address,
            vehicleNumber: input.vehicleNumber,
            plateUnknown: !input.vehicleNumber,
            vehicleType: input.vehicleType,
            vehicleDescription: input.vehicleDescription,
            offenceCodes: input.offenceCodes,
            description: input.description,
            injuries: input.injuries,
            status: rejected ? "rejected" : "pending",
            priority: input.priority,
            triage: rejected
              ? { reasonCode: input.rejection, decidedBy: IMPORTER.name, decidedAt: now }
              : {},
            history: [
              {
                at: now,
                event: "received",
                by: IMPORTER.name,
                note: "Received from the mobile app",
              },
              ...(rejected
                ? [
                    {
                      at: now,
                      event: "rejected",
                      by: IMPORTER.name,
                      note: `Refused on import: ${String(input.rejection).replaceAll("_", " ")}`,
                    },
                  ]
                : []),
            ],
          },
        ],
        { session },
      );
      const report = /** @type {NonNullable<typeof created>} */ (created);
      for (const f of files) {
        const item = await recordEvidence(session, {
          key: f.key,
          file: f.file,
          reportId: report._id,
          receivedVia: "citizen_app",
          by: IMPORTER,
          capturedInApp: f.capturedInApp,
          capturedAt: f.capturedAt,
        });
        report.evidenceIds.push(item._id);
      }
      if (files.length) await report.save({ session });

      await publishUpdate(
        session,
        report,
        rejected ? /** @type {any} */ (updateFor(report)) : RECEIVED,
      );
      await recordAudit(
        {
          actor: SYSTEM_ACTOR,
          action: rejected ? "reports.refused_on_import" : "reports.imported",
          summary: rejected
            ? `Imported ${reportNumber} from the mobile app and refused it: ${String(input.rejection).replaceAll("_", " ")}`
            : `Imported ${reportNumber} from the mobile app${files.length ? ` with ${files.length} evidence file${files.length === 1 ? "" : "s"}` : ""}`,
          target: { type: "report", id: String(report._id), label: reportNumber },
          source: { ip: null, userAgent: "mobile-app-import" },
          places: [],
        },
        session,
      );
      return { id: String(report._id), reportNumber, status: report.status };
    });
  } catch (err) {
    if (/** @type {any} */ (err)?.code === 11000) return null;
    throw err;
  }
}

/**
 * The citizen's answer from the app (`report_replies`). Applied only to a
 * report waiting for an answer, from the same citizen; anything else is
 * ignored (docs/11 §5.1). The report goes back to the queue.
 * @param {{ appReportId: import("mongoose").Types.ObjectId, userId: string | null, answer: string }} reply
 * @returns {Promise<boolean>} whether it was applied
 */
export async function applyAppReply({ appReportId, userId, answer }) {
  const report = await Report.findOne({
    "source.appReportId": appReportId,
    status: "needs_info",
  });
  if (!report || !report.source?.userId || report.source.userId !== userId) return false;
  const text = answer.trim().slice(0, 1000);
  if (!text) return false;
  await inTransaction(async (session) => {
    const now = new Date();
    report.triage.replies.push({ at: now, text, recordedBy: "Reporter (mobile app)" });
    report.status = "pending";
    report.history.push({
      at: now,
      event: "reply_received",
      by: "Reporter (mobile app)",
      note: "Answered in the app; back in the queue",
    });
    await report.save({ session });
    await recordAudit(
      {
        actor: SYSTEM_ACTOR,
        action: "reports.reply_received",
        summary: "The reporter answered in the mobile app; back in the queue",
        target: { type: "report", id: String(report._id), label: report.reportNumber },
        source: { ip: null, userAgent: "mobile-app-import" },
        places: [{ stationId: report.stationId }],
      },
      session,
    );
  });
  return true;
}
