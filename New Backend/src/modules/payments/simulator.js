// The payment simulator — docs/07 §5, §11. It stands in for a real
// provider until one is connected: no real money and no card data (P3),
// never imitating any real provider (P4). It only chooses an outcome and
// confirms it the way a real gateway would — a payload signed with a
// shared secret (P5), checked by the receiving side before anything is
// marked paid.
//
// The provider interface: `reference()`, `sign()`, `verify()`, `refund()`.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A reference like SIM-7K2Q9XW4MZ: the prefix and 10 characters. @param {"SIM" | "SIMR"} prefix */
export function reference(prefix) {
  const bytes = randomBytes(10);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `${prefix}-${s}`;
}

/** The same JSON for the same content, whatever the key order. @param {Record<string, unknown>} payload */
export const canonical = (payload) =>
  JSON.stringify(
    Object.fromEntries(
      Object.keys(payload)
        .sort()
        .map((k) => [k, payload[k]]),
    ),
  );

/** @param {string} text @param {string} secret */
export const sign = (text, secret) => createHmac("sha256", secret).update(text).digest("hex");

/**
 * Whether the signature is the sender's, in constant time.
 * @param {string} text @param {string} signature @param {string} secret
 */
export function verify(text, signature, secret) {
  const expected = Buffer.from(sign(text, secret), "hex");
  const given = Buffer.from(String(signature), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** A refund: the simulator always succeeds and returns its reference. */
export const refund = () => ({ reference: reference("SIMR") });
