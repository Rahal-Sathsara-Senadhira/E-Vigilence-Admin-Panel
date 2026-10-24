// Citizen rewards — server state (docs/16).

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api.js";

/**
 * @typedef {object} RewardRow
 * @property {string} id
 * @property {string} userId
 * @property {string | null} reporterName
 * @property {"award" | "recovery"} kind
 * @property {string} reportId
 * @property {string} reportNumber
 * @property {string} caseId
 * @property {string} caseNumber
 * @property {string | null} plate
 * @property {number} basePoints
 * @property {number} share
 * @property {number} points
 * @property {keyof typeof import("./lib/labels.js").STATUS} status
 * @property {string | null} citizenMessage
 * @property {{ reason: string, by: string, at: string } | null} hold
 * @property {string | null} staffNote
 * @property {string | null} confirmedAt
 * @property {string | null} expiresAt
 * @property {boolean} recovered
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {{ at: string, event: string, by: string, note: string | null }[]} [history]
 */

/**
 * @typedef {object} RewardRules
 * @property {{ minor: number, moderate: number, severe: number }} severityPoints
 * @property {{ code: string, points: number }[]} offencePoints
 * @property {number} warningPoints
 * @property {number} rupeesPer100Points
 * @property {number} minPayoutPoints
 * @property {number} monthlyCapRupees
 * @property {number} dailyEarningReports
 */

const invalidate = (/** @type {import("@tanstack/react-query").QueryClient} */ qc) =>
  qc.invalidateQueries({ queryKey: ["rewards"] });

/** @param {{ view: string, q?: string, userId?: string, page: number }} filters */
export const useRewards = (filters) =>
  useQuery({
    queryKey: ["rewards", "list", filters],
    queryFn: () =>
      /** @type {Promise<{ items: RewardRow[], total: number, held: number, page: number, pageSize: number }>} */ (
        api("/rewards", { query: { pageSize: 25, ...filters } })
      ),
    placeholderData: keepPreviousData,
  });

/** @param {string} id */
export const useReward = (id) =>
  useQuery({
    queryKey: ["rewards", "one", id],
    queryFn: () => /** @type {Promise<RewardRow>} */ (api(`/rewards/${id}`)),
  });

/** @param {string} id */
export function useRewardAction(id) {
  const qc = useQueryClient();
  return useMutation({
    /** @param {{ action: "hold" | "release" | "reverse", reason: string }} input */
    mutationFn: ({ action, reason }) =>
      api(`/rewards/${id}/${action}`, { method: "POST", body: { reason } }),
    onSuccess: () => invalidate(qc),
  });
}

/**
 * @typedef {object} RewardAccount
 * @property {string} userId
 * @property {string | null} name
 * @property {"active" | "flagged" | "suspended"} status
 * @property {string | null} statusReason
 * @property {{ pending: number, available: number, paidOut: number, expiringSoon: number }} balance
 * @property {{ frozen: boolean, excluded: boolean, fabricatedCount: number, reason: string | null, changedAt: string | null, changedBy: string | null }} rewards
 * @property {RewardRow[]} entries
 */

/** @param {string} userId */
export const useRewardAccount = (userId) =>
  useQuery({
    queryKey: ["rewards", "account", userId],
    queryFn: () =>
      /** @type {Promise<RewardAccount>} */ (
        api(`/rewards/accounts/${encodeURIComponent(userId)}`)
      ),
  });

/** @param {string} userId */
export function useSetAccountRewards(userId) {
  const qc = useQueryClient();
  return useMutation({
    /** @param {{ frozen: boolean, excluded: boolean, reason: string }} body */
    mutationFn: (body) =>
      api(`/rewards/accounts/${encodeURIComponent(userId)}`, { method: "PUT", body }),
    onSuccess: () => invalidate(qc),
  });
}

export const useRewardRules = () =>
  useQuery({
    queryKey: ["rewards", "rules"],
    queryFn: () =>
      /** @type {Promise<{ current: RewardRules, history: { effectiveFrom: string, changedBy: string, reason: string }[] }>} */ (
        api("/rewards/rules")
      ),
  });

export function useSaveRewardRules() {
  const qc = useQueryClient();
  return useMutation({
    /** @param {RewardRules & { reason: string }} body */
    mutationFn: (body) => api("/rewards/rules", { method: "PUT", body }),
    onSuccess: () => invalidate(qc),
  });
}
