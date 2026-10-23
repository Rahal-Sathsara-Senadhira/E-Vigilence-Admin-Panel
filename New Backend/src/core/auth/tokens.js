// Signed tokens (docs/19 §3):
// - access token: 5 minutes, proves who is calling; kept only in the panel's memory;
// - challenge token: 10 minutes, carries a half-finished sign-in to the next
//   step (two-step code, first password, two-step set-up).

import { SignJWT, jwtVerify } from "jose";
import { unauthorized } from "../errors.js";

const ISSUER = "e-vigilance";
export const ACCESS_TOKEN_SECONDS = 5 * 60;
const CHALLENGE_SECONDS = 10 * 60;

/** @typedef {"mfa" | "password_change" | "mfa_setup"} ChallengeStep */

/** @param {string} secret */
const keyOf = (secret) => new TextEncoder().encode(secret);

/**
 * @param {{ userId: string, sessionId: string, role: string }} claims
 * @param {string} secret
 */
export async function signAccessToken({ userId, sessionId, role }, secret) {
  return new SignJWT({ sid: sessionId, role, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_SECONDS}s`)
    .sign(keyOf(secret));
}

/**
 * @param {string} token @param {string} secret
 * @returns {Promise<{ userId: string, sessionId: string }>}
 */
export async function verifyAccessToken(token, secret) {
  try {
    const { payload } = await jwtVerify(token, keyOf(secret), { issuer: ISSUER });
    if (
      payload.typ !== "access" ||
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string"
    ) {
      throw new Error("not an access token");
    }
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    throw unauthorized("token_invalid", "Your sign-in has expired. Please sign in again.");
  }
}

/**
 * @param {{ userId: string, step: ChallengeStep, authVersion: number, mfaPassed: boolean }} claims
 * @param {string} secret
 */
export async function signChallenge({ userId, step, authVersion, mfaPassed }, secret) {
  return new SignJWT({ step, av: authVersion, mp: mfaPassed, typ: "challenge" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_SECONDS}s`)
    .sign(keyOf(secret));
}

/**
 * @param {string} token @param {ChallengeStep} step @param {string} secret
 * @returns {Promise<{ userId: string, authVersion: number, mfaPassed: boolean }>}
 */
export async function verifyChallenge(token, step, secret) {
  try {
    const { payload } = await jwtVerify(token, keyOf(secret), { issuer: ISSUER });
    if (payload.typ !== "challenge" || payload.step !== step || typeof payload.sub !== "string") {
      throw new Error("wrong challenge");
    }
    return { userId: payload.sub, authVersion: Number(payload.av), mfaPassed: payload.mp === true };
  } catch {
    throw unauthorized(
      "challenge_expired",
      "This sign-in took too long or is no longer valid. Please sign in again.",
    );
  }
}
