import repo from "./settings.repository.js";
import { userRepo } from "../users/users.repository.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
import { HttpError } from "../../utils/httpError.js";

export async function list() {
  return repo.list();
}

export async function getByKey(key) {
  return repo.getByKey(key);
}

export async function upsert(key, value) {
  return repo.upsert(key, value);
}

// The bundle the Settings page actually renders: the caller's own profile,
// their saved preferences, and the (global) system settings.
export async function getSettingsForUser(userId) {
  const [user, preferencesDoc, systemDoc] = await Promise.all([
    userId ? userRepo.findById(userId) : null,
    userId ? repo.getByKey(`preferences:${userId}`) : null,
    repo.getByKey("system"),
  ]);

  return {
    profile: user
      ? {
          name: user.name,
          email: user.email,
          role: user.role,
          station_id: user.stationId ? String(user.stationId) : "",
        }
      : null,
    preferences: preferencesDoc?.value || null,
    system: systemDoc?.value || null,
  };
}

export async function updateProfile(userId, { name, email, station_id } = {}) {
  if (!userId) throw new HttpError(401, "Unauthorized");

  const patch = {};
  if (name) patch.name = name;
  if (email) patch.email = email;
  if (station_id !== undefined) patch.stationId = station_id || null;

  const updated = await userRepo.updateById(userId, patch);
  if (!updated) throw new HttpError(404, "User not found");

  return {
    name: updated.name,
    email: updated.email,
    station_id: updated.stationId ? String(updated.stationId) : "",
  };
}

export async function updateAvatar(userId, avatarUrl) {
  if (!userId) throw new HttpError(401, "Unauthorized");

  const updated = await userRepo.updateById(userId, { avatarUrl });
  if (!updated) throw new HttpError(404, "User not found");

  return { avatarUrl: updated.avatarUrl };
}

export async function changePassword(userId, { current_password, new_password } = {}) {
  if (!userId) throw new HttpError(401, "Unauthorized");
  if (!current_password || !new_password) {
    throw new HttpError(400, "current_password and new_password are required");
  }
  if (String(new_password).length < 6) {
    throw new HttpError(400, "New password must be at least 6 characters");
  }

  const user = await userRepo.findById(userId);
  if (!user) throw new HttpError(404, "User not found");

  const ok = verifyPassword(String(current_password), user.password_hash);
  if (!ok) throw new HttpError(401, "Current password is incorrect");

  await userRepo.updateById(userId, {
    password_hash: hashPassword(String(new_password)),
  });

  return { ok: true };
}

export async function updatePreferences(userId, payload) {
  if (!userId) throw new HttpError(401, "Unauthorized");
  const saved = await repo.upsert(`preferences:${userId}`, payload || {});
  return saved.value;
}

// Global, not per-user — gated to hq/admin at the route level.
export async function updateSystem(payload) {
  const saved = await repo.upsert("system", payload || {});
  return saved.value;
}
