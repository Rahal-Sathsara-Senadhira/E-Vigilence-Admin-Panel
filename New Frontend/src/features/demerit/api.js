// Demerit points — server state (docs/08).

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api.js";

/** @typedef {{ enabled: boolean, warnAt: number, referAt: number }} DemeritSettings */
/**
 * @typedef {object} PersonPoints
 * @property {boolean} enabled
 * @property {number} warnAt
 * @property {number} referAt
 * @property {number} total
 * @property {"none" | "approaching" | "threshold"} flag
 * @property {{ reference: string, referredOn: string, by: string } | null} referral
 * @property {{ id: string, points: number, offenceCodes: string[], caseId: string, caseNumber: string,
 *   source: { type: "notice" | "court_case", id: string, number: string }, offenceDate: string,
 *   expiresAt: string, expired: boolean, recordedAt: string, recordedBy: string, reason: string | null }[]} entries
 */

export const useDemeritSettings = () =>
  useQuery({
    queryKey: ["demerit", "settings"],
    queryFn: () =>
      /** @type {Promise<{ current: DemeritSettings, history: (DemeritSettings & { effectiveFrom: string, changedBy: string, reason: string })[] }>} */ (
        api("/demerit/settings")
      ),
  });

export function useSaveDemeritSettings() {
  const qc = useQueryClient();
  return useMutation({
    /** @param {DemeritSettings & { reason: string }} body */
    mutationFn: (body) => api("/demerit/settings", { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["demerit"] }),
  });
}

/** @param {string} personId */
export const usePersonPoints = (personId) =>
  useQuery({
    queryKey: ["demerit", "person", personId],
    queryFn: () => /** @type {Promise<PersonPoints>} */ (api(`/demerit/persons/${personId}`)),
  });

/** @param {string} personId */
export function useRecordReferral(personId) {
  const qc = useQueryClient();
  return useMutation({
    /** @param {{ reference: string, referredOn: string }} body */
    mutationFn: (body) => api(`/demerit/persons/${personId}/referral`, { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["demerit"] }),
  });
}

/** @param {{ flag: "approaching" | "threshold", page: number }} filters @param {boolean} enabled */
export const useStandings = (filters, enabled) =>
  useQuery({
    queryKey: ["demerit", "standings", filters],
    queryFn: () =>
      /** @type {Promise<{ items: { personId: string, name: string, licenceNumber: string | null, total: number, flag: string, flaggedAt: string | null, referred: boolean }[], total: number, page: number, pageSize: number }>} */ (
        api("/demerit/standings", { query: filters })
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
