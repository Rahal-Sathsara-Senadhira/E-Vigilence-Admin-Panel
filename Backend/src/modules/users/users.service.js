import mongoose from "mongoose";
import { userRepo } from "./users.repository.js";
import User from "../../db/providers/mongo/models/User.js";
import PoliceStation from "../../db/providers/mongo/models/PoliceStation.js";
import { hashPassword } from "../../utils/password.js";
import { HttpError } from "../../utils/httpError.js";

// A station_admin only manages station_officer accounts within their own
// station — hq keeps unrestricted access. Enforced here rather than in the
// route so every entry point (list/get/create/update/delete) applies it.
function isStationAdmin(caller) {
  return caller?.role === "station_admin";
}

// The `users` collection is shared with the separate citizen-reporting app
// (role: "user", no `password_hash`) — userRepo.findById looks up by id
// directly, bypassing findMany's STAFF_ROLES filter, so id-scoped actions
// need their own guard against ever touching a citizen account.
const STAFF_ROLES = new Set(["dev", "hq", "station_officer"]);
function isStaffAccount(user) {
  return !!user && STAFF_ROLES.has(user.role);
}

// Only real staff roles can be assigned: dev, hq, station_officer
const STATION_ROLES = new Set(["station_officer"]);

function assertAssignableRole(role) {
  if (!STAFF_ROLES.has(role)) {
    throw new HttpError(400, `role must be one of: ${Array.from(STAFF_ROLES).join(", ")}`);
  }
}

// Station roles need a real, active station; Dev and HQ accounts carry none.
// Returns the stationId to store.
async function resolveStationForRole(role, stationId) {
  if (!STATION_ROLES.has(role)) return null;

  if (!stationId || !mongoose.Types.ObjectId.isValid(String(stationId))) {
    throw new HttpError(400, "A station account needs a valid stationId");
  }
  const station = await PoliceStation.findById(stationId).select("isActive").lean();
  if (!station || station.isActive === false) {
    throw new HttpError(400, "stationId must be an existing, active police station");
  }
  return stationId;
}

// Refuses a change that would leave the system with no active HQ/Dev account —
// nobody could then manage users, stations or the catalog.
async function assertNotLastActiveHq(target) {
  if ((target.role !== "hq" && target.role !== "dev") || target.isActive === false) return;

  const otherActiveAdmin = await User.countDocuments({
    _id: { $ne: target._id },
    role: { $in: ["hq", "dev"] },
    isActive: true,
  });
  if (otherActiveAdmin === 0) {
    throw new HttpError(409, "This is the last active admin account — add another admin/dev user first");
  }
}

function assertOwnStationOfficer(caller, target) {
  if (
    !target ||
    String(target.stationId || "") !== String(caller.stationId || "") ||
    target.role !== "station_officer"
  ) {
    throw new HttpError(403, "Forbidden");
  }
}

// Stored trimmed and uppercase (old-format NICs end in V/X) so
// "880850401v" and "880850401V" can't become two different staff accounts.
function normalizeNic(input) {
  const nic = String(input ?? "").trim().toUpperCase();
  return nic || null;
}

function normalizeOutgoingUser(u) {
  if (!u) return u;

  // support both raw mongo doc and lean objects
  const id = u._id?.toString?.() || u.id || u._id || null;

  // normalize naming differences
  const name = u.name ?? u.full_name ?? "";
  const full_name = u.full_name ?? u.name ?? "";

  const stationId = u.stationId ?? u.station_id ?? u.station ?? null;
  const isActive = typeof u.isActive === "boolean" ? u.isActive : (typeof u.is_active === "boolean" ? u.is_active : true);

  return {
    id,
    _id: id, // helpful for some frontends
    name,
    full_name,
    email: u.email ?? "",
    nic: u.nic ?? null,
    role: u.role ?? "user",
    stationId,
    station_id: stationId,
    isActive,
    is_active: isActive,
    createdAt: u.createdAt ?? null,
    updatedAt: u.updatedAt ?? null,
  };
}

export async function listUsers(query = {}, caller) {
  // Basic filters (optional)
  const { role, isActive, stationId, q } = query;

  const filters = {};
  if (role) filters.role = role;
  if (typeof isActive !== "undefined") {
    if (isActive === "true" || isActive === true) filters.isActive = true;
    if (isActive === "false" || isActive === false) filters.isActive = false;
  }
  if (stationId) filters.stationId = stationId;
  if (q) filters.q = q;

  // station_admin can never see users outside their own station, regardless
  // of what was requested.
  if (isStationAdmin(caller)) filters.stationId = caller.stationId;

  const users = await userRepo.findMany(filters);
  return users.map(normalizeOutgoingUser);
}

