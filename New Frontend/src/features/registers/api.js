// The person and vehicle registers — server state (docs/04).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api.js";

/**
 * @typedef {object} PersonRow
 * @property {string} id
 * @property {"individual" | "organisation"} type
 * @property {string} name
 * @property {string | null} nic             masked
 * @property {string | null} licenceNumber   masked
 * @property {string | null} businessRegNo   masked
 * @property {string | null} town
 * @property {boolean} hasAddress
 */

/**
 * @typedef {object} CaseLink
 * @property {string} caseId
 * @property {string} caseNumber
 * @property {string} status
 * @property {string} role
 * @property {string} occurredAt
 */

/**
 * @typedef {object} Person
 * @property {string} id
 * @property {"individual" | "organisation"} type
 * @property {string} name
 * @property {string | null} nic
 * @property {string | null} licenceNumber
 * @property {string | null} businessRegNo
 * @property {string | null} address
 * @property {string | null} phone
 * @property {string} createdBy
 * @property {string} createdAt
 * @property {{ at: string, by: string, fields: string[], reason: string }[]} changes
 * @property {CaseLink[]} cases
 * @property {{ id: string, plate: string, from: string | null, to: string | null }[]} vehicles
 * @property {{ edit: boolean }} can
 */

/**
 * @typedef {object} VehicleRecord
 * @property {string} id
 * @property {string} plate
 * @property {string | null} type
 * @property {string | null} make
 * @property {string | null} model
 * @property {string | null} colour
 * @property {string | null} lastCheckedAt
 * @property {{ type: string, note: string, reference: string | null, since: string | null, at: string, by: string }[]} flags
 * @property {{ personId: string | null, name: string | null, from: string, to: string | null, dmtReference: string | null, recordedBy: string }[]} ownership
 * @property {{ at: string | null, by: string, dmtReference: string, caseNumber: string | null }[]} checks
 * @property {CaseLink[]} cases
 */

/** @param {{ nic?: string, licence?: string, brn?: string, q?: string }} query */
export const searchPersons = (query) =>
  /** @type {Promise<{ items: PersonRow[] }>} */ (api("/persons/search", { query }));

export function useCreatePerson() {
  return useMutation({
    /** @param {object} body */
    mutationFn: (body) =>
      /** @type {Promise<Person>} */ (api("/persons", { method: "POST", body })),
  });
}

/** @param {string} id */
export const usePerson = (id) =>
  useQuery({
    queryKey: ["persons", id],
    queryFn: () => /** @type {Promise<Person>} */ (api(`/persons/${id}`)),
    // Every opening is logged: don't refetch behind the user's back.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

/** @param {string} id */
export function useUpdatePerson(id) {
  const queryClient = useQueryClient();
  return useMutation({
    /** @param {object} body */
    mutationFn: (body) =>
      /** @type {Promise<Person>} */ (api(`/persons/${id}`, { method: "PATCH", body })),
    onSuccess: (person) => queryClient.setQueryData(["persons", id], person),
  });
}

/** @param {string} id */
export const useVehicle = (id) =>
  useQuery({
    queryKey: ["vehicles", id],
    queryFn: () => /** @type {Promise<VehicleRecord>} */ (api(`/vehicles/${id}`)),
  });

/** @param {string} id */
export function useFlagVehicle(id) {
  const queryClient = useQueryClient();
  return useMutation({
    /** @param {object} body */
    mutationFn: (body) => api(`/vehicles/${id}/flags`, { method: "POST", body }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vehicles", id] }),
        queryClient.invalidateQueries({ queryKey: ["cases"] }),
      ]),
  });
}
