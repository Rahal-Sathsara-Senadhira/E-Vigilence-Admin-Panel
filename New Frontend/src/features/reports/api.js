// Reports and triage — backend /api/v1/reports (docs/02).

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUpload } from "@/lib/api.js";

/**
 * @typedef {object} ReportRow
 * @property {string} id
 * @property {string} reportNumber
 * @property {string} channel
 * @property {"pending" | "needs_info" | "awaiting_second_officer" | "accepted" | "merged" | "rejected"} status
 * @property {"P1" | "P2" | "P3"} priority
 * @property {string} receivedAt
 * @property {string} occurredAt
 * @property {string | null} vehicleNumber
 * @property {boolean} plateUnknown
 * @property {string[]} offenceCodes
 * @property {string | null} address
 * @property {boolean} stationOriginated
 * @property {boolean} underStationReview
 * @property {number} evidenceCount
 * @property {string[]} flags
 * @property {{ status: "flagged" | "suspended", reason: string | null, since: string | null } | null} reporterStanding
 * @property {{ id: string, caseNumber: string | null } | null} case
 * @property {string | null} lockedBy
 */

/**
 * @typedef {ReportRow & {
 *   receivedBy: string | null,
 *   reporter: { kind: "citizen" | "named" | "anonymous", appAccountId: string | null, name: string | null, phone: string | null },
 *   abuse: { count: number, threshold: number, days: number } | null,
 *   answerDueAt: string | null,
 *   location: { lat: number, lng: number } | null,
 *   vehicleType: string | null,
 *   vehicleDescription: string | null,
 *   description: string,
 *   injuries: boolean,
 *   triage: { decidedBy: string | null, decidedAt: string | null, reasonCode: string | null, reasonText: string | null, note: string | null, question: string | null, askedAt: string | null, replies: { at: string, text: string, recordedBy: string }[], lockedUntil: string | null },
 *   history: { at: string, event: string, by: string, note: string | null }[],
 *   evidence: { id: string, kind: "photo" | "video" | "audio", mime: string, size: number, sha256: string, originalName: string | null, uploadedBy: string | null, uploadedAt: string, capturedInApp: boolean | null, capturedAt: string | null }[],
 *   matches: { reports: Match[], cases: Match[] } | null,
 *   can: { triage: boolean, ask: boolean, recordReply: boolean, reject: boolean, merge: boolean, confirmStationReport: boolean, undoMerge: boolean, reconsider: boolean, changePriority: boolean, secondOfficerAccept: boolean, suspendReporter: boolean, reinstateReporter: boolean },
 * }} Report
 */

/** @typedef {{ id: string, reportNumber?: string, caseNumber?: string, status: string, vehicleNumber: string | null, occurredAt: string, why: string }} Match */

/** @param {{ view: string, q?: string, priority?: string, page: number, pageSize?: number }} filters */
export const useReports = (filters) =>
  useQuery({
    queryKey: ["reports", "list", filters],
    queryFn: () =>
      /** @type {Promise<{ items: ReportRow[], total: number, page: number, pageSize: number }>} */ (
        api("/reports", { query: { pageSize: 25, ...filters } })
      ),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

/** @param {string | null} id */
export const useReport = (id) =>
  useQuery({
    queryKey: ["reports", "one", id],
    queryFn: () => /** @type {Promise<Report>} */ (api(`/reports/${id}`)),
    enabled: Boolean(id),
  });

/** Refreshes lists and the record after any change. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["reports"] });
}

export function useRecordReport() {
  const refresh = useRefresh();
  return useMutation({
    /** @param {object} body */
    mutationFn: (body) =>
      /** @type {Promise<Report>} */ (api("/reports", { method: "POST", body })),
    onSuccess: refresh,
  });
}

/** One triage action on a report. @param {string} id */
export function useReportAction(id) {
  const refresh = useRefresh();
  return useMutation({
    /** @param {{ action: string, body?: object }} input */
    mutationFn: ({ action, body }) =>
      /** @type {Promise<Report>} */ (
        api(`/reports/${id}/${action}`, { method: "POST", body: body ?? {} })
      ),
    onSuccess: refresh,
  });
}

/**
 * Suspend a mobile-app reporter, or lift a flag or suspension (HQ
 * supervisors, docs/02 §10).
 */
export function useReporterAction() {
  const refresh = useRefresh();
  return useMutation({
    /** @param {{ userId: string, action: "suspend" | "reinstate", reason: string }} input */
    mutationFn: ({ userId, action, reason }) =>
      api(`/reporters/${encodeURIComponent(userId)}/${action}`, {
        method: "POST",
        body: { reason },
      }),
    onSuccess: refresh,
  });
}

/** @param {string} id */
export function useUploadEvidence(id) {
  const refresh = useRefresh();
  return useMutation({
    /** @param {File} file */
    mutationFn: (file) =>
      /** @type {Promise<Report>} */ (apiUpload(`/reports/${id}/evidence`, file)),
    onSuccess: refresh,
  });
}

/** Takes the 15-minute triage lock; released when leaving. @param {string} id */
export const lockReport = (id) => api(`/reports/${id}/lock`, { method: "POST" });
/** @param {string} id */
export const unlockReport = (id) =>
  api(`/reports/${id}/lock`, { method: "DELETE" }).catch(() => {});

/** @param {string} number */
export const lookupCase = (number) =>
  /** @type {Promise<{ id: string, caseNumber: string, status: string, vehicleNumber: string | null, occurredAt: string }>} */ (
    api("/cases/lookup", { query: { number } })
  );

/**
 * Reports by number, plate or place — for Ctrl+K. Only what the user may
 * see (the server applies their scope).
 * @param {string} q
 */
export const searchReports = (q) =>
  /** @type {Promise<{ items: ReportRow[], total: number }>} */ (
    api("/reports", { query: { view: "all", q, page: 1, pageSize: 6 } })
  );
