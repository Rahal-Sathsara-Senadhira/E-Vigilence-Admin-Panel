// Dashboards — server state (docs/12). The filters live in the URL so a view
// can be shared and bookmarked (§5).

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api.js";

/**
 * @typedef {object} Figure
 * @property {string} key
 * @property {string} label
 * @property {number} value
 * @property {string} definition
 * @property {string | null} link
 * @property {string | null} sub
 * @property {number | null} previous
 * @property {boolean} money
 * @property {boolean} upIsBad
 */
/** @typedef {{ key: string, label: string, value: number, link?: string | null }} Bar */
/** @typedef {{ id: string, number: string, label: string, link: string | null, dueAt?: string | null, at?: string, escalated?: boolean, overdue?: boolean, priority?: string }} Item */

/**
 * @typedef {object} Dashboard
 * @property {"command" | "station" | "mine"} kind
 * @property {boolean} national
 * @property {{ key: string, from: string, to: string, previousFrom: string }} period
 * @property {string} generatedAt
 * @property {Figure[]} attention
 * @property {Figure[]} [throughput]
 * @property {{
 *   channels?: { definition: string, bucket: "day" | "month", series: { key: string, label: string }[], points: Record<string, any>[] },
 *   outcome?: { definition: string, parts: Bar[] },
 *   pipeline: { definition: string, bars: Bar[] },
 *   offences: { definition: string, bars: Bar[] },
 * }} [charts]
 * @property {{ definition: string, total: number, rows: { stationId: string, name: string, open: number, onTime: { accepted: number, of: number } | null, medianDays: number | null, paid: { paid: number, of: number } | null, overdue: number }[] }} [stations]
 * @property {{ definition: string, rows: { name: string, open: number, overdue: number }[] }} [officers]
 * @property {{ overdue?: { definition: string, items: Item[] }, returned?: { definition: string, items: Item[] } }} [lists]
 * @property {Item[]} [queue]
 */

/** @param {Record<string, string | undefined>} filters */
export const useDashboard = (filters) =>
  useQuery({
    queryKey: ["dashboard", filters],
    queryFn: () => /** @type {Promise<Dashboard>} */ (api("/dashboard", { query: filters })),
    placeholderData: keepPreviousData,
    // Figures are cached 60 s on the server (D12-4); keep the page as fresh.
    refetchInterval: 60_000,
  });

/** Stations of a division, for the station filter. @param {string | undefined} divisionId */
export const useDivisionStations = (divisionId) =>
  useQuery({
    queryKey: ["stations", "division", divisionId],
    queryFn: () =>
      /** @type {Promise<{ items: { id: string, name: string }[] }>} */ (
        api("/stations", { query: { divisionId, pageSize: 100, page: 1 } })
      ),
    enabled: Boolean(divisionId),
    staleTime: 5 * 60_000,
  });

export { useDivisions } from "@/features/organisation/index.js";
