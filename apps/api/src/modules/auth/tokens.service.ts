// Short-lived signed tokens:
// - access token (15 min) — sent as a Bearer header, kept in memory by the web app;
// - challenge token (5 min) — carries a user between the password step and
//   the authenticator-code step; it grants nothing else.

import { Inject, Injectable } from "@nestjs/common";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import { ENV, type Env } from "../../config/env";

export const ACCESS_TOKEN_MINUTES = 15;
const CHALLENGE_MINUTES = 5;
const ISSUER = "e-vigilance";

export type ChallengePurpose = "mfa" | "mfa_setup";

@Injectable()
export class TokensService {
  private readonly secret: Uint8Array;

  constructor(@Inject(ENV) env: Env) {
    this.secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  }

  async signAccess(userId: string, sessionId: string) {
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_MINUTES * 60_000);
    const token = await new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience("ev-api")
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.secret);
    return { token, expiresAt };
  }

  async verifyAccess(token: string): Promise<{ userId: string; sessionId: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: ISSUER,
        audience: "ev-api",
        algorithms: ["HS256"],
      });
      if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      return null;
    }
  }

  signChallenge(userId: string, purpose: ChallengePurpose) {
    return new SignJWT({ purpose })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience("ev-mfa")
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${CHALLENGE_MINUTES}m`)
      .sign(this.secret);
  }

  async verifyChallenge(token: string, purpose: ChallengePurpose): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: ISSUER,
        audience: "ev-mfa",
        algorithms: ["HS256"],
      });
      return payload.purpose === purpose && typeof payload.sub === "string" ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
