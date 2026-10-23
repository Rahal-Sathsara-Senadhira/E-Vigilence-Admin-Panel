// Signing in — docs/20 §9.
//
// A sign-in moves through steps, carried between requests by a short-lived
// challenge token:
//
//   password ─► two-step code (if set up) ─► new password (first sign-in or
//   after a reset) ─► set up two-step sign-in (if the role requires it) ─► signed in
//
// The code comes before the new password, so a stolen temporary password is
// not enough to take over an account that has two-step sign-in.

import mongoose from "mongoose";
import { roleInfo, SESSION_MAX_HOURS } from "#src/core/access/roles.js";
import { recordAudit } from "#src/core/audit/audit.js";
import { hashPassword, passwordProblem, verifyPassword } from "#src/core/auth/passwords.js";
import {
  decrypt,
  encrypt,
  normaliseRecoveryCode,
  randomToken,
  recoveryCode,
  sha256,
} from "#src/core/auth/secrets.js";
import {
  ACCESS_TOKEN_SECONDS,
  signAccessToken,
  signChallenge,
  verifyChallenge,
} from "#src/core/auth/tokens.js";
import { checkTotp, newTotpSecret, totpUri } from "#src/core/auth/totp.js";
import { inTransaction } from "#src/core/db/connection.js";
import { AppError, conflict, locked, unauthorized, validationError } from "#src/core/errors.js";
import { Division, Station } from "../organisation/organisation.model.js";
import { User } from "../users/user.model.js";
import { currentUserView } from "./auth.views.js";
import { Session } from "./session.model.js";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
const RECOVERY_CODE_COUNT = 10;
/** Two tabs refreshing at the same moment: the second one retries instead of being signed out. */
const REFRESH_RACE_MS = 30_000;

const WRONG_CREDENTIALS = "The email or service number, or the password, is not correct.";

/** @typedef {import("../users/user.model.js").UserDocument} UserDocument */
/** @typedef {{ ip: string | null, userAgent: string | null }} RequestContext */

/**
 * @typedef {{ status: "signed_in", session: SessionPayload, refreshCookie: string }
 *   | { status: "mfa_required" | "password_change_required" | "mfa_setup_required", challenge: string }} SignInResult
 */

/**
 * @typedef {object} SessionPayload
 * @property {string} accessToken
 * @property {string} accessTokenExpiresAt
 * @property {string} sessionExpiresAt
 * @property {import("./auth.views.js").CurrentUserView} user
 */

/** @param {UserDocument} user */
const staffActor = (user) => ({
  kind: /** @type {const} */ ("staff"),
  id: user._id,
  name: user.name,
  role: user.role,
});

/** @param {UserDocument} user */
const accountLabel = (user) => user.email ?? user.serviceNumber ?? user.name;

/** Email if it contains "@", otherwise a service number. @param {string} identifier */
function findByIdentifier(identifier) {
  const value = identifier.trim();
  return value.includes("@")
    ? User.findOne({ email: value.toLowerCase() })
    : User.findOne({ serviceNumber: value.toUpperCase().replace(/\s+/g, "") });
}

