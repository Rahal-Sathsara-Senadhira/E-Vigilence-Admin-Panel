// Reports from the mobile app — docs/11 §8. The import job (app-import
// module) reads the app's collections and normalises what it finds; these
// functions apply it under the same rules as everything else: one
// transaction, an audit entry, and an update for the citizen.

import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { nextNumber } from "#src/core/db/counters.js";
import { toPoint } from "#src/core/geo.js";
import { recordNumber } from "#src/core/srilanka.js";
import { Evidence, recordEvidence } from "../evidence/index.js";
import { RECEIVED, publishUpdate, updateFor } from "./citizen-updates.js";
import { Report } from "./report.model.js";

const IMPORTER = { id: null, name: "Mobile app import" };

/**
 * Minutes to wait before each new try at copying a report's missing
 * evidence; after the last, it is retried daily until EVIDENCE_MAX_TRIES.
 */
export const EVIDENCE_RETRY_MIN = [1, 5, 15, 60, 360];
export const EVIDENCE_MAX_TRIES = 12;
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
 * @property {(typeof import("./report.model.js").LOCATION_SOURCES)[number] | null} [locationSource] how the pin was set (older app builds: none)
 * @property {number | null} [locationAccuracy]  metres, for a GPS pin
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
            // Files that couldn't be copied are tried again (attachAppEvidence).
            evidenceSync: input.flags.includes("evidence_download_failed")
              ? { attempts: 1, nextAt: new Date(now.getTime() + EVIDENCE_RETRY_MIN[0] * 60_000) }
              : null,
            occurredAt: input.occurredAt,
            location: input.location ? toPoint(input.location.lat, input.location.lng) : null,
            address: input.address,
            locationSource: input.locationSource ?? null,
            locationAccuracy: input.locationAccuracy ?? null,
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
 * One more try at a report's missing evidence: records the files that
 * arrived (with their custody), and when nothing is missing any more,
 * clears the flag. Otherwise sets when to try next, or gives up after
 * EVIDENCE_MAX_TRIES (the flag stays for triage).
 * @param {any} reportId
 * @param {StoredAppFile[]} files  newly copied
 * @param {{ complete: boolean, error: string | null }} outcome
 * @returns {Promise<{ complete: boolean, added: number, gaveUp: boolean, skipped: StoredAppFile[] } | null>}
 *   null if the report is gone; `skipped`: files already on it (the caller removes their copies)
 */
export async function attachAppEvidence(reportId, files, { complete, error }) {
  return inTransaction(async (session) => {
    const report = await Report.findById(reportId, null, { session });
    if (!report) return null;
    // Another try finished it meanwhile: nothing to record.
    if (!report.flags.includes("evidence_download_failed")) {
      return { complete: true, added: 0, gaveUp: false, skipped: files };
    }
    const now = new Date();
    // Checked again here, inside the transaction: a file is never recorded
    // twice on a report, even if two tries raced to copy it.
    const have = new Set(
      (
        await Evidence.find({ _id: { $in: report.evidenceIds } }, { sha256: 1 }, { session }).lean()
      ).map((e) => e.sha256),
    );
    const fresh = [];
    const skipped = [];
    for (const f of files) {
      if (have.has(f.file.sha256)) skipped.push(f);
      else {
        have.add(f.file.sha256);
        fresh.push(f);
      }
    }
    for (const f of fresh) {
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
      if (!f.capturedInApp && !report.flags.includes("not_captured_in_app"))
        report.flags.push("not_captured_in_app");
    }

    const attempts = (report.evidenceSync?.attempts ?? 0) + 1;
    const gaveUp = !complete && attempts >= EVIDENCE_MAX_TRIES;
    if (complete) {
      report.flags = report.flags.filter((f) => f !== "evidence_download_failed");
      report.evidenceSync = null;
    } else {
      const wait = EVIDENCE_RETRY_MIN[attempts - 1] ?? 24 * 60;
      report.evidenceSync = {
        attempts,
        nextAt: gaveUp ? null : new Date(now.getTime() + wait * 60_000),
        lastError: error,
        gaveUpAt: gaveUp ? now : null,
      };
    }
    if (fresh.length || complete || gaveUp) {
      const note = [
        fresh.length
          ? `${fresh.length} evidence file${fresh.length === 1 ? "" : "s"} received from the mobile app`
          : null,
        complete ? "all of the reporter's evidence is now here" : null,
        gaveUp ? `gave up copying the rest after ${attempts} tries` : null,
      ]
        .filter(Boolean)
        .join("; ");
      report.history.push({ at: now, event: "evidence_received", by: IMPORTER.name, note });
      await recordAudit(
        {
          actor: SYSTEM_ACTOR,
          action: gaveUp ? "reports.evidence_copy_failed" : "reports.evidence_received",
          summary: `${report.reportNumber}: ${note}`,
          target: { type: "report", id: String(report._id), label: report.reportNumber },
          source: { ip: null, userAgent: "mobile-app-import" },
          places: [],
        },
        session,
      );
    }
    await report.save({ session });
    return { complete, added: fresh.length, gaveUp, skipped };
  });
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