export async function getUserById(id, caller) {
  const user = await userRepo.findById(id);
  if (!user || !isStaffAccount(user)) return null;

  if (isStationAdmin(caller)) assertOwnStationOfficer(caller, user);

  return normalizeOutgoingUser(user);
}

export async function createUser(payload, caller) {
  // Accept BOTH styles from frontend:
  // - name / stationId / isActive
  // - full_name / station_id / is_active
  const name = payload.name ?? payload.full_name;
  const email = payload.email;
  let role = payload.role;
  let stationId = payload.stationId ?? payload.station_id ?? null;
  const isActive = typeof payload.isActive === "boolean" ? payload.isActive : (typeof payload.is_active === "boolean" ? payload.is_active : true);

  // station_admin can only create station_officer accounts under their own
  // station — never another admin, never an hq account, never another station.
  if (isStationAdmin(caller)) {
    role = "station_officer";
    stationId = caller.stationId;
  }

  // password
  const plainPassword =
    payload.password ??
    payload.password_plain ??
    payload.passwordPlain ??
    null;

  // Required because the shared `users` collection has a unique index on
  // `nic` (see models/User.js) — a staff account without one can't be saved.
  const nic = normalizeNic(payload.nic);

  if (!name || !email || !nic) {
    throw new HttpError(400, "name, email and NIC are required");
  }

  assertAssignableRole(role);
  stationId = await resolveStationForRole(role, stationId);

  // if password not provided, create a random one (still valid hash)
  const safePassword = plainPassword || `Temp@${Math.random().toString(36).slice(2, 10)}`;
  const password_hash = hashPassword(safePassword);

  const created = await userRepo.create({
    name,
    email,
    nic,
    role,
    stationId,
    isActive,
    password_hash,
  });

  return normalizeOutgoingUser(created);
}

export async function updateUser(id, payload, caller) {
  const target = await userRepo.findById(id);
  if (!isStaffAccount(target)) return null;

  if (isStationAdmin(caller)) assertOwnStationOfficer(caller, target);

  const patch = {};

  if (payload.name || payload.full_name) patch.name = payload.name ?? payload.full_name;
  if (payload.email) patch.email = payload.email;
  if (normalizeNic(payload.nic)) patch.nic = normalizeNic(payload.nic);

  if (typeof payload.isActive === "boolean") patch.isActive = payload.isActive;
  if (typeof payload.is_active === "boolean") patch.isActive = payload.is_active;

  if (payload.password || payload.password_plain || payload.passwordPlain) {
    const plain = payload.password ?? payload.password_plain ?? payload.passwordPlain;
    patch.password_hash = hashPassword(plain);
  }

  // Only hq may move a user between stations or change their role — a
  // station_admin's target is already pinned to station_officer/own-station
  // by the check above, and must stay that way.
  if (!isStationAdmin(caller)) {
    const nextRole = payload.role || target.role;
    assertAssignableRole(nextRole);

    const requestedStation = payload.stationId ?? payload.station_id;
    const nextStation = requestedStation !== undefined ? requestedStation : target.stationId;

    // The edit form re-sends stationId every time; only validate when the
    // role or station actually changes, so e.g. deactivating a user of a
    // since-deactivated station still works.
    const stationChanged = String(nextStation || "") !== String(target.stationId || "");
    if (nextRole !== target.role) patch.role = nextRole;
    if (nextRole !== target.role || stationChanged) {
      patch.stationId = await resolveStationForRole(nextRole, nextStation);
    }
  }

  const isSelf = String(target._id) === String(caller?.id);
  const deactivating = patch.isActive === false && target.isActive !== false;
  const leavingHq = patch.role && patch.role !== "hq" && target.role === "hq";

  if (isSelf && (deactivating || leavingHq)) {
    throw new HttpError(409, "You can't deactivate your own account or change your own role");
  }
  if (deactivating || leavingHq) await assertNotLastActiveHq(target);

  const updated = await userRepo.updateById(id, patch);
  return normalizeOutgoingUser(updated);
}

export async function deleteUser(id, caller) {
  const target = await userRepo.findById(id);
  if (!isStaffAccount(target)) return false;

  if (isStationAdmin(caller)) assertOwnStationOfficer(caller, target);

  if (String(target._id) === String(caller?.id)) {
    throw new HttpError(409, "You can't delete your own account");
  }
  await assertNotLastActiveHq(target);

  return userRepo.deleteById(id);
}