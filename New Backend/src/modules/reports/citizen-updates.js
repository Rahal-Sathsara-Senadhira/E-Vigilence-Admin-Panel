// What the citizen sees in the mobile app — docs/11 §5. One `report_updates`
// document per milestone, written only by this system; the app's backend
// turns each into a push notification. Never: the offender's details, the
// station, the outcome or any amount.
//
// Until the app reads `report_updates`, its own three-value status on its
// `reports` document is kept up to date too (docs/11 §9) — the one exception
// to "one writer per collection", which goes away when the app switches.

import mongoose from "mongoose";
import { REJECTION_REASONS } from "./report.model.js";

const LEGACY_STATUS = {
  received: "In Progress",
  needs_info: "In Progress",
  under_review: "In Progress",
  action_taken: "Completed",
  rejected: "Rejected",
};

/**
 * @typedef {object} CitizenUpdate
 * @property {"received" | "needs_info" | "under_review" | "rejected" | "action_taken" | "closed_no_action"} type
 * @property {string} title
 * @property {string} message
 * @property {string | null} question
 */

/** @type {CitizenUpdate} */
export const RECEIVED = {
  type: "received",
  title: "Received",
  message: "Thank you. Your report has been received and will be checked.",
  question: null,
};

/**
 * The update for a report's new status, or null if the citizen isn't told
 * (back in the queue after a reply is still "under review" to them).
 * @param {{ status: string, triage: { question?: string | null, reasonCode?: string | null } }} r
 * @returns {CitizenUpdate | null}
 */
export function updateFor(r) {
  switch (r.status) {
    case "needs_info":
      return {
        type: "needs_info",
        title: "We need more information",
        message: r.triage.question ?? "",
        question: r.triage.question ?? null,
      };
    case "accepted":
    case "merged":
      return {
        type: "under_review",
        title: "Under review",
        message: "Your report is being looked into.",
        question: null,
      };
    case "rejected": {
      const code = /** @type {keyof typeof REJECTION_REASONS} */ (
        r.triage.reasonCode ?? "insufficient_evidence"
      );
      return {
        type: "rejected",
        title: "Closed",
        message: REJECTION_REASONS[code] ?? REJECTION_REASONS.insufficient_evidence,
        question: null,
      };
    }
    default:
      return null;
  }
}

/**
 * Writes an update for a mobile-app report, in the caller's transaction.
 * Staff-recorded reports have no app to tell, and are skipped.
 * @param {import("mongoose").ClientSession} session
 * @param {{ channel: string, reportNumber: string, source?: { appReportId: any, userId?: string | null } | null }} report
 * @param {CitizenUpdate} update
 */
export async function publishUpdate(session, report, update) {
  if (report.channel !== "citizen_app" || !report.source?.appReportId) return;
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected.");
  await db.collection("report_updates").insertOne(
    {
      reportId: report.source.appReportId,
      userId: report.source.userId ?? null,
      reportNumber: report.reportNumber,
      ...update,
      at: new Date(),
    },
    { session },
  );
  const legacy = LEGACY_STATUS[/** @type {keyof typeof LEGACY_STATUS} */ (update.type)];
  if (legacy) {
    await db.collection("reports").updateOne(
      { _id: report.source.appReportId },
      {
        $set: {
          status: legacy,
          rejectionReason: update.type === "rejected" ? update.message : null,
        },
      },
      { session },
    );
  }
}

/** The case was decided with an enforcement outcome (docs/11 §5). @type {CitizenUpdate} */
export const ACTION_TAKEN = {
  type: "action_taken",
  title: "Action taken",
  message: "The police have taken action on what you reported. Thank you.",
  question: null,
};

/** The case ended with no further action (docs/05 §8). @type {CitizenUpdate} */
export const CLOSED_NO_ACTION = {
  type: "closed_no_action",
  title: "Closed — no action possible",
  message: "We looked into your report but couldn't take action this time.",
  question: null,
};
