// Staff accounts — backend /api/v1/users (docs/20 §6).

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api.js";

/**
 * @typedef {object} Account
 * @property {string} id
 * @property {string} name
 * @property {string | null} email
 * @property {string | null} serviceNumber
 * @property {string | null} phone
 * @property {string} role
 * @property {string} roleLabel
 * @property {"national" | "division" | "station"} level
 * @property {{ id: string, name: string } | null} station
 * @property {{ id: string, name: string } | null} division
 * @property {"active" | "inactive" | "locked"} status
 * @property {string | null} lockedUntil
 * @property {boolean} mustChangePassword
 * @property {{ enabled: boolean, required: boolean }} mfa
 * @property {string | null} lastSignInAt
 * @property {string | null} createdAt
 * @property {{ edit: boolean, resetPassword: boolean, resetMfa: boolean, unlock: boolean, deactivate: boolean, reactivate: boolean }} can
 */

/**
 * @typedef {object} AccountOptions
 * @property {{ key: string, label: string, level: "national" | "division" | "station" }[]} roles
 * @property {{ id: string, name: string, divisionId: string | null }[]} stations
 * @property {{ id: string, name: string }[]} divisions
 */

/** @typedef {{ q?: string, role?: string, status?: string, page: number }} AccountFilters */

/** @param {AccountFilters} filters */
export const useAccounts = (filters) =>
  useQuery({
    queryKey: ["accounts", "list", filters],
    queryFn: () =>
      /** @type {Promise<{ items: Account[], total: number, page: number, pageSize: number }>} */ (
        api("/users", { query: { ...filters, pageSize: 25 } })
      ),
    placeholderData: keepPreviousData,
  });

/** @param {string} id */
export const useAccount = (id) =>
  useQuery({
    queryKey: ["accounts", "one", id],
    queryFn: () => /** @type {Promise<Account>} */ (api(`/users/${id}`)),
  });

/** @param {boolean} enabled */
export const useAccountOptions = (enabled) =>
  useQuery({
    queryKey: ["accounts", "options"],
    queryFn: () => /** @type {Promise<AccountOptions>} */ (api("/users/options")),
    enabled,
    staleTime: 5 * 60_000,
  });

/** Refreshes every list and record after a change. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["accounts"] });
}

export function useCreateAccount() {
  const refresh = useRefresh();
  return useMutation({
    /** @param {object} body */
    mutationFn: (body) =>
      /** @type {Promise<{ account: Account, temporaryPassword: string }>} */ (
        api("/users", { method: "POST", body })
      ),
    onSuccess: refresh,
  });
}

/** @param {string} id */
export function useUpdateAccount(id) {
  const refresh = useRefresh();
  return useMutation({
    /** @param {object} body */
    mutationFn: (body) =>
      /** @type {Promise<Account>} */ (api(`/users/${id}`, { method: "PUT", body })),
    onSuccess: refresh,
  });
}

/**
 * One account action: deactivate, reactivate, reset-password, reset-two-step, unlock.
 * @param {string} id
 */
export function useAccountAction(id) {
  const refresh = useRefresh();
  return useMutation({
    /** @param {{ action: string, body?: object }} input */
    mutationFn: ({ action, body }) =>
      /** @type {Promise<any>} */ (
        api(`/users/${id}/${action}`, { method: "POST", body: body ?? {} })
      ),
    onSuccess: refresh,
  });
}
