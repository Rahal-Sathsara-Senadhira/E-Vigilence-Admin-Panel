// Cases — server state (docs/03).

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUpload } from "@/lib/api.js";

/**
 * @typedef {object} CaseRow
 * @property {string} id
 * @property {string} caseNumber
 * @property {"open" | "dispatched" | "accepted" | "investigating" | "recommended" | "decided" | "closed" | "returned"} status
 * @property {"P1" | "P2" | "P3"} priority
 * @property {{ id: string, name: string | null } | null} station
 * @property {string | null} vehicleNumber
 * @property {boolean} plateUnknown
 * @property {string[]} offenceCodes
 * @property {string | null} address
 * @property {string} occurredAt
 * @property {string} openedAt
 * @property {string | null} investigatingOfficer
 * @property {boolean} disputed
 * @property {number} returnCount
 * @property {string[]} warnings
 * @property {{ kind: "accept" | "assign_officer" | "start_work" | "recommend" | "decide", at: string } | null} deadline
 */

/**
 * @typedef {CaseRow & {
 *   facts: { offenceCodes: string[], vehicleNumber: string | null, plateUnknown: boolean, vehicleType: string | null, location: { lat: number, lng: number } | null, address: string | null, occurredAt: string },
 *   officer: { id: string, name: string, active: boolean } | null,
 *   workStartedAt: string | null,
 *   noEvidenceReason: string | null,
 *   openedBy: string | null,
 *   closedReason: string | null,
 *   reports: { id: string, reportNumber: string, status: string, channel: string, receivedAt: string, evidence: import("@/domain/evidence/EvidenceStrip.jsx").Item[] }[],
 *   investigation: Investigation,
 *   recommendation: Outcome | null,
 *   decision: (Outcome & { kind: "approved" | "changed", reason: string | null, level: "oic" | "division" | "hq", decidedBy: string, decidedAt: string }) | null,
 *   overriddenDecisions: { outcome: string, decidedBy: string, overriddenAt: string, overriddenBy: string, reason: string }[],
 *   mergedInto: { id: string, caseNumber: string } | null,
 *   readiness: Record<"penalty_notice" | "court" | "warning" | "no_further_action", string[]> | null,
 *   repeatOffender: { vehicle: number, person: number } | null,
 *   dispatches: { station: { id: string, name: string }, method: string, at: string, by: string, distanceKm: number | null, warnings: string[], reason: string | null, acceptBy: string | null, acceptedAt: string | null, acceptedBy: string | null, endedAt: string | null, endReason: string | null, endNote: string | null }[],
 *   notes: { at: string, by: string, side: "station" | "hq", text: string }[],
 *   timeline: { at: string, event: string, by: string, note: string | null }[],
 *   can: { dispatch: boolean, autoDispatch: boolean, accept: boolean, return: boolean, assignOfficer: boolean, addNote: "station" | "hq" | null, work: boolean, recommend: boolean, decide: boolean, override: boolean, reopen: boolean, merge: boolean },
 * }} CaseRecord
 */

/**
 * @typedef {{ id: string | null, name: string }} PersonOnCase  id null: the user may not see people
 * @typedef {{ outcome: "penalty_notice" | "court" | "warning" | "no_further_action", offenceCodes: string[], addressee: "owner" | "driver" | null,
 *   addresseePerson: PersonOnCase | null, driverUnknownReason: string | null, prosecutionSummary: string | null, nfaReason: string | null,
 *   justification: string, by: string, byRole: string, at: string, sentBack: { at: string, by: string, reason: string } | null }} Outcome
 * @typedef {object} Investigation
 * @property {{ id: string, plate: string, flags: string[] } | null} vehicle
 * @property {PersonOnCase | null} owner
 * @property {(PersonOnCase & { basis: string, note: string | null }) | null} driver
 * @property {{ plateReadable: boolean, vehicleMatches: boolean, timePlaceConsistent: boolean, noEditing: boolean, offenceVisible: boolean, note: string | null, by: string, at: string } | null} review
 * @property {(PersonOnCase & { role: string, takenAt: string, summary: string, evidenceId: string | null, by: string, at: string })[]} statements
 * @property {import("@/domain/evidence/EvidenceStrip.jsx").Item[]} evidence
 */

/** @param {{ view: string, q?: string, priority?: string, page: number, pageSize?: number }} filters */
export const useCases = (filters) =>
  useQuery({
    queryKey: ["cases", "list", filters],
    queryFn: () =>
      /** @type {Promise<{ items: CaseRow[], total: number, page: number, pageSize: number }>} */ (
        api("/cases", { query: { pageSize: 25, ...filters } })
      ),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

/** @param {string | null} id */
export const useCase = (id) =>
  useQuery({
    queryKey: ["cases", "one", id],
    queryFn: () => /** @type {Promise<CaseRecord>} */ (api(`/cases/${id}`)),
    enabled: Boolean(id),
  });

/** One action on a case; lists, the record and reports refresh after. @param {string} id */
export function useCaseAction(id) {
  const queryClient = useQueryClient();
  return useMutation({
    /** @param {{ action: string, body?: object, method?: "POST" | "PUT" }} input */
    mutationFn: ({ action, body, method = "POST" }) =>
      api(`/cases/${id}/${action}`, { method, body: body ?? {} }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cases"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]),
  });
}

/** Officers the case can be assigned to. @param {string} id @param {boolean} enabled */
export const useCaseOfficers = (id, enabled) =>
  useQuery({
    queryKey: ["cases", "officers", id],
    queryFn: () =>
      /** @type {Promise<{ items: { id: string, name: string, role: string, serviceNumber: string | null }[] }>} */ (
        api(`/cases/${id}/officers`)
      ),
    enabled,
  });

/** Stations HQ can choose, nearest first. @param {string} id @param {string} q @param {boolean} enabled */
export const useStationChoices = (id, q, enabled) =>
  useQuery({
    queryKey: ["cases", "stations", id, q],
    queryFn: () =>
      /** @type {Promise<{ items: { id: string, name: string, verified: boolean, distanceKm: number | null, current: boolean }[] }>} */ (
        api(`/cases/${id}/stations`, { query: q ? { q } : {} })
      ),
    enabled,
    placeholderData: keepPreviousData,
  });

/**
 * What the register knows about the case's plate (V2: a recent trace can be reused).
 * @param {string} id @param {boolean} enabled
 */
export const useVehicleCheck = (id, enabled) =>
  useQuery({
    queryKey: ["cases", "vehicle-check", id],
    queryFn: () =>
      /** @type {Promise<{ reusable: boolean, vehicle: { id: string, plate: string, type: string | null, make: string | null, model: string | null, colour: string | null, lastCheckedAt: string | null, ownerOnOffenceDate: { id: string, name: string } | null, flags: string[] } | null }>} */ (
        api(`/cases/${id}/vehicle-check`)
      ),
    enabled,
  });

/** Adds a file to the case's evidence. @param {string} id */
export function useUploadCaseEvidence(id) {
  const queryClient = useQueryClient();
  return useMutation({
    /** @param {File} file */
    mutationFn: (file) => apiUpload(`/cases/${id}/evidence`, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cases"] }),
  });
}
