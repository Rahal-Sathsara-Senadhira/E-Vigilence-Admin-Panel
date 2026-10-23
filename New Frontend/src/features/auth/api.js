// Sign-in calls — backend /api/v1/auth (docs/20 §9).

import { api } from "@/lib/api.js";

/**
 * @typedef {{ status: "signed_in", session: import("@/lib/api.js").SessionPayload }
 *   | { status: "mfa_required" | "password_change_required" | "mfa_setup_required", challenge: string }} StepResult
 */

/** @param {{ identifier: string, password: string }} body @returns {Promise<StepResult>} */
export const signIn = (body) => api("/auth/sign-in", { method: "POST", body });

/** @param {{ challenge: string, code?: string, recoveryCode?: string }} body @returns {Promise<StepResult>} */
export const verifyMfa = (body) => api("/auth/mfa/verify", { method: "POST", body });

/** @param {{ challenge: string, newPassword: string }} body @returns {Promise<StepResult>} */
export const setFirstPassword = (body) => api("/auth/password/first", { method: "POST", body });

/** @param {{ challenge: string }} body @returns {Promise<{ secret: string, otpauthUri: string }>} */
export const startMfaSetup = (body) => api("/auth/mfa/setup/start", { method: "POST", body });

/**
 * @param {{ challenge: string, code: string }} body
 * @returns {Promise<StepResult & { recoveryCodes: string[] }>}
 */
export const confirmMfaSetup = (body) => api("/auth/mfa/setup/confirm", { method: "POST", body });
