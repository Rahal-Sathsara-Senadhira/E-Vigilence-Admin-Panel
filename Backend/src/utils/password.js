import crypto from "crypto";

/**
 * Hash format: scrypt$<saltHex>$<hashHex>
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 3) return false;

  const [algo, saltHex, hashHex] = parts;
  if (algo !== "scrypt") return false;

  const salt = Buffer.from(saltHex, "hex");
  const hash = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, "hex"));
}