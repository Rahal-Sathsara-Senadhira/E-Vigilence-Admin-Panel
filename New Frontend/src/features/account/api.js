// "My account" calls — backend /api/v1/auth (docs/20 §9).

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api.js";

/**
 * @typedef {object} DeviceSession
 * @property {string} id
 * @property {boolean} current
 * @property {string | null} userAgent
 * @property {string | null} ip
 * @property {string} signedInAt
 * @property {string} lastActiveAt
 */

export const useSessions = () =>
  useQuery({
    queryKey: ["account", "sessions"],
    queryFn: () => /** @type {Promise<DeviceSession[]>} */ (api("/auth/sessions")),
  });

export const useChangePassword = () =>
  useMutation({
    /** @param {{ currentPassword: string, newPassword: string }} body */
    mutationFn: (body) => api("/auth/password", { method: "POST", body }),
  });

export const useSignOutEverywhere = () =>
  useMutation({
    mutationFn: () => api("/auth/sign-out-everywhere", { method: "POST" }),
  });
