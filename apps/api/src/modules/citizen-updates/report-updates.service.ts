// What the citizen sees — docs/11 §5, docs/02 §9. One `report_updates`
// document per milestone, written only by this system; the app's backend
// turns each into a push notification. Never: offender details, station,
// outcome type or amounts.
//
// Until the app reads `report_updates`, the app's own three-value status on
// its `reports` document is also kept up to date (docs/11 §9). That field is
// the one exception to "one writer per collection", and it goes away when
// the app switches over.

import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { REJECTION_REASONS, type RejectionReason, type TriageStatus } from "@ev/shared";
import type { ClientSession, Connection, Types } from "mongoose";

export type CitizenUpdateType =
  "received" | "needs_info" | "under_review" | "rejected" | "action_taken" | "closed_no_action";

export interface ReportUpdateDoc {
  reportId: Types.ObjectId; // the app's `reports` document
  userId: string | null;
  reportNumber: string;
  type: CitizenUpdateType;
  title: string;
  message: string;
  question: string | null;
  at: Date;
}

const LEGACY_STATUS: Partial<Record<CitizenUpdateType, string>> = {
  received: "In Progress",
  needs_info: "In Progress",
  under_review: "In Progress",
  action_taken: "Completed",
  rejected: "Rejected",
};

interface CitizenReportRef {
  channel: string;
  sourceReportId: Types.ObjectId | null;
  reportNumber: string;
  reporter: { userId: string | null };
}

@Injectable()
export class ReportUpdatesService {
  constructor(@InjectConnection() private readonly conn: Connection) {}

  /** The citizen-facing update for a triage status, or null if the citizen isn't told. */
  updateFor(
    status: TriageStatus,
    extra: { question?: string | null; rejection?: RejectionReason | null },
  ) {
    switch (status) {
      case "pending":
        return null; // back in the queue after a reply: still "under review" from the citizen's side
      case "needs_info":
        return {
          type: "needs_info" as const,
          title: "We need more information",
          message: extra.question ?? "",
          question: extra.question ?? null,
        };
      case "accepted":
      case "merged":
        return {
          type: "under_review" as const,
          title: "Under review",
          message: "Your report is being looked into.",
          question: null,
        };
      case "rejected": {
        const code = extra.rejection ?? "insufficient_evidence";
        return {
          type: "rejected" as const,
          title: "Closed",
          message: REJECTION_REASONS[code],
          question: null,
        };
      }
      default:
        return null;
    }
  }

  async publish(
    report: CitizenReportRef,
    update: { type: CitizenUpdateType; title: string; message: string; question: string | null },
    session?: ClientSession,
  ) {
    if (report.channel !== "citizen_app" || !report.sourceReportId) return;
    const at = new Date();
    await this.conn.collection<ReportUpdateDoc>("report_updates").insertOne(
      {
        reportId: report.sourceReportId,
        userId: report.reporter.userId,
        reportNumber: report.reportNumber,
        ...update,
        at,
      } as ReportUpdateDoc,
      { session },
    );
    const legacy = LEGACY_STATUS[update.type];
    if (legacy) {
      await this.conn.collection("reports").updateOne(
        { _id: report.sourceReportId },
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
}
