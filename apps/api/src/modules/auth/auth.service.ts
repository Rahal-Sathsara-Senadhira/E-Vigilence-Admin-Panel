// Sign-in — docs/17-architecture-and-stack.md §6.
//
//   password ─► (authenticator code, or first-time set-up for HQ/dev) ─► session
//
// Five wrong passwords or codes lock the account for 15 minutes. Every
// sign-in, failure, lock and sign-out is in the audit log (docs/10 §4.3).

import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import {
  normalizeNic,
  requiresMfa,
  type ChangePasswordInput,
  type CurrentUser,
  type LoginInput,
  type LoginResult,
  type SessionPayload,
} from "@ev/shared";
import { generateSecret, generateURI, verify } from "otplib";
import type { Model } from "mongoose";
import { actorOf, type ActionContext, type AuthenticatedUser } from "../../common/context";
import { ApiError, badRequest, forbidden, unauthorized } from "../../common/errors";
import { AuditService } from "../audit/audit.service";
import { StationsService } from "../stations/stations.service";
import { StaffUser, type StaffUserDocument } from "../users/user.schema";
import { CryptoService } from "./crypto.service";
import { SessionsService } from "./sessions.service";
import { TokensService } from "./tokens.service";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
const MFA_ISSUER = "E-Vigilance (Sri Lanka Police)";

export interface IssuedSession {
  payload: SessionPayload;
  refreshToken: string;
  refreshExpiresAt: Date;
}

