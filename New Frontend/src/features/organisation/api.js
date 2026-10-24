// Divisions and stations — backend /api/v1/divisions and /api/v1/stations.

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api.js";

/**
 * @typedef {object} Division
 * @property {string} id
 * @property {string} name
 * @property {string} code
 * @property {string | null} range
 * @property {string | null} province
 * @property {boolean} isActive
 * @property {number} stations
 * @property {number} verifiedStations
 */

/**
 * @typedef {object} StationRow
 * @property {string} id
 * @property {string} name
 * @property {string} code
 * @property {{ id: string, name: string } | null} division
 * @property {{ id: string, name: string } | null} suggestedDivision
 * @property {{ lat: number, lng: number } | null} location
 * @property {boolean} hasArea
 * @property {string | null} phone
 * @property {"verified" | "unverified" | "inactive"} status
 */

/**
 * @typedef {StationRow & {
 *   address: string | null,
 *   email: string | null,
 *   area: any,
 *   source: "osm" | "manual" | "seed",
 *   osmId: string | null,
 *   defaultCourtId: string | null,
 *   verifiedAt: string | null,
 *   verifiedBy: string | null,
 *   staff: { role: string, label: string, count: number }[],
 *   can: { edit: boolean, editContact: boolean, verify: boolean, editArea: boolean, deactivate: boolean, reactivate: boolean },
 * }} Station
 */

/** @param {{ q?: string, divisionId?: string, status?: string, page: number }} filters */
export const useStations = (filters) =>
  useQuery({
    queryKey: ["stations", "list", filters],
    queryFn: () =>
      /** @type {Promise<{ items: StationRow[], total: number, page: number, pageSize: number, unverified: number }>} */ (
        api("/stations", { query: { ...filters, pageSize: 25 } })
      ),
    placeholderData: keepPreviousData,
  });

/** @param {boolean} enabled */
export const useStationsMap = (enabled) =>
  useQuery({
    queryKey: ["stations", "map"],
    queryFn: () =>
      /** @type {Promise<import("@/domain/map/StationMap.jsx").MapStation[]>} */ (
        api("/stations/map")
      ),
    enabled,
  });

/** @param {string} id */
export const useStation = (id) =>
  useQuery({
    queryKey: ["stations", "one", id],
    queryFn: () => /** @type {Promise<Station>} */ (api(`/stations/${id}`)),
  });

export const useDivisions = () =>
  useQuery({
    queryKey: ["divisions"],
    queryFn: () => /** @type {Promise<Division[]>} */ (api("/divisions")),
    staleTime: 5 * 60_000,
  });

/**
 * A change to stations or divisions; refreshes every list, map and record.
 * @param {(body: any) => Promise<any>} call
 */
function useChange(call) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stations"] });
      void queryClient.invalidateQueries({ queryKey: ["divisions"] });
    },
  });
}

export const useCreateStation = () =>
  useChange((body) => api("/stations", { method: "POST", body }));

/** @param {string} id */
export const useStationChange = (id) =>
  useChange(
    /** @param {{ path?: string, method?: string, body?: any }} input */
    ({ path = "", method = "POST", body }) =>
      api(`/stations/${id}${path}`, { method, body: body ?? {} }),
  );

export const useSaveDivision = () =>
  useChange(
    /** @param {{ id?: string, body: any }} input */
    ({ id, body }) =>
      api(id ? `/divisions/${id}` : "/divisions", { method: id ? "PUT" : "POST", body }),
  );
