// Encryption for secrets stored in the database (two-step sign-in keys), and
// hashing for one-time values (refresh tokens, recovery codes).

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM. The result is "iv.tag.ciphertext" in base64url.
 * @param {string} plain @param {string} hexKey 64 hex characters
 */
export function encrypt(plain, hexKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(hexKey, "hex"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

/** @param {string} sealed @param {string} hexKey */
export function decrypt(sealed, hexKey) {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !data) throw new Error("Malformed encrypted value.");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(hexKey, "hex"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** SHA-256 in hex — for random, high-entropy values only (not passwords). @param {string} value */
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/** A random URL-safe token. @param {number} [bytes] */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

// No 0/O or 1/I/L, so codes read aloud or copied by hand aren't mistaken.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** A recovery code like "7KQ4-M2XD". */
export function recoveryCode() {
  const bytes = randomBytes(8);
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** Normalises what a person typed: upper case, no spaces, dash in the middle. @param {string} code */
export function normaliseRecoveryCode(code) {
  const raw = code.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}