type LoginOutcome =
  { status: "signedIn"; issued: IssuedSession } | Exclude<LoginResult, { status: "signedIn" }>;

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(StaffUser.name) private readonly users: Model<StaffUser>,
    private readonly crypto: CryptoService,
    private readonly tokens: TokensService,
    private readonly sessions: SessionsService,
    private readonly stations: StationsService,
    private readonly audit: AuditService,
  ) {}

  // ── Password step ────────────────────────────────────────────────────

  async login(
    ctx: ActionContext,
    input: LoginInput,
    userAgent: string | null,
  ): Promise<LoginOutcome> {
    const user = await this.users
      .findOne({ staff: true, email: input.email })
      .select("+passwordHash");
    const failMessage = "Email or password is incorrect.";

    if (!user) {
      await this.crypto.verifyPassword(null, input.password);
      await this.audit.record(
        { actor: { kind: "anonymous", label: input.email }, source: ctx.source },
        { action: "auth.login_failed", summary: "Sign-in with an unknown email" },
      );
      throw unauthorized(failMessage, "invalid_credentials");
    }

    this.assertNotLocked(user);

    if (!(await this.crypto.verifyPassword(user.passwordHash, input.password))) {
      await this.registerFailure(user, ctx, "auth.login_failed", "Wrong password");
      throw unauthorized(failMessage, "invalid_credentials");
    }

    if (!user.active) {
      await this.audit.record(
        { actor: this.actorFor(user), source: ctx.source },
        {
          action: "auth.login_refused",
          summary: "Sign-in to a deactivated account",
          target: this.targetFor(user),
        },
      );
      throw forbidden("This account is deactivated. Contact your OIC or HQ.", "account_inactive");
    }

    if (user.mfa?.enabled) {
      return {
        status: "mfaRequired",
        challengeToken: await this.tokens.signChallenge(String(user._id), "mfa"),
      };
    }
    if (requiresMfa(user.role)) {
      return {
        status: "mfaSetupRequired",
        challengeToken: await this.tokens.signChallenge(String(user._id), "mfa_setup"),
      };
    }
    return { status: "signedIn", issued: await this.signIn(user, ctx, userAgent, "password") };
  }

  // ── Authenticator code ───────────────────────────────────────────────

  async verifyMfa(
    ctx: ActionContext,
    challengeToken: string,
    code: string,
    userAgent: string | null,
  ) {
    const user = await this.userFromChallenge(challengeToken, "mfa", "+mfa.secretEnc");
    this.assertNotLocked(user);
    if (!user.mfa?.secretEnc)
      throw badRequest("mfa_not_set_up", "Two-step sign-in is not set up for this account.");

    const step = await this.checkCode(user.mfa.secretEnc, code, user.mfa.lastTimeStep);
    if (step === null) {
      await this.registerFailure(user, ctx, "auth.mfa_failed", "Wrong authenticator code");
      throw unauthorized(
        "That code isn't right. Check your authenticator app and try again.",
        "invalid_code",
      );
    }
    user.mfa.lastTimeStep = step;
    return this.signIn(user, ctx, userAgent, "password + authenticator code");
  }

  /** First-time set-up: returns the secret to show as a QR code. Nothing is enabled yet. */
  async beginMfaSetup(challengeToken: string) {
    const user = await this.userFromChallenge(challengeToken, "mfa_setup");
    const secret = generateSecret();
    user.set("mfa.pendingSecretEnc", this.crypto.encrypt(secret));
    await user.save();
    return {
      secret,
      otpauthUri: generateURI({ issuer: MFA_ISSUER, label: user.email, secret }),
    };
  }

  /** The first correct code confirms the set-up and signs the user in. */
  async completeMfaSetup(
    ctx: ActionContext,
    challengeToken: string,
    code: string,
    userAgent: string | null,
  ) {
    const user = await this.userFromChallenge(challengeToken, "mfa_setup", "+mfa.pendingSecretEnc");
    this.assertNotLocked(user);
    const pending = user.mfa?.pendingSecretEnc;
    if (!pending) throw badRequest("mfa_setup_not_started", "Start the set-up again.");

    const step = await this.checkCode(pending, code, null);
    if (step === null) {
      await this.registerFailure(user, ctx, "auth.mfa_failed", "Wrong code during set-up");
      throw unauthorized(
        "That code isn't right. Make sure you scanned the latest QR code.",
        "invalid_code",
      );
    }

    user.mfa = {
      enabled: true,
      secretEnc: pending,
      pendingSecretEnc: null,
      lastTimeStep: step,
      enabledAt: new Date(),
    };
    await this.audit.record(
      { actor: this.actorFor(user), source: ctx.source },
      {
        action: "auth.mfa_enabled",
        summary: "Two-step sign-in set up",
        target: this.targetFor(user),
      },
    );
    return this.signIn(user, ctx, userAgent, "password + new authenticator");
  }

  // ── Session ──────────────────────────────────────────────────────────

  async refresh(ctx: ActionContext, refreshToken: string | undefined): Promise<IssuedSession> {
    if (!refreshToken) throw unauthorized("Please sign in.", "no_session");
    const result = await this.sessions.rotate(refreshToken);

    if (result.kind === "retry")
      throw new ApiError(409, "refresh_retry", "Session is being refreshed; try again.");
    if (result.kind === "reused") {
      await this.audit.record(
        { actor: { kind: "user", userId: result.userId }, source: ctx.source },
        {
          action: "auth.refresh_reuse",
          summary: "An old sign-in token was used again; the session was ended",
          target: { type: "session", id: result.sessionId },
        },
      );
      throw unauthorized(
        "Your session was ended for security. Please sign in again.",
        "session_revoked",
      );
    }
    if (result.kind === "invalid")
      throw unauthorized("Your session has ended. Please sign in again.", "session_expired");

    const user = await this.users.findOne({ _id: result.userId, staff: true });
    if (!user || !user.active) {
      await this.sessions.revoke(result.sessionId, "account_inactive");
      throw unauthorized("Your session has ended. Please sign in again.", "session_expired");
    }
    const access = await this.tokens.signAccess(String(user._id), result.sessionId);
    return {
      payload: {
        accessToken: access.token,
        expiresAt: access.expiresAt.toISOString(),
        user: await this.currentUser(user),
      },
      refreshToken: result.token,
      refreshExpiresAt: result.expiresAt,
    };
  }

  async logout(ctx: ActionContext, refreshToken: string | undefined) {
    if (!refreshToken) return;
    const ended = await this.sessions.revokeByToken(refreshToken, "signed_out");
    if (ended) {
      await this.audit.record(
        {
          actor: ctx.user ? ctx.actor : { kind: "user", userId: ended.userId },
          source: ctx.source,
        },
        {
          action: "auth.logout",
          summary: "Signed out",
          target: { type: "session", id: ended.sessionId },
        },
      );
    }
  }

  async me(userId: string): Promise<CurrentUser> {
    const user = await this.users.findOne({ _id: userId, staff: true });
    if (!user) throw unauthorized();
    return this.currentUser(user);
  }

  async changePassword(
    ctx: ActionContext,
    me: AuthenticatedUser,
    sessionId: string,
    input: ChangePasswordInput,
  ) {
    const user = await this.users.findOne({ _id: me.id, staff: true }).select("+passwordHash");
    if (!user) throw unauthorized();
    if (!(await this.crypto.verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new ApiError(400, "validation", "Check the highlighted fields.", {
        fields: { currentPassword: "Your current password is incorrect." },
      });
    }
    this.assertPasswordNotPersonal(input.newPassword, user);

    user.passwordHash = await this.crypto.hashPassword(input.newPassword);
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    await user.save();

    // End every other session; this one stays signed in.
    await this.sessions.revokeAllForUser(String(user._id), "password_changed");
    const current = await this.sessions.create(String(user._id), {
      ip: ctx.source.ip,
      userAgent: null,
    });
    await this.sessions.revoke(sessionId, "password_changed");

    await this.audit.record(ctx, {
      action: "auth.password_changed",
      summary: "Password changed",
      target: this.targetFor(user),
    });
    const access = await this.tokens.signAccess(String(user._id), current.sessionId);
    return {
      payload: {
        accessToken: access.token,
        expiresAt: access.expiresAt.toISOString(),
        user: await this.currentUser(user),
      },
      refreshToken: current.token,
      refreshExpiresAt: current.expiresAt,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private async signIn(
    user: StaffUserDocument,
    ctx: ActionContext,
    userAgent: string | null,
    method: string,
  ) {
    user.failedLogins = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    const s = await this.sessions.create(String(user._id), { ip: ctx.source.ip, userAgent });
    const access = await this.tokens.signAccess(String(user._id), s.sessionId);
    await this.audit.record(
      { actor: this.actorFor(user), source: ctx.source },
      {
        action: "auth.login",
        summary: `Signed in (${method})`,
        target: { type: "session", id: s.sessionId },
      },
    );
    return {
      payload: {
        accessToken: access.token,
        expiresAt: access.expiresAt.toISOString(),
        user: await this.currentUser(user),
      },
      refreshToken: s.token,
      refreshExpiresAt: s.expiresAt,
    } satisfies IssuedSession;
  }

  private async checkCode(
    sealedSecret: string,
    code: string,
    lastTimeStep: number | null,
  ): Promise<number | null> {
    const secret = this.crypto.decrypt(sealedSecret);
    const result = await verify({
      secret,
      token: code,
      epochTolerance: 30, // one step either side, for clock drift
      ...(lastTimeStep !== null ? { afterTimeStep: lastTimeStep } : {}),
    }).catch(() => null);
    if (!result?.valid) return null;
    return "timeStep" in result && typeof result.timeStep === "number" ? result.timeStep : 0;
  }

  private assertNotLocked(user: StaffUserDocument) {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
      throw new ApiError(
        423,
        "account_locked",
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      );
    }
  }

  private async registerFailure(
    user: StaffUserDocument,
    ctx: ActionContext,
    action: string,
    summary: string,
  ) {
    const failed = (user.failedLogins ?? 0) + 1;
    const lock = failed >= MAX_FAILED_ATTEMPTS;
    await this.users.updateOne(
      { _id: user._id },
      lock
        ? { $set: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } }
        : { $set: { failedLogins: failed } },
    );
    await this.audit.record(
      { actor: this.actorFor(user), source: ctx.source },
      {
        action,
        summary: lock ? `${summary}; account locked for ${LOCK_MINUTES} minutes` : summary,
        target: this.targetFor(user),
      },
    );
  }

  private async userFromChallenge(token: string, purpose: "mfa" | "mfa_setup", select?: string) {
    const userId = await this.tokens.verifyChallenge(token, purpose);
    if (!userId)
      throw unauthorized(
        "This sign-in step has expired. Please sign in again.",
        "challenge_expired",
      );
    const query = this.users.findOne({ _id: userId, staff: true, active: true });
    const user = await (select ? query.select(select) : query);
    if (!user)
      throw unauthorized(
        "This sign-in step has expired. Please sign in again.",
        "challenge_expired",
      );
    return user;
  }

  private assertPasswordNotPersonal(password: string, user: StaffUserDocument) {
    const lower = password.toLowerCase();
    const emailName = user.email.split("@")[0]?.toLowerCase() ?? "";
    const nic = normalizeNic(user.nic)?.toLowerCase() ?? "";
    if (
      (emailName.length >= 4 && lower.includes(emailName)) ||
      (nic && lower.includes(nic.slice(0, 9)))
    ) {
      throw new ApiError(400, "validation", "Check the highlighted fields.", {
        fields: { newPassword: "Don't use your email name or NIC in your password." },
      });
    }
  }

  private actorFor(user: StaffUserDocument) {
    return actorOf({
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      stationId: user.stationId ? String(user.stationId) : null,
      mustChangePassword: user.mustChangePassword,
    });
  }

  private targetFor(user: StaffUserDocument) {
    return { type: "user", id: String(user._id), label: user.email };
  }

  private async currentUser(user: StaffUserDocument): Promise<CurrentUser> {
    const stationId = user.stationId ? String(user.stationId) : null;
    return {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      stationId,
      stationName: await this.stations.nameOf(stationId),
      mfaEnabled: !!user.mfa?.enabled,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
