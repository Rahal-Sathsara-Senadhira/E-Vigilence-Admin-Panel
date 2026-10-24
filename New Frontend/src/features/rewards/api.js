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

// ── Payouts (§6) ──

/**
 * @typedef {object} PayoutRow
 * @property {string} id
 * @property {string} userId
 * @property {"bank" | "wallet"} method
 * @property {string} accountMasked
 * @property {number} points
 * @property {number} amount
 * @property {boolean} capped
 * @property {"requested" | "batched" | "paid" | "failed" | "rejected"} status
 * @property {string | null} reason
 * @property {string | null} batchId
 * @property {string | null} reference
 * @property {string | null} requestedAt
 * @property {string | null} paidAt
 * @property {{ at: string | null, event: string, by: string, note: string | null }[]} history
 */

/**
 * @typedef {object} BatchRow
 * @property {string} id
 * @property {string} number
 * @property {"prepared" | "approved" | "cancelled"} status
 * @property {number} count
 * @property {number} points
 * @property {number} amount
 * @property {string | null} preparedBy
 * @property {string | null} preparedById
 * @property {string | null} preparedAt
 * @property {string | null} approvedBy
 * @property {string | null} approvedAt
 * @property {string | null} cancelledAt
 */

/** @param {{ view: string, page: number }} filters */
export const usePayouts = (filters) =>
  useQuery({
    queryKey: ["rewards", "payouts", filters],
    queryFn: () =>
      /** @type {Promise<{ items: PayoutRow[], total: number, waiting: { count: number, amount: number }, page: number, pageSize: number }>} */ (
        api("/rewards/payouts", { query: { pageSize: 25, ...filters } })
      ),
    placeholderData: keepPreviousData,
  });

/** @param {number} page */
export const useBatches = (page) =>
  useQuery({
    queryKey: ["rewards", "batches", page],
    queryFn: () =>
      /** @type {Promise<{ items: BatchRow[], total: number, page: number, pageSize: number }>} */ (
        api("/rewards/batches", { query: { page } })
      ),
    placeholderData: keepPreviousData,
  });

/** @param {string} id */
export const useBatch = (id) =>
  useQuery({
    queryKey: ["rewards", "batch", id],
    queryFn: () =>
      /** @type {Promise<BatchRow & { payouts: PayoutRow[] }>} */ (api(`/rewards/batches/${id}`)),
  });

export const useRewardTotals = () =>
  useQuery({
    queryKey: ["rewards", "totals"],
    queryFn: () =>
      /** @type {Promise<{ months: { month: string, earned: number, confirmed: number, reversed: number, paidPoints: number, paidAmount: number, payouts: number }[] }>} */ (
        api("/rewards/totals", { query: { months: 6 } })
      ),
  });

/** Prepare, approve or cancel a batch; retry or reject a payout. */
export function usePayoutAction() {
  const qc = useQueryClient();
  return useMutation({
    /** @param {{ path: string, body?: object }} input */
    mutationFn: ({ path, body }) =>
      /** @type {Promise<any>} */ (api(path, { method: "POST", body: body ?? {} })),
    onSuccess: () => invalidate(qc),
  });
}
