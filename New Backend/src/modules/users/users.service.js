// Staff accounts — docs/20 §6 (who manages whom), §9 (passwords and
// two-step sign-in), S5 (no self-administration).
//
// New accounts and password resets get a temporary password, shown once to
// the account manager; the user chooses their own at the next sign-in.
// Changing someone's role, place, password or two-step sign-in ends their
// open sessions, so new permissions apply at once.

import mongoose from "mongoose";
import { managedRoles, roleInfo } from "#src/core/access/roles.js";
import { scopeOf } from "#src/core/access/permissions.js";
import { recordAudit } from "#src/core/audit/audit.js";
import { hashPassword } from "#src/core/auth/passwords.js";
import { temporaryPassword } from "#src/core/auth/temporary-password.js";
import { inTransaction } from "#src/core/db/connection.js";
import { nextNumber } from "#src/core/db/counters.js";
import { conflict, forbidden, notFound, validationError } from "#src/core/errors.js";
import { endAllSessions } from "../auth/index.js";
import { Division, Station } from "../organisation/organisation.model.js";
import { User } from "./user.model.js";
import { canSee, placementProblems, whyCannotManage } from "./users.policy.js";
import { accountView } from "./users.views.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {{ ip: string | null, userAgent: string | null }} RequestContext */
/** @typedef {import("#src/core/access/roles.js").Role} Role */

const escapeRegex = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** @param {Actor} actor */
const auditActor = (actor) => ({
  kind: /** @type {const} */ ("staff"),
  id: actor.userId,
  name: actor.name,
  role: actor.role,
});

/** @param {{ _id: any, name: string, email?: string | null, serviceNumber?: string | null }} u */
const target = (u) => ({
  type: "user",
  id: String(u._id),
  label: u.email ?? u.serviceNumber ?? u.name,
});

