// Notifications and missed time limits — server state (docs/09).

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api.js";

/**
 * @typedef {object} NotificationRow
 * @property {string} id
 * @property {string} kind
 * @property {"info" | "warning" | "danger"} level
 * @property {string} title
 * @property {string | null} body
 * @property {string | null} link
 * @property {boolean} grouped
 * @property {boolean} read
 * @property {string} at
 */

/**
 * @typedef {object} OverdueRow
 * @property {string} id
 * @property {string} limitKey
 * @property {string} label
 * @property {{ type: "report" | "case" | "notice" | "court_case" | "payment", id: string, number: string }} item
 * @property {string | null} stationName
 * @property {string} link
 * @property {string} dueAt
 * @property {boolean} escalated
 * @property {number} hoursOver
 */

/** How often the bell asks for new notifications. */
const POLL_MS = 60_000;

/** The unread count for the bell — refreshed every minute while the panel is open. */
export const useUnreadCount = () =>
  useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => /** @type {Promise<{ unread: number }>} */ (api("/notifications/unread")),
    refetchInterval: POLL_MS,
  });

/** @param {{ unread?: boolean, page: number, pageSize?: number }} filters @param {{ enabled?: boolean }} [options] */
export const useNotifications = (filters, { enabled = true } = {}) =>
  useQuery({
    queryKey: ["notifications", "list", filters],
    queryFn: () =>
      /** @type {Promise<{ items: NotificationRow[], total: number, unread: number, page: number, pageSize: number }>} */ (
        api("/notifications", {
          query: { pageSize: 20, ...filters, unread: filters.unread ? "true" : undefined },
        })
      ),
    placeholderData: keepPreviousData,
    enabled,
  });

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    /** @param {string} id */
    mutationFn: (id) => api(`/notifications/${id}/read`, { method: "POST", body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST", body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

/** @param {{ limitKey?: string, page: number }} filters */
export const useOverdue = (filters) =>
  useQuery({
    queryKey: ["overdue", filters],
    queryFn: () =>
      /** @type {Promise<{ items: OverdueRow[], kinds: { limitKey: string, label: string, count: number, escalated: number }[], total: number, page: number, pageSize: number }>} */ (
        api("/overdue", { query: { pageSize: 25, ...filters } })
      ),
    placeholderData: keepPreviousData,
  });
