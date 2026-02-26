import { userRepo } from "./users.repository.js";
import { hashPassword } from "../../utils/password.js";

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

export async function listUsers(query = {}) {
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

  const users = await userRepo.findMany(filters);
  return users.map(normalizeOutgoingUser);
}

export async function getUserById(id) {
  const user = await userRepo.findById(id);
  return normalizeOutgoingUser(user);
}

export async function createUser(payload) {
  // Accept BOTH styles from frontend:
  // - name / stationId / isActive
  // - full_name / station_id / is_active
  const name = payload.name ?? payload.full_name;
  const email = payload.email;
  const role = payload.role ?? "user";
  const stationId = payload.stationId ?? payload.station_id ?? null;
  const isActive = typeof payload.isActive === "boolean" ? payload.isActive : (typeof payload.is_active === "boolean" ? payload.is_active : true);

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

export async function updateUser(id, payload) {
  const patch = {};

  if (payload.name || payload.full_name) patch.name = payload.name ?? payload.full_name;
  if (payload.email) patch.email = payload.email;
  if (payload.role) patch.role = payload.role;

  if (payload.stationId || payload.station_id) patch.stationId = payload.stationId ?? payload.station_id;

  if (typeof payload.isActive === "boolean") patch.isActive = payload.isActive;
  if (typeof payload.is_active === "boolean") patch.isActive = payload.is_active;

  if (payload.password || payload.password_plain || payload.passwordPlain) {
    const plain = payload.password ?? payload.password_plain ?? payload.passwordPlain;
    patch.password_hash = hashPassword(plain);
  }

  const updated = await userRepo.updateById(id, patch);
  return normalizeOutgoingUser(updated);
}

export async function deleteUser(id) {
  return userRepo.deleteById(id);
}