/** @param {{ jwtSecret: string, mfaKey: string }} config */
export function createAuthService({ jwtSecret, mfaKey }) {
  // ── Helpers ─────────────────────────────────────────────────────────

  /** @param {UserDocument} user */
  async function placeOf(user) {
    const [station, division] = await Promise.all([
      user.stationId ? Station.findById(user.stationId, { name: 1, isActive: 1 }).lean() : null,
      user.divisionId ? Division.findById(user.divisionId, { name: 1, isActive: 1 }).lean() : null,
    ]);
    return { station, division };
  }

  /** Refuses accounts that can't be used right now. @param {UserDocument} user */
  async function assertUsable(user) {
    if (!user.isActive) {
      throw new AppError(
        403,
        "account_inactive",
        "This account is not active. Contact your account manager.",
      );
    }
    const level = roleInfo(/** @type {any} */ (user.role)).level;
    const { station, division } = await placeOf(user);
    if (level === "station" && !station?.isActive) {
      throw new AppError(
        403,
        "station_inactive",
        "Your station is not active in the system. Contact HQ.",
      );
    }
    if (level === "division" && !division?.isActive) {
      throw new AppError(
        403,
        "division_inactive",
        "Your division is not active in the system. Contact HQ.",
      );
    }
  }

  /** @param {UserDocument} user */
  function assertNotLocked(user) {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
      throw locked(
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or ask your account manager to unlock your account.`,
      );
    }
  }

  /**
   * Counts a wrong password or code; locks the account at the limit.
   * @param {UserDocument} user @param {string} what @param {RequestContext} ctx
   */
  async function recordFailure(user, what, ctx) {
    await inTransaction(async (session) => {
      const fresh = await User.findById(user._id, null, { session });
      if (!fresh) return;
      fresh.failedAttempts += 1;
      const lockNow = fresh.failedAttempts >= MAX_FAILED_ATTEMPTS;
      if (lockNow) {
        fresh.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
        fresh.failedAttempts = 0;
      }
      await fresh.save({ session });
      await recordAudit(
        {
          actor: staffActor(fresh),
          places: [fresh],
          action: lockNow ? "auth.locked" : "auth.sign_in_failed",
          summary: lockNow
            ? `Account locked for ${LOCK_MINUTES} minutes after ${MAX_FAILED_ATTEMPTS} failed attempts`
            : `Wrong ${what}`,
          target: { type: "user", id: String(fresh._id), label: accountLabel(fresh) },
          source: ctx,
        },
        session,
      );
    });
  }

  /**
   * Decides the next step after a step succeeds.
   * @param {UserDocument} user @param {boolean} mfaPassed @param {RequestContext} ctx
   * @returns {Promise<SignInResult>}
   */
  async function nextStep(user, mfaPassed, ctx) {
    /** @param {import("#src/core/auth/tokens.js").ChallengeStep} step */
    const challenge = (step) =>
      signChallenge(
        { userId: String(user._id), step, authVersion: user.authVersion, mfaPassed },
        jwtSecret,
      );
    if (user.mfa?.enabled && !mfaPassed) {
      return { status: "mfa_required", challenge: await challenge("mfa") };
    }
    if (user.mustChangePassword) {
      return { status: "password_change_required", challenge: await challenge("password_change") };
    }
    if (roleInfo(/** @type {any} */ (user.role)).mfaRequired && !user.mfa?.enabled) {
      return { status: "mfa_setup_required", challenge: await challenge("mfa_setup") };
    }
    return startSession(user, ctx);
  }

  /** @param {UserDocument} user @param {RequestContext} ctx @returns {Promise<SignInResult>} */
  async function startSession(user, ctx) {
    const secret = randomToken();
    const now = new Date();
    const role = /** @type {any} */ (user.role);
    const session = await inTransaction(async (txn) => {
      const [created] = await Session.create(
        [
          {
            userId: user._id,
            secretHash: sha256(secret),
            rotatedAt: now,
            lastActiveAt: now,
            expiresAt: new Date(now.getTime() + SESSION_MAX_HOURS * 3_600_000),
            idleMinutes: roleInfo(role).idleMinutes,
            userAgent: ctx.userAgent,
            ip: ctx.ip,
          },
        ],
        { session: txn },
      );
      await User.updateOne(
        { _id: user._id },
        { $set: { lastSignInAt: now, failedAttempts: 0, lockedUntil: null } },
        { session: txn },
      );
      await recordAudit(
        {
          actor: staffActor(user),
          places: [user],
          action: "auth.signed_in",
          summary: "Signed in",
          target: { type: "user", id: String(user._id), label: accountLabel(user) },
          source: ctx,
        },
        txn,
      );
      return /** @type {NonNullable<typeof created>} */ (created);
    });
    return {
      status: "signed_in",
      session: await sessionPayload(user, session),
      refreshCookie: `${session._id}.${secret}`,
    };
  }

  /**
   * @param {UserDocument} user
   * @param {{ _id: any, expiresAt: Date }} session
   * @returns {Promise<SessionPayload>}
   */
  async function sessionPayload(user, session) {
    const accessToken = await signAccessToken(
      { userId: String(user._id), sessionId: String(session._id), role: user.role },
      jwtSecret,
    );
    return {
      accessToken,
      accessTokenExpiresAt: new Date(Date.now() + ACCESS_TOKEN_SECONDS * 1000).toISOString(),
      sessionExpiresAt: session.expiresAt.toISOString(),
      user: currentUserView(user, await placeOf(user)),
    };
  }

  /**
   * Loads the user a challenge belongs to and checks it is still valid.
   * @param {string} token @param {import("#src/core/auth/tokens.js").ChallengeStep} step
   */
  async function userFromChallenge(token, step) {
    const claims = await verifyChallenge(token, step, jwtSecret);
    const user = await User.findById(claims.userId);
    if (!user || user.authVersion !== claims.authVersion) {
      throw unauthorized(
        "challenge_expired",
        "This sign-in is no longer valid. Please sign in again.",
      );
    }
    assertNotLocked(user);
    await assertUsable(user);
    return { user, mfaPassed: claims.mfaPassed };
  }

  // ── Steps ───────────────────────────────────────────────────────────

  /**
   * Step 1: email or service number, and password.
   * @param {{ identifier: string, password: string }} input @param {RequestContext} ctx
   * @returns {Promise<SignInResult>}
   */
  async function signIn({ identifier, password }, ctx) {
    const user = await findByIdentifier(identifier);
    if (user) assertNotLocked(user);
    const ok = await verifyPassword(user?.passwordHash, password);
    if (!user || !ok) {
      if (user) {
        await recordFailure(user, "password", ctx);
      } else {
        await recordAudit({
          actor: { kind: "anonymous", name: identifier.slice(0, 160) },
          action: "auth.sign_in_failed",
          summary: "Sign-in attempt for an unknown account",
          source: ctx,
        });
      }
      throw unauthorized("invalid_credentials", WRONG_CREDENTIALS);
    }
    await assertUsable(user);
    return nextStep(user, false, ctx);
  }

  /**
   * Step 2: the code from the authenticator app, or a recovery code.
   * @param {{ challenge: string, code?: string, recoveryCode?: string }} input @param {RequestContext} ctx
   * @returns {Promise<SignInResult>}
   */
  async function verifyMfa({ challenge, code, recoveryCode: recovery }, ctx) {
    const { user } = await userFromChallenge(challenge, "mfa");
    if (!user.mfa?.enabled || !user.mfa.secret) return nextStep(user, true, ctx);

    if (recovery) {
      const hash = sha256(normaliseRecoveryCode(recovery));
      const used = await User.findOneAndUpdate(
        { _id: user._id, "mfa.recoveryCodeHashes": hash },
        { $pull: { "mfa.recoveryCodeHashes": hash } },
        { returnDocument: "after" },
      );
      if (!used) {
        await recordFailure(user, "recovery code", ctx);
        throw unauthorized(
          "invalid_code",
          "That recovery code is not correct or has already been used.",
        );
      }
      await recordAudit({
        actor: staffActor(used),
        places: [used],
        action: "auth.recovery_code_used",
        summary: `Recovery code used; ${used.mfa?.recoveryCodeHashes.length ?? 0} left`,
        target: { type: "user", id: String(used._id), label: accountLabel(used) },
        source: ctx,
      });
      return nextStep(used, true, ctx);
    }

    const step = await checkTotp(
      decrypt(user.mfa.secret, mfaKey),
      code ?? "",
      user.mfa.lastTimeStep ?? null,
    );
    if (step === null) {
      await recordFailure(user, "two-step code", ctx);
      throw unauthorized(
        "invalid_code",
        "That code is not correct. Wait for a new code and try again.",
      );
    }
    // Conditional update: two requests with the same code can't both pass.
    const updated = await User.findOneAndUpdate(
      {
        _id: user._id,
        $or: [{ "mfa.lastTimeStep": null }, { "mfa.lastTimeStep": { $lt: step } }],
      },
      { $set: { "mfa.lastTimeStep": step } },
      { returnDocument: "after" },
    );
    if (!updated)
      throw unauthorized("invalid_code", "That code has already been used. Wait for a new code.");
    return nextStep(updated, true, ctx);
  }

  /**
   * Step 3: the user's own password, on first sign-in or after a reset.
   * @param {{ challenge: string, newPassword: string }} input @param {RequestContext} ctx
   * @returns {Promise<SignInResult>}
   */
  async function setFirstPassword({ challenge, newPassword }, ctx) {
    const { user, mfaPassed } = await userFromChallenge(challenge, "password_change");
    await assertNewPassword(user, newPassword);
    const updated = await inTransaction(async (session) => {
      const fresh = await User.findById(user._id, null, { session });
      if (!fresh) throw unauthorized("challenge_expired", "Please sign in again.");
      fresh.passwordHash = await hashPassword(newPassword);
      fresh.mustChangePassword = false;
      fresh.passwordChangedAt = new Date();
      fresh.authVersion += 1;
      await fresh.save({ session });
      await recordAudit(
        {
          actor: staffActor(fresh),
          places: [fresh],
          action: "auth.password_set",
          summary: "Set their own password",
          target: { type: "user", id: String(fresh._id), label: accountLabel(fresh) },
          source: ctx,
        },
        session,
      );
      return fresh;
    });
    return nextStep(updated, mfaPassed, ctx);
  }

  /**
   * Step 4a: a new authenticator key, shown as a QR code.
   * @param {{ challenge: string }} input
   */
  async function startMfaSetup({ challenge }) {
    const { user } = await userFromChallenge(challenge, "mfa_setup");
    const secret = newTotpSecret();
    await User.updateOne(
      { _id: user._id },
      { $set: { "mfa.pendingSecret": encrypt(secret, mfaKey) } },
    );
    return { secret, otpauthUri: totpUri(secret, accountLabel(user)) };
  }

  /**
   * Step 4b: the first code proves the app is set up; recovery codes are
   * shown once, then the user is signed in.
   * @param {{ challenge: string, code: string }} input @param {RequestContext} ctx
   */
  async function confirmMfaSetup({ challenge, code }, ctx) {
    const { user } = await userFromChallenge(challenge, "mfa_setup");
    if (!user.mfa?.pendingSecret) {
      throw conflict("setup_not_started", "Start the set-up again to get a new QR code.");
    }
    const secret = decrypt(user.mfa.pendingSecret, mfaKey);
    const step = await checkTotp(secret, code, null);
    if (step === null) {
      await recordFailure(user, "two-step code during set-up", ctx);
      throw validationError({
        code: "That code is not correct. Check the time on your phone and try the next code.",
      });
    }
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, recoveryCode);
    const updated = await inTransaction(async (session) => {
      const fresh = await User.findById(user._id, null, { session });
      if (!fresh || !fresh.mfa) throw unauthorized("challenge_expired", "Please sign in again.");
      fresh.mfa.enabled = true;
      fresh.mfa.secret = fresh.mfa.pendingSecret;
      fresh.mfa.pendingSecret = null;
      fresh.mfa.lastTimeStep = step;
      fresh.mfa.recoveryCodeHashes = codes.map((c) => sha256(c));
      fresh.mfa.enabledAt = new Date();
      fresh.authVersion += 1;
      await fresh.save({ session });
      await recordAudit(
        {
          actor: staffActor(fresh),
          places: [fresh],
          action: "auth.mfa_enabled",
          summary: "Set up two-step sign-in",
          target: { type: "user", id: String(fresh._id), label: accountLabel(fresh) },
          source: ctx,
        },
        session,
      );
      return fresh;
    });
    const result = await nextStep(updated, true, ctx);
    return { recoveryCodes: codes, result };
  }

  // ── Sessions ────────────────────────────────────────────────────────

  /**
   * Swaps a refresh cookie for a new access token and a new cookie.
   * @param {string | undefined} cookie @param {RequestContext} ctx
   * @returns {Promise<{ session: SessionPayload, refreshCookie: string }>}
   */
  async function refresh(cookie, ctx) {
    const ended = (
      /** @type {string} */ message = "Your session has ended. Please sign in again.",
    ) => unauthorized("session_ended", message);
    const [id, secret] = (cookie ?? "").split(".");
    if (!id || !secret || !mongoose.isValidObjectId(id)) throw ended();

    const session = await Session.findById(id);
    if (!session || session.revokedAt) throw ended();
    const now = Date.now();
    /** @param {"idle" | "expired" | "reuse_detected" | "account_changed"} reason */
    const revoke = async (reason) => {
      session.revokedAt = new Date();
      session.revokedReason = reason;
      await session.save();
    };

    if (session.expiresAt.getTime() <= now) {
      await revoke("expired");
      throw ended("You were signed out at the end of your 12-hour session. Please sign in again.");
    }
    if (now - session.lastActiveAt.getTime() > session.idleMinutes * 60_000) {
      await revoke("idle");
      throw ended(`You were signed out after ${session.idleMinutes} minutes without activity.`);
    }

    const hash = sha256(secret);
    if (hash !== session.secretHash) {
      if (
        hash === session.previousSecretHash &&
        now - session.rotatedAt.getTime() < REFRESH_RACE_MS
      ) {
        throw conflict("refresh_race", "Another tab refreshed the session. Try again.");
      }
      await revoke("reuse_detected");
      await recordAudit({
        actor: { kind: "system", name: "Session check" },
        action: "auth.session_reuse",
        summary:
          "An old session token was used again; the session was ended to protect the account",
        target: { type: "user", id: String(session.userId) },
        source: ctx,
      });
      throw ended();
    }

    const user = await User.findById(session.userId);
    if (!user || !user.isActive) {
      await revoke("account_changed");
      throw ended();
    }

    const next = randomToken();
    session.previousSecretHash = session.secretHash;
    session.secretHash = sha256(next);
    session.rotatedAt = new Date(now);
    session.lastActiveAt = new Date(now);
    await session.save();
    return {
      session: await sessionPayload(user, session),
      refreshCookie: `${session._id}.${next}`,
    };
  }

  /**
   * @param {string} sessionId @param {UserDocument | null} user @param {RequestContext} ctx
   */
  async function signOut(sessionId, user, ctx) {
    await inTransaction(async (txn) => {
      const result = await Session.updateOne(
        { _id: sessionId, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: "signed_out" } },
        { session: txn },
      );
      if (user && result.modifiedCount) {
        await recordAudit(
          {
            actor: staffActor(user),
            places: [user],
            action: "auth.signed_out",
            summary: "Signed out",
            target: { type: "user", id: String(user._id), label: accountLabel(user) },
            source: ctx,
          },
          txn,
        );
      }
    });
  }

  /** Reads the refresh cookie's session id, to sign out without a valid access token. @param {string | undefined} cookie */
  const sessionIdFromCookie = (cookie) => {
    const [id] = (cookie ?? "").split(".");
    return id && mongoose.isValidObjectId(id) ? id : null;
  };

  // ── Signed in ───────────────────────────────────────────────────────

  /** @param {import("mongoose").Types.ObjectId} userId */
  async function me(userId) {
    const user = await User.findById(userId);
    if (!user) throw unauthorized();
    return currentUserView(user, await placeOf(user));
  }

  /**
   * @param {import("mongoose").Types.ObjectId} userId
   * @param {import("mongoose").Types.ObjectId} currentSessionId
   * @param {{ currentPassword: string, newPassword: string }} input
   * @param {RequestContext} ctx
   */
  async function changePassword(userId, currentSessionId, { currentPassword, newPassword }, ctx) {
    const user = await User.findById(userId);
    if (!user) throw unauthorized();
    assertNotLocked(user);
    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      await recordFailure(user, "current password", ctx);
      throw validationError({ currentPassword: "Your current password is not correct." });
    }
    await assertNewPassword(user, newPassword);
    await inTransaction(async (session) => {
      const fresh = await User.findById(userId, null, { session });
      if (!fresh) throw unauthorized();
      fresh.passwordHash = await hashPassword(newPassword);
      fresh.passwordChangedAt = new Date();
      fresh.failedAttempts = 0;
      fresh.authVersion += 1;
      await fresh.save({ session });
      // Every other device signs in again with the new password.
      await Session.updateMany(
        { userId, _id: { $ne: currentSessionId }, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: "account_changed" } },
        { session },
      );
      await recordAudit(
        {
          actor: staffActor(fresh),
          places: [fresh],
          action: "auth.password_changed",
          summary: "Changed their password; other devices signed out",
          target: { type: "user", id: String(fresh._id), label: accountLabel(fresh) },
          source: ctx,
        },
        session,
      );
    });
  }

  /** @param {UserDocument} user @param {string} newPassword */
  async function assertNewPassword(user, newPassword) {
    const problem = passwordProblem(newPassword, {
      name: user.name,
      email: user.email ?? undefined,
      serviceNumber: user.serviceNumber,
    });
    if (problem) throw validationError({ newPassword: problem });
    if (await verifyPassword(user.passwordHash, newPassword)) {
      throw validationError({ newPassword: "Choose a password different from the current one." });
    }
  }

  /** The user's signed-in devices. @param {import("mongoose").Types.ObjectId} userId @param {import("mongoose").Types.ObjectId} currentSessionId */
  async function listSessions(userId, currentSessionId) {
    const sessions = await Session.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
      .sort({ lastActiveAt: -1 })
      .lean();
    return sessions.map((s) => ({
      id: String(s._id),
      current: String(s._id) === String(currentSessionId),
      userAgent: s.userAgent,
      ip: s.ip,
      signedInAt: s.createdAt.toISOString(),
      lastActiveAt: s.lastActiveAt.toISOString(),
    }));
  }

  /** @param {import("mongoose").Types.ObjectId} userId @param {RequestContext} ctx */
  async function signOutEverywhere(userId, ctx) {
    const user = await User.findById(userId);
    if (!user) throw unauthorized();
    await inTransaction(async (session) => {
      await Session.updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: "signed_out_everywhere" } },
        { session },
      );
      await recordAudit(
        {
          actor: staffActor(user),
          places: [user],
          action: "auth.signed_out_everywhere",
          summary: "Signed out on every device",
          target: { type: "user", id: String(user._id), label: accountLabel(user) },
          source: ctx,
        },
        session,
      );
    });
  }

  return {
    signIn,
    verifyMfa,
    setFirstPassword,
    startMfaSetup,
    confirmMfaSetup,
    refresh,
    signOut,
    sessionIdFromCookie,
    me,
    changePassword,
    listSessions,
    signOutEverywhere,
  };
}

/** @typedef {ReturnType<typeof createAuthService>} AuthService */
