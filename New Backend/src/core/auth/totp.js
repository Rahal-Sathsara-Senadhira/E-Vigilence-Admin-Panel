// Authenticator-app codes (TOTP, RFC 6238) — docs/20 §9.

import { generateSecret, generateURI, verify } from "otplib";

const ISSUER = "E-Vigilance (Sri Lanka Police)";

export const newTotpSecret = () => generateSecret();

/** The link encoded in the QR code. @param {string} secret @param {string} accountLabel */
export const totpUri = (secret, accountLabel) =>
  generateURI({ issuer: ISSUER, label: accountLabel, secret });

/**
 * Checks a 6-digit code, allowing one 30-second step of clock drift. A code
 * at or before `lastTimeStep` is refused, so the same code can't be used twice.
 * @param {string} secret
 * @param {string} code
 * @param {number | null} lastTimeStep
 * @returns {Promise<number | null>} the code's time step when valid
 */
export async function checkTotp(secret, code, lastTimeStep) {
  if (!/^\d{6}$/.test(code)) return null;
  const result = await verify({
    secret,
    token: code,
    epochTolerance: 30,
    ...(lastTimeStep !== null ? { afterTimeStep: lastTimeStep } : {}),
  }).catch(() => null);
  if (!result?.valid) return null;
  return "timeStep" in result && typeof result.timeStep === "number" ? result.timeStep : 0;
}
