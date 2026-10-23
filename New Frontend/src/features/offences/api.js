// The offence schedule — backend /api/v1/offences.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api.js";

/**
 * @typedef {object} Offence
 * @property {string} code
 * @property {number} version
 * @property {string} name
 * @property {string} legalReference
 * @property {"spot_fine" | "court"} outcome
 * @property {number | null} spotFine
 * @property {"minor" | "moderate" | "severe"} severity
 * @property {number | null} demeritPoints
 * @property {string[]} vehicleTypes
 * @property {boolean} citizenReportable
 * @property {string} publicName
 * @property {string} publicDescription
 * @property {boolean} active
 * @property {string} effectiveFrom
 * @property {string | null} effectiveTo
 * @property {string} changedBy
 * @property {string} reason
 * @property {string} source
 */

/** @param {{ q?: string, outcome?: string, severity?: string, status?: string }} filters */
export const useOffences = (filters) =>
  useQuery({
    queryKey: ["offences", "list", filters],
    queryFn: () => /** @type {Promise<Offence[]>} */ (api("/offences", { query: filters })),
  });

/** @param {string | null} code */
export const useOffence = (code) =>
  useQuery({
    queryKey: ["offences", "one", code],
    queryFn: () =>
      /** @type {Promise<Offence & { history: Offence[] }>} */ (api(`/offences/${code}`)),
    enabled: Boolean(code),
  });

export function useSaveOffence() {
  const queryClient = useQueryClient();
  return useMutation({
    /** @param {{ code?: string, body: object }} input */
    mutationFn: ({ code, body }) =>
      api(code ? `/offences/${code}/versions` : "/offences", { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["offences"] }),
  });
}

export const VEHICLE_LABELS = {
  motorcycle: "Motorcycle",
  three_wheeler: "Three-wheeler",
  car: "Car",
  van: "Van",
  bus: "Bus",
  lorry: "Lorry",
  tractor: "Tractor",
  other: "Other",
};
export const SEVERITY_LABELS = { minor: "Minor", moderate: "Moderate", severe: "Severe" };