/** Station and division names for a set of accounts. @param {any[]} users */
async function placesFor(users) {
  const stationIds = [
    ...new Set(
      users
        .map((u) => u.stationId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const stations = await Station.find(
    { _id: { $in: stationIds } },
    { name: 1, divisionId: 1 },
  ).lean();
  const divisionIds = [
    ...new Set(
      [...users.map((u) => u.divisionId), ...stations.map((s) => s.divisionId)]
        .filter(Boolean)
        .map(String),
    ),
  ];
  const divisions = await Division.find({ _id: { $in: divisionIds } }, { name: 1 }).lean();
  return {
    stations: new Map(
      stations.map((s) => [String(s._id), { name: s.name, divisionId: s.divisionId }]),
    ),
    divisions: new Map(divisions.map((d) => [String(d._id), { name: d.name }])),
  };
}

/** The division of an account's station, for division-level scope checks. @param {any} user */
async function stationDivisionOf(user) {
  if (!user.stationId) return null;
  const s = await Station.findById(user.stationId, { divisionId: 1 }).lean();
  return s?.divisionId ?? null;
}

/** Loads an account the actor may see, or 404 — so others' existence isn't revealed. @param {Actor} actor @param {string} id */
async function loadVisible(actor, id) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Account not found.");
  const user = await User.findById(id);
  if (!user) throw notFound("Account not found.");
  const divisionOfStation = await stationDivisionOf(user);
  if (!canSee(actor, user, divisionOfStation)) throw notFound("Account not found.");
  return { user, divisionOfStation };
}

/** Loads an account the actor may change. @param {Actor} actor @param {string} id */
async function loadManageable(actor, id) {
  const { user, divisionOfStation } = await loadVisible(actor, id);
  const reason = whyCannotManage(actor, user, divisionOfStation);
  if (reason) throw forbidden(reason);
  return user;
}

/** @param {any} user @param {Actor} actor @param {any} divisionOfStation */
async function viewOf(user, actor, divisionOfStation) {
  return accountView(user, await placesFor([user]), {
    manageable: whyCannotManage(actor, user, divisionOfStation) === null,
  });
}

/**
 * Checks and normalises the role and place: station roles keep only a
 * station, division roles only a division, national roles neither.
 * @param {Actor} actor
 * @param {{ role: string, stationId?: string, divisionId?: string }} input
 */
async function resolvePlacement(actor, input) {
  const role = /** @type {Role} */ (input.role);
  const problems = placementProblems(actor, {
    role,
    stationId: input.stationId,
    divisionId: input.divisionId,
  });
  if (problems) throw validationError(problems);
  const level = roleInfo(role).level;
  if (level === "station") {
    const station = await Station.findById(input.stationId, { isActive: 1 }).lean();
    if (!station?.isActive) throw validationError({ stationId: "Choose an active station." });
    return { stationId: station._id, divisionId: null };
  }
  if (level === "division") {
    const division = await Division.findById(input.divisionId, { isActive: 1 }).lean();
    if (!division?.isActive) throw validationError({ divisionId: "Choose an active division." });
    return { stationId: null, divisionId: division._id };
  }
  return { stationId: null, divisionId: null };
}

/** Email and service number must be unique. @param {{ email?: string, serviceNumber?: string }} input @param {any} [exceptId] */
async function assertUnique(input, exceptId) {
  /** @type {Record<string, string>} */
  const fields = {};
  const others = { ...(exceptId ? { _id: { $ne: exceptId } } : {}) };
  if (input.email && (await User.exists({ ...others, email: input.email }))) {
    fields.email = "Another account already uses this email address.";
  }
  if (
    input.serviceNumber &&
    (await User.exists({ ...others, serviceNumber: input.serviceNumber }))
  ) {
    fields.serviceNumber = "Another account already uses this service number.";
  }
  if (Object.keys(fields).length) throw validationError(fields);
}

// ── Reading ─────────────────────────────────────────────────────────────

/**
 * @param {Actor} actor
 * @param {{ q?: string, role?: string, status?: string, stationId?: string, divisionId?: string, page: number, pageSize: number }} query
 */
export async function listAccounts(actor, query) {
  const scope = scopeOf(actor.role, "users.view");
  /** @type {any[]} */
  const and = [];
  if (scope === "S") and.push({ stationId: actor.stationId });
  if (scope === "D") {
    const stationIds = await Station.find({ divisionId: actor.divisionId }).distinct("_id");
    and.push({ $or: [{ divisionId: actor.divisionId }, { stationId: { $in: stationIds } }] });
  }
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), "i");
    and.push({ $or: [{ name: rx }, { email: rx }, { serviceNumber: rx }] });
  }
  if (query.role) and.push({ role: query.role });
  if (query.stationId) and.push({ stationId: query.stationId });
  if (query.divisionId) {
    const stationIds = await Station.find({ divisionId: query.divisionId }).distinct("_id");
    and.push({ $or: [{ divisionId: query.divisionId }, { stationId: { $in: stationIds } }] });
  }
  if (query.status === "active") and.push({ isActive: true });
  if (query.status === "inactive") and.push({ isActive: false });
  if (query.status === "locked") and.push({ isActive: true, lockedUntil: { $gt: new Date() } });

  const filter = and.length ? { $and: and } : {};
  const [rows, total] = await Promise.all([
    User.find(filter)
      .sort({ isActive: -1, name: 1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    User.countDocuments(filter),
  ]);
  const places = await placesFor(rows);
  const items = rows.map((u) => {
    const stationDivision = u.stationId
      ? places.stations.get(String(u.stationId))?.divisionId
      : null;
    return accountView(u, places, {
      manageable: whyCannotManage(actor, u, stationDivision) === null,
    });
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

/** @param {Actor} actor @param {string} id */
export async function getAccount(actor, id) {
  const { user, divisionOfStation } = await loadVisible(actor, id);
  return viewOf(user, actor, divisionOfStation);
}

/** Roles and places the actor may choose when creating or editing. @param {Actor} actor */
export async function accountOptions(actor) {
  const manageScope = scopeOf(actor.role, "users.manage");
  const roles = managedRoles(actor.role).map((key) => ({
    key,
    label: roleInfo(key).label,
    level: roleInfo(key).level,
  }));
  const stationFilter =
    manageScope === "S" ? { _id: actor.stationId, isActive: true } : { isActive: true };
  const [stations, divisions] = await Promise.all([
    Station.find(stationFilter, { name: 1, divisionId: 1 }).sort({ name: 1 }).lean(),
    manageScope === "N"
      ? Division.find({ isActive: true }, { name: 1 }).sort({ name: 1 }).lean()
      : [],
  ]);
  return {
    roles,
    stations: stations.map((s) => ({
      id: String(s._id),
      name: s.name,
      divisionId: s.divisionId ? String(s.divisionId) : null,
    })),
    divisions: divisions.map((d) => ({ id: String(d._id), name: d.name })),
  };
}

// ── Changes ─────────────────────────────────────────────────────────────

/**
 * @param {Actor} actor
 * @param {{ name: string, email?: string, serviceNumber?: string, phone?: string, role: string, stationId?: string, divisionId?: string }} input
 * @param {RequestContext} ctx
 */
export async function createAccount(actor, input, ctx) {
  const place = await resolvePlacement(actor, input);
  await assertUnique(input);
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  const user = await inTransaction(async (session) => {
    const [created] = await User.create(
      [
        {
          name: input.name,
          email: input.email ?? null,
          serviceNumber: input.serviceNumber ?? null,
          phone: input.phone ?? null,
          role: input.role,
          ...place,
          passwordHash,
          mustChangePassword: true,
          createdBy: actor.userId,
        },
      ],
      { session },
    );
    const u = /** @type {NonNullable<typeof created>} */ (created);
    await recordAudit(
      {
        actor: auditActor(actor),
        action: "users.created",
        summary: `Created a ${roleInfo(/** @type {Role} */ (u.role)).label} account for ${u.name}`,
        target: target(u),
        source: ctx,
        places: [actor, u],
      },
      session,
    );
    return u;
  });
  return {
    account: await viewOf(user, actor, await stationDivisionOf(user)),
    temporaryPassword: password,
  };
}

/**
 * @param {Actor} actor @param {string} id
 * @param {{ name: string, email?: string, serviceNumber?: string, phone?: string, role: string, stationId?: string, divisionId?: string }} input
 * @param {RequestContext} ctx
 */
export async function updateAccount(actor, id, input, ctx) {
  const user = await loadManageable(actor, id);
  const place = await resolvePlacement(actor, input);
  await assertUnique(input, user._id);

  const before = {
    role: user.role,
    stationId: String(user.stationId ?? ""),
    divisionId: String(user.divisionId ?? ""),
  };
  const accessChanged =
    before.role !== input.role ||
    before.stationId !== String(place.stationId ?? "") ||
    before.divisionId !== String(place.divisionId ?? "");

  const changed = [];
  if (user.name !== input.name) changed.push("name");
  if ((user.email ?? undefined) !== input.email) changed.push("email");
  if ((user.serviceNumber ?? undefined) !== input.serviceNumber) changed.push("service number");
  if ((user.phone ?? undefined) !== input.phone) changed.push("phone");
  if (before.role !== input.role) changed.push("role");
  if (before.stationId !== String(place.stationId ?? "")) changed.push("station");
  if (before.divisionId !== String(place.divisionId ?? "")) changed.push("division");

  await inTransaction(async (session) => {
    user.name = input.name;
    user.email = input.email ?? null;
    user.serviceNumber = input.serviceNumber ?? null;
    user.phone = input.phone ?? null;
    user.role = input.role;
    user.stationId = place.stationId;
    user.divisionId = place.divisionId;
    if (accessChanged) {
      user.authVersion += 1;
      await endAllSessions(user._id, session);
    }
    await user.save({ session });
    await recordAudit(
      {
        actor: auditActor(actor),
        action: "users.updated",
        summary: changed.length
          ? `Changed ${changed.join(", ")}${accessChanged ? "; signed out to apply the new access" : ""}`
          : "Saved without changes",
        target: target(user),
        source: ctx,
        // Both the old and the new place, when the account moved.
        places: [
          actor,
          user,
          { stationId: before.stationId || null, divisionId: before.divisionId || null },
        ],
      },
      session,
    );
  });
  return viewOf(user, actor, await stationDivisionOf(user));
}

/**
 * Runs one account action in a transaction with its audit entry.
 * @param {Actor} actor @param {string} id @param {RequestContext} ctx
 * @param {string} action
 * @param {(user: import("./user.model.js").UserDocument, session: import("mongoose").ClientSession) => Promise<string>} apply  returns the audit summary
 */
async function act(actor, id, ctx, action, apply) {
  const user = await loadManageable(actor, id);
  await inTransaction(async (session) => {
    const summary = await apply(user, session);
    await user.save({ session });
    await recordAudit(
      {
        actor: auditActor(actor),
        action,
        summary,
        target: target(user),
        source: ctx,
        places: [actor, user],
      },
      session,
    );
  });
  return viewOf(user, actor, await stationDivisionOf(user));
}

/** @param {Actor} actor @param {string} id @param {string} reason @param {RequestContext} ctx */
export function deactivateAccount(actor, id, reason, ctx) {
  return act(actor, id, ctx, "users.deactivated", async (user, session) => {
    if (!user.isActive) throw conflict("already_inactive", "This account is already deactivated.");
    if (user.role === "system_admin") {
      // Two administrators deactivating each other at the same moment would
      // both pass the count below. Touching one shared document makes such
      // changes run one after the other, so the second sees the first.
      await nextNumber("system_admin_changes", session);
      const others = await User.countDocuments(
        { role: "system_admin", isActive: true, _id: { $ne: user._id } },
        { session },
      );
      if (others === 0) {
        throw conflict(
          "last_system_admin",
          "This is the only active system administrator. Create another one first.",
        );
      }
    }
    user.isActive = false;
    user.authVersion += 1;
    await endAllSessions(user._id, session);
    return `Deactivated: ${reason}`;
  });
}

/** @param {Actor} actor @param {string} id @param {RequestContext} ctx */
export function reactivateAccount(actor, id, ctx) {
  return act(actor, id, ctx, "users.reactivated", async (user) => {
    if (user.isActive) throw conflict("already_active", "This account is already active.");
    user.isActive = true;
    user.failedAttempts = 0;
    user.lockedUntil = null;
    return "Reactivated";
  });
}

/**
 * A new temporary password; the user chooses their own at the next sign-in.
 * Also unlocks the account. @param {Actor} actor @param {string} id @param {RequestContext} ctx
 */
export async function resetPassword(actor, id, ctx) {
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  const account = await act(actor, id, ctx, "users.password_reset", async (user, session) => {
    if (!user.isActive) throw conflict("inactive", "Reactivate the account first.");
    user.passwordHash = passwordHash;
    user.mustChangePassword = true;
    user.failedAttempts = 0;
    user.lockedUntil = null;
    user.authVersion += 1;
    await endAllSessions(user._id, session);
    return "Password reset to a temporary one; signed out everywhere";
  });
  return { account, temporaryPassword: password };
}

/** For a lost or new phone. @param {Actor} actor @param {string} id @param {string} reason @param {RequestContext} ctx */
export function resetTwoStep(actor, id, reason, ctx) {
  return act(actor, id, ctx, "users.mfa_reset", async (user, session) => {
    if (!user.mfa?.enabled)
      throw conflict("mfa_off", "Two-step sign-in is not on for this account.");
    user.mfa = /** @type {any} */ ({
      enabled: false,
      secret: null,
      pendingSecret: null,
      lastTimeStep: null,
      recoveryCodeHashes: [],
      enabledAt: null,
    });
    user.authVersion += 1;
    await endAllSessions(user._id, session);
    return `Two-step sign-in reset: ${reason}`;
  });
}

/** @param {Actor} actor @param {string} id @param {RequestContext} ctx */
export function unlockAccount(actor, id, ctx) {
  return act(actor, id, ctx, "users.unlocked", async (user) => {
    if (!user.lockedUntil || user.lockedUntil <= new Date()) {
      throw conflict("not_locked", "This account is not locked.");
    }
    user.lockedUntil = null;
    user.failedAttempts = 0;
    return "Unlocked";
  });
}
