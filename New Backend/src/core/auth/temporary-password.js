// Temporary passwords for new accounts and resets (docs/20 §9): random,
// easy to read out or type (no 0/O, 1/l/I), shown once, and changed by the
// user at their next sign-in.

import { randomInt } from "node:crypto";

const LETTERS = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";

/** @param {string} alphabet @param {number} length */
const pick = (alphabet, length) =>
  Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");

/** e.g. "Kmtr-7xqp-Wd4h" — 14 characters, about 70 bits of randomness. */
export function temporaryPassword() {
  const group = () => pick(UPPER, 1) + pick(LETTERS + DIGITS, 3);
  return `${group()}-${group()}-${group()}`;
}
