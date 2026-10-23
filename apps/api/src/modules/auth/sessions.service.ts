// Refresh-token sessions with rotation and reuse detection (docs/17 §6).
//
// Every refresh replaces the token. If an old token is presented again after
// the grace period, someone copied it: the whole session is ended.

import { Inject, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Types, type ClientSession, type Model } from "mongoose";
import { ENV, type Env } from "../../config/env";
import { CryptoService } from "./crypto.service";
import { StaffSession } from "./session.schema";

/** Two tabs refreshing at the same moment both send the old cookie; the second is told to retry. */
const ROTATION_GRACE_MS = 10_000;

export type RotateResult =
  | { kind: "rotated"; sessionId: string; userId: string; token: string; expiresAt: Date }
  | { kind: "retry" }
  | { kind: "reused"; sessionId: string; userId: string }
  | { kind: "invalid" };

@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(StaffSession.name) private readonly sessions: Model<StaffSession>,
    private readonly crypto: CryptoService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async create(userId: string, meta: { ip: string | null; userAgent: string | null }) {
    const token = this.crypto.randomToken();
    const expiresAt = new Date(Date.now() + this.env.SESSION_HOURS * 60 * 60 * 1000);
    const [doc] = await this.sessions.create([
      {
        userId: new Types.ObjectId(userId),
        tokenHash: this.crypto.sha256(token),
        expiresAt,
        lastUsedAt: new Date(),
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    ]);
    return { sessionId: String(doc!._id), token, expiresAt };
  }

  async rotate(presented: string): Promise<RotateResult> {
    const hash = this.crypto.sha256(presented);
    const now = new Date();
    const token = this.crypto.randomToken();

    // Atomic: only one request can rotate a given token.
    const current = await this.sessions.findOneAndUpdate(
      { tokenHash: hash, revokedAt: null, expiresAt: { $gt: now } },
      {
        $set: {
          tokenHash: this.crypto.sha256(token),
          prevTokenHash: hash,
          rotatedAt: now,
          lastUsedAt: now,
        },
      },
      { new: true },
    );
    if (current) {
      return {
        kind: "rotated",
        sessionId: String(current._id),
        userId: String(current.userId),
        token,
        expiresAt: current.expiresAt,
      };
    }

    const previous = await this.sessions.findOne({ prevTokenHash: hash });
    if (!previous) return { kind: "invalid" };
    if (previous.revokedAt || previous.expiresAt <= now) return { kind: "invalid" };
    if (previous.rotatedAt && now.getTime() - previous.rotatedAt.getTime() < ROTATION_GRACE_MS) {
      return { kind: "retry" };
    }
    await this.revoke(String(previous._id), "refresh_token_reused");
    return { kind: "reused", sessionId: String(previous._id), userId: String(previous.userId) };
  }

  async findActive(sessionId: string) {
    if (!Types.ObjectId.isValid(sessionId)) return null;
    return this.sessions
      .findOne({ _id: sessionId, revokedAt: null, expiresAt: { $gt: new Date() } })
      .lean();
  }

  async revoke(sessionId: string, reason: string) {
    await this.sessions.updateOne(
      { _id: sessionId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: reason } },
    );
  }

  async revokeByToken(presented: string, reason: string) {
    const s = await this.sessions.findOneAndUpdate(
      { tokenHash: this.crypto.sha256(presented), revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: reason } },
    );
    return s ? { sessionId: String(s._id), userId: String(s.userId) } : null;
  }

  /** Account changes end every session of that user (docs/17 §6 "Sessions"). */
  async revokeAllForUser(userId: string, reason: string, session?: ClientSession) {
    const res = await this.sessions.updateMany(
      { userId: new Types.ObjectId(userId), revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: reason } },
      { session },
    );
    return res.modifiedCount;
  }
}
