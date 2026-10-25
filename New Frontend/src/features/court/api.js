// Court cases and courts — server state (docs/06).

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api.js";

/**
 * @typedef {object} CourtCaseRecord
 * @property {string} id
 * @property {string} courtRef
 * @property {keyof typeof import("./lib/labels.js").COURT_STATUS} status
 * @property {keyof typeof import("./lib/labels.js").ROUTES} route
 * @property {string} caseId
 * @property {string} caseNumber
 * @property {string | null} noticeId
 * @property {string | null} noticeNumber
 * @property {{ personId: string | null, name: string, address: string | null } | null} accused
 * @property {{ id: string, name: string } | null} court
 * @property {string | null} courtCaseNumber
 * @property {{ code: string, name: string, legalReference: string }[]} charges
 * @property {string | null} summary
 * @property {string | null} prosecutingOfficer
 * @property {string | null} preparedBy
 * @property {string | null} approvedBy
 * @property {string | null} filedAt
 * @property {{ date: string, outcome: string | null, notes: string | null, nextDate: string | null, recordedBy: string | null }[]} hearings
 * @property {number} postponements
 * @property {boolean} flaggedToHq
 * @property {{ result: string, date: string, sentence: string | null, fineAmount: number | null, fineReceiptNumber: string | null, recordedBy: string | null, confirmedBy: string | null, confirmedAt: string | null } | null} verdict
 * @property {{ reference: string, filedAt: string, result: string, newVerdict: string | null, decidedAt: string | null } | null} appeal
 * @property {{ at: string, by: string, reason: string } | null} withdrawal
 * @property {{ kind: "prepare" | "file" | "hearing", at: string } | null} next
 * @property {string} createdAt
 * @property {{ at: string, event: string, by: string, note: string | null }[]} history
 * @property {Record<"prepare" | "approve" | "file" | "recordHearing" | "recordVerdict" | "confirmVerdict" | "withdraw" | "recordAppeal" | "decideAppeal", boolean> | null} can
 */

/** @param {{ view: string, q?: string, page: number, pageSize?: number }} filters */
export const useCourtCases = (filters) =>
  useQuery({
    queryKey: ["court", "list", filters],
    queryFn: () =>
      /** @type {Promise<{ items: CourtCaseRecord[], total: number, page: number, pageSize: number }>} */ (
        api("/court-cases", { query: { pageSize: 25, ...filters } })
      ),
    placeholderData: keepPreviousData,
  });

/** @param {string | null} id */
export const useCourtCase = (id) =>
  useQuery({
    queryKey: ["court", "one", id],
    queryFn: () => /** @type {Promise<CourtCaseRecord>} */ (api(`/court-cases/${id}`)),
    enabled: Boolean(id),
  });

/** @param {string} id */
export function useCourtAction(id) {
  const queryClient = useQueryClient();
  return useMutation({
    /** @param {{ action: string, body?: object }} input */
    mutationFn: ({ action, body }) =>
      /** @type {Promise<CourtCaseRecord>} */ (
        api(`/court-cases/${id}/${action}`, { method: "POST", body: body ?? {} })
      ),
    onSuccess: () =>
      Promise.all(
        ["court", "cases", "notices"].map((k) => queryClient.invalidateQueries({ queryKey: [k] })),
      ),
  });
}

/** @param {string} id */
export const useBundle = (id) =>
  useQuery({
    queryKey: ["court", "bundle", id],
    queryFn: () =>
      /** @type {Promise<{ courtRef: string, courtCaseNumber: string | null, courtName: string | null, caseNumber: string, accused: string | null,
       *   charges: { code: string, name: string, legalReference: string }[], occurredAt: string | null, place: string | null,
       *   generatedAt: string, generatedBy: string,
       *   items: { no: number, id: string, kind: string, mime: string, size: number, sha256: string, originalName: string | null, source: string, receivedAt: string, capturedInApp: boolean | null }[] }>} */ (
        api(`/court-cases/${id}/bundle`)
      ),
    // Each generation is logged: don't refetch on focus.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

/**
 * @typedef {{
 *   id: string, name: string, code: string,
 *   type: "magistrate" | "district_magistrate" | "circuit_magistrate" | "children_magistrate",
 *   district: string | null, address: string | null, phone: string | null, isActive: boolean,
 * }} CourtRow
 */

export const useCourts = () =>
  useQuery({
    queryKey: ["courts"],
    queryFn: () => /** @type {Promise<{ items: CourtRow[] }>} */ (api("/courts")),
    staleTime: 5 * 60_000,
  });

export function useSaveCourt() {
  const queryClient = useQueryClient();
  return useMutation({
    /** @param {{ id?: string, body: object }} input */
    mutationFn: ({ id, body }) =>
      api(id ? `/courts/${id}` : "/courts", { method: id ? "PUT" : "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["courts"] }),
  });
}

export function useStationCourt() {
  const queryClient = useQueryClient();
  return useMutation({
    /** @param {{ stationId: string, courtId: string | null }} input */
    mutationFn: ({ stationId, courtId }) =>
      api(`/courts/stations/${stationId}`, { method: "PUT", body: { courtId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stations"] }),
  });
}
