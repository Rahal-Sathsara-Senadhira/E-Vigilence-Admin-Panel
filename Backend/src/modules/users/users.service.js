import { userRepo } from "./users.repository.js";
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
const STAFF_ROLES = new Set(["hq", "station_admin", "station_officer"]);
function isStaffAccount(user) {
  return !!user && STAFF_ROLES.has(user.role);
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
  let role = payload.role ?? "user";
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

  if (!name || !email) {
    const err = new Error("name and email are required");
    err.status = 400;
    throw err;
  }

  // if password not provided, create a random one (still valid hash)
  const safePassword = plainPassword || `Temp@${Math.random().toString(36).slice(2, 10)}`;
  const password_hash = hashPassword(safePassword);

  const created = await userRepo.create({
    name,
    email,
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
    if (payload.role) patch.role = payload.role;
    if (payload.stationId || payload.station_id) {
      patch.stationId = payload.stationId ?? payload.station_id;
    }
  }

  const updated = await userRepo.updateById(id, patch);
  return normalizeOutgoingUser(updated);
}

export async function deleteUser(id, caller) {
  const target = await userRepo.findById(id);
  if (!isStaffAccount(target)) return false;

  if (isStationAdmin(caller)) assertOwnStationOfficer(caller, target);

  return userRepo.deleteById(id);
}