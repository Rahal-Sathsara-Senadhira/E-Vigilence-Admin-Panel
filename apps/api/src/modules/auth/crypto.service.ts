import { Inject, Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import { ENV, type Env } from "../../config/env";

// OWASP-recommended Argon2id settings (19 MiB, 2 passes).
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

// Used to spend the same time when an email doesn't exist, so response
// times don't reveal which emails have accounts.
let dummyHash: Promise<string> | null = null;

const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(@Inject(ENV) env: Env) {
    this.key = Buffer.from(env.MFA_ENCRYPTION_KEY, "base64");
  }

  hashPassword(password: string) {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verifyPassword(hash: string | null | undefined, password: string): Promise<boolean> {
    if (!hash) {
      dummyHash ??= argon2.hash("not-a-real-password", ARGON2_OPTIONS);
      await argon2.verify(await dummyHash, password).catch(() => false);
      return false;
    }
    return argon2.verify(hash, password).catch(() => false);
  }

  /** A readable one-time password, e.g. "Kp7m-Xw2r-Hn4t-Qe9b", for new accounts and resets. */
  temporaryPassword(): string {
    const group = () =>
      Array.from(
        { length: 4 },
        () => TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)],
      ).join("");
    return [group(), group(), group(), group()].join("-");
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString("base64url");
  }

  sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  /** AES-256-GCM; output is iv.tag.ciphertext in base64url. */
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
  }

  decrypt(sealed: string): string {
    const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !data) throw new Error("Malformed encrypted value");
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }
}
