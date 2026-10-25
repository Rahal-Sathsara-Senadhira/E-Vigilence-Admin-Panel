// The shape of a report in responses, and what the viewer may do with it.
// The reporter's phone is shown only to staff who triage or record
// reports; others see it masked (docs/10 §5.3).

import { scopeOf } from "#src/core/access/permissions.js";
import { mask } from "#src/core/srilanka.js";
import { REJECTION_REASONS } from "./report.model.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */

/**
 * @param {any} r
 * @param {{ caseNumbers: Map<string, string>, actor: Actor, detailed: boolean,
 *   standing?: import("../reporters/index.js").ReporterStanding | null }} extra
 */
export function reportView(r, { caseNumbers, actor, detailed, standing = null }) {
  const triage = scopeOf(actor.role, "reports.triage") === "N";
  const record = Boolean(scopeOf(actor.role, "reports.record"));
  const lockActive = Boolean(r.triage?.lockedUntil && new Date(r.triage.lockedUntil) > new Date());
  const lockedByOther = lockActive && String(r.triage.lockedBy?.id) !== String(actor.userId);
  const underReview = r.stationOriginated && !r.stationReviewed && r.status === "accepted";
  const base = {
    id: String(r._id),
    reportNumber: r.reportNumber,
    channel: r.channel,
    status: r.status,
    priority: r.priority,
    receivedAt: new Date(r.receivedAt).toISOString(),
    occurredAt: new Date(r.occurredAt).toISOString(),
    vehicleNumber: r.vehicleNumber ?? null,
    plateUnknown: Boolean(r.plateUnknown),
    offenceCodes: r.offenceCodes ?? [],
    address: r.address ?? null,
    stationOriginated: Boolean(r.stationOriginated),
    underStationReview: underReview,
    evidenceCount: (r.evidenceIds ?? []).length,
    flags: r.flags ?? [],
    /** A mobile-app reporter flagged or suspended (docs/02 §10); null otherwise. */
    reporterStanding: standing,
    case: r.caseId
      ? { id: String(r.caseId), caseNumber: caseNumbers.get(String(r.caseId)) ?? null }
      : null,
    lockedBy: lockActive ? (r.triage.lockedBy?.name ?? null) : null,
  };
  if (!detailed) return base;
  return {
    ...base,
    receivedBy: r.receivedBy?.name ?? null,
    reporter: {
      kind: r.reporter.kind,
      appAccountId: r.source?.userId ?? null,
      name: r.reporter.name ?? null,
      phone: r.reporter.phone
        ? triage || record
          ? r.reporter.phone
          : mask(r.reporter.phone)
        : null,
    },
    location: r.location?.coordinates
      ? { lat: r.location.coordinates[1], lng: r.location.coordinates[0] }
      : null,
    /** How a mobile-app reporter set the pin, and a GPS pin's accuracy in metres. */
    locationSource: r.locationSource ?? null,
    locationAccuracy: r.locationAccuracy ?? null,
    vehicleType: r.vehicleType ?? null,
    vehicleDescription: r.vehicleDescription ?? null,
    description: r.description,
    injuries: Boolean(r.injuries),
    triage: {
      decidedBy: r.triage?.decidedBy ?? null,
      decidedAt: r.triage?.decidedAt ? new Date(r.triage.decidedAt).toISOString() : null,
      reasonCode: r.triage?.reasonCode ?? null,
      reasonText: r.triage?.reasonCode
        ? REJECTION_REASONS[/** @type {keyof typeof REJECTION_REASONS} */ (r.triage.reasonCode)]
        : null,
      note: triage ? (r.triage?.note ?? null) : null,
      question: r.triage?.question ?? null,
      askedAt: r.triage?.askedAt ? new Date(r.triage.askedAt).toISOString() : null,
      replies: (r.triage?.replies ?? []).map((/** @type {any} */ x) => ({
        at: new Date(x.at).toISOString(),
        text: x.text,
        recordedBy: x.recordedBy,
      })),
      lockedUntil: lockActive ? new Date(r.triage.lockedUntil).toISOString() : null,
    },
    history: (r.history ?? []).map((/** @type {any} */ h) => ({
      at: new Date(h.at).toISOString(),
      event: h.event,
      by: h.by,
      note: h.note ?? null,
    })),
    can: {
      triage: triage && r.status === "pending" && !lockedByOther,
      ask: triage && r.status === "pending" && r.reporter.kind !== "anonymous" && !lockedByOther,
      recordReply: triage && r.status === "needs_info",
      reject:
        triage && (["pending", "needs_info"].includes(r.status) || underReview) && !lockedByOther,
      merge: triage && (r.status === "pending" || underReview) && !lockedByOther,
      confirmStationReport: triage && underReview,
      undoMerge: triage && r.status === "merged",
      reconsider: triage && r.status === "rejected",
      changePriority: triage && ["pending", "needs_info"].includes(r.status),
      suspendReporter:
        Boolean(r.source?.userId) &&
        scopeOf(actor.role, "reporters.suspend") === "N" &&
        standing?.status !== "suspended",
      reinstateReporter:
        Boolean(r.source?.userId) &&
        scopeOf(actor.role, "reporters.suspend") === "N" &&
        Boolean(standing),
      secondOfficerAccept:
        r.status === "awaiting_second_officer" &&
        ["station_oic", "traffic_officer"].includes(actor.role) &&
        String(r.receivedBy?.id) !== String(actor.userId),
    },
  };
}
