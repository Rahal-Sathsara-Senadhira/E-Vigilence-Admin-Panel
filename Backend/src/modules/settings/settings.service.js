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

// Self-service: name and email only. The station is deliberately not
// editable here — it decides which violations and citations a station
// account can see, so only HQ may change it (via /api/users).
export async function updateProfile(userId, { name, email } = {}) {
  if (!userId) throw new HttpError(401, "Unauthorized");

  const patch = {};
  if (name) patch.name = name;
  if (email) patch.email = email;

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

export const DEFAULT_CITATION_DUE_DAYS = 30;

// Days a citation has to be paid, from the "system" settings — falls back to
// the default when unset.
export async function getCitationDueDays() {
  const doc = await repo.getByKey("system");
  const days = Number(doc?.value?.citation_due_days);
  return Number.isInteger(days) && days > 0 ? days : DEFAULT_CITATION_DUE_DAYS;
}

// Global, not per-user — gated to hq/admin at the route level. Merged into
// the stored value rather than replacing it, so saving one group of
// settings never wipes another.
export async function updateSystem(payload) {
  const next = { ...(payload || {}) };

  if ("citation_due_days" in next) {
    const days = Number(next.citation_due_days);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new HttpError(400, "citation_due_days must be a whole number from 1 to 365");
    }
    next.citation_due_days = days;
  }

  const current = await repo.getByKey("system");
  const saved = await repo.upsert("system", { ...(current?.value || {}), ...next });
  return saved.value;
}
