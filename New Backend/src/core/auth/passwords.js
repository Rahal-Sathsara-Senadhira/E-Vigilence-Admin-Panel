// Passwords — docs/20 §9: argon2id hashes; at least 12 characters; refused
// when common or built from the user's own name, email or service number.
// No forced periodic change.

import argon2 from "argon2";

export const MIN_LENGTH = 12;
export const MAX_LENGTH = 128;

// The most-used passwords and patterns that pass a length check.
const COMMON = new Set([
  "password1234",
  "password12345",
  "password123456",
  "123456789012",
  "1234567890123",
  "qwertyuiop12",
  "qwerty123456",
  "iloveyou1234",
  "welcome12345",
  "letmein12345",
  "admin1234567",
  "administrator",
  "changeme1234",
  "srilanka1234",
  "srilanka12345",
  "slpolice1234",
  "police123456",
  "evigilance123",
  "e-vigilance123",
  "abcdefghijkl",
  "aaaaaaaaaaaa",
  "111111111111",
  "000000000000",
]);

/**
 * Returns why `password` is not acceptable, or null when it is.
 * @param {string} password
 * @param {{ name?: string, email?: string, serviceNumber?: string | null }} [person]
 * @returns {string | null}
 */
export function passwordProblem(password, person = {}) {
  if (password.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`;
  if (password.length > MAX_LENGTH) return `Use at most ${MAX_LENGTH} characters.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) {
    return "This password is too common. Choose something harder to guess.";
  }
  const personal = [
    ...(person.name ?? "").toLowerCase().split(/\s+/),
    (person.email ?? "").toLowerCase().split("@")[0] ?? "",
    (person.serviceNumber ?? "").toLowerCase(),
  ].filter((part) => part.length >= 4);
  if (personal.some((part) => lower.includes(part))) {
    return "Don't use your name, email or service number in your password.";
  }
  return null;
}

/** @param {string} password */
export const hashPassword = (password) => argon2.hash(password, { type: argon2.argon2id });

// Verifying against this when the account doesn't exist makes a wrong email
// take as long as a wrong password, so timing doesn't reveal which accounts exist.
const dummyHash = hashPassword("not-a-real-account-password");

/**
 * @param {string | null | undefined} hash
 * @param {string} password
 */
export async function verifyPassword(hash, password) {
  if (!hash) {
    await argon2.verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return argon2.verify(hash, password).catch(() => false);
}
